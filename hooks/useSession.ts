/**
 * useSession Hook — The Primary API for Tick-Logging Screens
 *
 * This hook is the single import that screens need for climbing session
 * management. It coordinates three systems:
 *
 *   1. **Zustand sessionStore** — ephemeral client state: timer, pending logs.
 *      Drives the UI (timer display, pending log count badge, QuickLog sheet).
 *
 *   2. **sessionsService** — persists ascents to Supabase's `route_ascents`
 *      table. The service is a thin PostgREST wrapper; the hook adds auth
 *      context (userId) and error handling.
 *
 *   3. **TanStack Query cache** — invalidated after mutations so any screen
 *      displaying session history or logbook data re-fetches automatically.
 *
 * WHY A COMBINED HOOK?
 * Screens shouldn't need to know about the store vs. service distinction.
 * `useSession()` returns both store state (isActive, pendingLogs) and
 * mutations (logAscent, deleteAscent) in one object. This is similar to
 * how `useAuth()` combines auth state + actions.
 *
 * OPTIMISTIC UPDATES:
 * When the user logs an ascent, we immediately add a PendingLog to the
 * Zustand store (via onMutate) so the UI updates instantly. If the service
 * call fails, onError removes the pending log (rollback). This pattern
 * matches the optimistic toggle in useSavedRoutes, but uses the Zustand
 * store instead of TanStack Query's cache for the optimistic state.
 *
 * Downstream consumers: QuickLog bottom sheet (5.4), Session Timer/Summary
 * (5.5), Full Ascent Form (5.8).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSessionStore } from "@/stores/sessionStore";
import { sessionsService } from "@/services/sessions.service";
import type { AscentStatus } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────────────────

/**
 * Input shape for the logAscent mutation.
 *
 * Intentionally omits `userId` — the hook injects it from useAuth so
 * screens don't need to pass it. This prevents bugs where a screen
 * accidentally passes a stale or wrong user ID.
 */
export interface LogAscentInput {
  /** Which route was climbed (references routes.id). */
  routeId: string;
  /** Outcome: flash (first try), send (completed), or attempt (fell). */
  status: AscentStatus;
  /** Number of attempts on this route (must be ≥ 1). */
  attempts: number;
  /** Optional free-text notes (beta tips, conditions, etc.). */
  notes?: string;
  /** User's perceived difficulty as a canonical grade integer (0–30). */
  perceivedGrade?: number;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useSession() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Store state via individual selectors ───────────────────────
  // Each selector subscribes to only one piece of state, so components
  // using this hook only re-render when the specific value they read
  // changes. This is Zustand's recommended pattern for performance —
  // a single `useSessionStore()` call (no selector) would re-render
  // on ANY state change in the store.
  const isActive = useSessionStore((s) => s.isActive);
  const startTime = useSessionStore((s) => s.startTime);
  const endTime = useSessionStore((s) => s.endTime);
  const gymId = useSessionStore((s) => s.gymId);
  const pendingLogs = useSessionStore((s) => s.pendingLogs);
  const duration = useSessionStore((s) => s.duration);

  // ── Store actions ──────────────────────────────────────────────
  // Actions are stable references (they never change) so selecting
  // them individually doesn't cause unnecessary re-renders.
  const startSession = useSessionStore((s) => s.startSession);
  const endSession = useSessionStore((s) => s.endSession);
  const reset = useSessionStore((s) => s.reset);

  // ── logAscent mutation ─────────────────────────────────────────
  // Uses optimistic updates via the Zustand store: a PendingLog is
  // added immediately in onMutate, then removed on error (rollback).
  // The mutation function calls sessionsService.createAscent with the
  // authenticated user's ID injected automatically.
  const logAscent = useMutation({
    mutationFn: async (input: LogAscentInput) => {
      if (!user?.id) {
        throw new Error("Must be logged in to log ascents");
      }

      // Call the service with userId injected from useAuth.
      // The service maps camelCase fields to snake_case DB columns.
      const result = await sessionsService.createAscent({
        userId: user.id,
        routeId: input.routeId,
        status: input.status,
        attempts: input.attempts,
        notes: input.notes,
        perceivedGrade: input.perceivedGrade,
      });

      // Service returns { data, error } from PostgREST. Throw on error
      // so TanStack Query's onError callback fires for rollback.
      if (result.error) throw result.error;
      return result.data;
    },

    onMutate: (input: LogAscentInput) => {
      // Optimistic update: add a PendingLog to the Zustand store
      // immediately so the UI shows the new log before the server
      // responds. We use getState() instead of the selector because
      // onMutate runs outside the React render cycle.
      const pendingLogId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      useSessionStore.getState().addPendingLog({
        id: pendingLogId,
        routeId: input.routeId,
        status: input.status,
        attempts: input.attempts,
        notes: input.notes,
      });

      // Return context for rollback in onError
      return { pendingLogId };
    },

    onError: (_error, _input, context) => {
      // Rollback: remove the optimistic PendingLog from the store.
      // This runs when the service call fails (network error, RLS
      // violation, etc.), reverting the UI to its pre-mutation state.
      if (context?.pendingLogId) {
        useSessionStore.getState().removePendingLog(context.pendingLogId);
      }
    },

    onSettled: () => {
      // After success or error, invalidate the sessions query key family
      // so any screen showing session history/logbook re-fetches fresh data.
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  // ── deleteAscent mutation ──────────────────────────────────────
  // Simple mutation with no optimistic update — the logbook screen
  // can show a loading indicator while the delete processes. Cache
  // invalidation ensures the list re-fetches after deletion.
  const deleteAscent = useMutation({
    mutationFn: async (ascentId: string) => {
      const result = await sessionsService.deleteAscent(ascentId);
      if (result.error) throw result.error;
      return result.data;
    },

    onSettled: () => {
      // Invalidate the same query key family as logAscent so all
      // session-related screens stay in sync after a deletion.
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  // ── Return value ───────────────────────────────────────────────
  // Everything a screen needs in one object: store state, store
  // actions, and TanStack Query mutations. Screens never import
  // the store or service directly.
  return {
    // Store state
    isActive,
    startTime,
    endTime,
    gymId,
    pendingLogs,
    duration,

    // Store actions
    startSession,
    endSession,
    reset,

    // Mutations (TanStack Query)
    logAscent,
    deleteAscent,
  };
}
