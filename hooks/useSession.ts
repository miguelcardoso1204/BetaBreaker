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
  /** Quality/enjoyment rating (1–5 stars). Undefined means not rated. */
  rating?: number;
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
  const sessionId = useSessionStore((s) => s.sessionId);

  // ── Store actions ──────────────────────────────────────────────
  // Actions are stable references (they never change) so selecting
  // them individually doesn't cause unnecessary re-renders.
  const storeStartSession = useSessionStore((s) => s.startSession);
  const storeEndSession = useSessionStore((s) => s.endSession);
  const reset = useSessionStore((s) => s.reset);

  // ── startSessionMutation ──────────────────────────────────────
  // Persists the session to the database. Called after the Zustand
  // store is updated (for immediate UI) — the DB INSERT is async.
  // On success, stores the returned session UUID so ascents can be
  // linked to it via route_ascents.session_id.
  const startSessionMutation = useMutation({
    mutationFn: async ({ gymId: gId }: { gymId: string }) => {
      if (!user?.id) throw new Error("Must be logged in to start a session");
      const result = await sessionsService.createSession(user.id, gId);
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (data) => {
      // Store the DB-generated session UUID in Zustand so subsequent
      // logAscent calls can include it as session_id.
      useSessionStore.getState().setSessionId(data.id);
    },
  });

  // ── endSessionMutation ──────────────────────────────────────
  // Persists the session end time and duration to the database.
  // Called after the Zustand store computes the duration.
  const endSessionMutation = useMutation({
    mutationFn: async ({ sessionId: sId, durationMinutes }: { sessionId: string; durationMinutes: number }) => {
      const result = await sessionsService.endSession(sId, durationMinutes);
      if (result.error) throw result.error;
      return result.data;
    },
    onSettled: () => {
      // Invalidate session queries so the profile's "Recent Sessions"
      // section re-fetches with the newly completed session.
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  // ── Combined session start/end handlers ─────────────────────
  // These coordinate the Zustand store (immediate UI) with the
  // async database mutations (persistence). Screens call these
  // instead of the raw store actions.

  /**
   * Start a session: update the store immediately for the timer UI,
   * then fire an async mutation to persist the session to the DB.
   */
  const startSession = (gId: string) => {
    storeStartSession(gId);
    startSessionMutation.mutate({ gymId: gId });
  };

  /**
   * End a session: compute duration in the store, then persist to DB.
   * If no sessionId exists (mutation didn't complete), only the store
   * is updated — the session won't be saved to the DB.
   */
  const endSession = () => {
    storeEndSession();
    const state = useSessionStore.getState();
    if (state.sessionId) {
      endSessionMutation.mutate({
        sessionId: state.sessionId,
        durationMinutes: state.duration,
      });
    }
  };

  // ── logAscent mutation ─────────────────────────────────────────
  // Uses optimistic updates via the Zustand store: a PendingLog is
  // added immediately in onMutate, then removed on error (rollback).
  // The mutation function calls sessionsService.createAscent with the
  // authenticated user's ID and the active session's ID injected.
  const logAscent = useMutation({
    mutationFn: async (input: LogAscentInput) => {
      if (!user?.id) {
        throw new Error("Must be logged in to log ascents");
      }

      // Read sessionId from the store — may be null if no session is
      // active or if the createSession mutation hasn't completed yet.
      const currentSessionId = useSessionStore.getState().sessionId;

      // Call the service with userId and sessionId injected.
      const result = await sessionsService.createAscent({
        userId: user.id,
        routeId: input.routeId,
        status: input.status,
        attempts: input.attempts,
        notes: input.notes,
        perceivedGrade: input.perceivedGrade,
        rating: input.rating,
        sessionId: currentSessionId ?? undefined,
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
    sessionId,

    // Combined actions (store + DB persistence)
    startSession,
    endSession,
    reset,

    // Mutations (TanStack Query)
    logAscent,
    deleteAscent,
  };
}
