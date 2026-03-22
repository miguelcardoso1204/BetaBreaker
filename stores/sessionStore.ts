/**
 * Session Store — Active Climbing Session State with Zustand
 *
 * This store holds the ephemeral client-side state for an active climbing
 * session: whether the user is currently at a gym, when they started/stopped,
 * how long they've been climbing, and a queue of ascent logs waiting to be
 * submitted to the database.
 *
 * WHY ZUSTAND?
 * Session state is purely client-side and ephemeral — it doesn't need to
 * survive app restarts. The actual session record gets persisted to Supabase
 * via the sessions service (Step 5.2), but this store drives the UI: showing
 * the active timer, the pending log count badge, and the QuickLog bottom sheet.
 *
 * WHY PENDING LOGS?
 * During a session, the climber taps "Log Ascent" multiple times. Each tap
 * creates a PendingLog in this store. When the session ends (or the user taps
 * "Save"), all pending logs are flushed to the database in one batch. This
 * lets climbers review/edit/remove logs before committing them — like a
 * shopping cart for ascents.
 *
 * HOW IT CONNECTS:
 * 1. Start Session modal → `startSession(gymId)` → timer begins
 * 2. QuickLog bottom sheet → `addPendingLog(log)` → badge count updates
 * 3. End session → `endSession()` → duration computed → service flushes logs
 * 4. After flush → `reset()` → store returns to idle state
 */

import { create } from "zustand";
import type { AscentStatus } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────────────

/**
 * A single ascent log waiting to be submitted to the database.
 *
 * These live in the store until the session ends or the user manually saves.
 * Each log gets a client-generated UUID so it can be individually removed
 * (e.g., if the climber made a mistake and wants to undo a log).
 */
export interface PendingLog {
  /** Client-generated UUID — used for remove-by-ID operations. */
  id: string;
  /** The route that was climbed (references routes.id in the database). */
  routeId: string;
  /** How the attempt ended: flash (first try), send (completed), or attempt (fell). */
  status: AscentStatus;
  /** Number of attempts on this route (must be ≥ 1). */
  attempts: number;
  /** Optional free-text notes about the climb (beta tips, conditions, etc.). */
  notes?: string;
}

/** The full store shape: session state + pending logs + actions. */
interface SessionState {
  /** Whether the climber currently has an active session running. */
  isActive: boolean;
  /** When the session started (ms since epoch via Date.now()), null if no session. */
  startTime: number | null;
  /** When the session ended (ms since epoch), null if still active or no session. */
  endTime: number | null;
  /** Which gym this session is at (references gyms.id), null if no session. */
  gymId: string | null;
  /** Ascent logs queued during the session, waiting to be flushed to the DB. */
  pendingLogs: PendingLog[];
  /** Session duration in whole minutes, computed when endSession() is called. */
  duration: number;
  /** Currently selected route ID for in-tab session navigation. Set when the
   *  user taps a route in session-routes, read by session-route-detail and
   *  session-ascent screens. Null when no route is selected. */
  selectedRouteId: string | null;
  /** Database UUID for the persisted session row. Set asynchronously after
   *  the INSERT succeeds — null until then and during idle state. Used to
   *  link ascents to their parent session via route_ascents.session_id. */
  sessionId: string | null;

  // ── Actions ──────────────────────────────────────────────────

  /**
   * Begin a new climbing session at the given gym.
   * Clears any leftover state from a previous session so the store is fresh.
   */
  startSession: (gymId: string) => void;

  /**
   * End the current session. Sets endTime to now and computes duration
   * as the difference between endTime and startTime in whole minutes.
   */
  endSession: () => void;

  /** Append a new ascent log to the pending queue. */
  addPendingLog: (log: PendingLog) => void;

  /** Remove a pending log by its client-generated ID (undo functionality). */
  removePendingLog: (id: string) => void;

  /** Set the currently selected route for in-tab detail/ascent navigation. */
  setSelectedRouteId: (id: string | null) => void;

  /** Store the database session ID after the async INSERT completes.
   *  Called by the useSession hook's startSessionMutation onSuccess. */
  setSessionId: (id: string) => void;

  /** Reset the entire store back to its initial idle state. */
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────

/**
 * The default "idle" state — no active session, no pending logs.
 * Extracted as a constant so `reset()` can reuse it without duplication.
 */
const INITIAL_STATE = {
  isActive: false,
  startTime: null as number | null,
  endTime: null as number | null,
  gymId: null as string | null,
  pendingLogs: [] as PendingLog[],
  duration: 0,
  selectedRouteId: null as string | null,
  sessionId: null as string | null,
};

// ── Store ────────────────────────────────────────────────────────

/**
 * Zustand store for the active climbing session.
 *
 * Usage in a component:
 * ```ts
 * const isActive = useSessionStore((s) => s.isActive);
 * const startSession = useSessionStore((s) => s.startSession);
 * const pendingCount = useSessionStore((s) => s.pendingLogs.length);
 * ```
 *
 * Zustand's `create()` takes a function that receives `set` and `get`:
 *   - `set` merges partial state into the store (triggers re-renders)
 *   - `get` reads current state without subscribing (useful inside actions)
 */
export const useSessionStore = create<SessionState>((set, get) => ({
  ...INITIAL_STATE,

  startSession: (gymId: string) => {
    // Starting a session clears any leftover state from a previous session
    // (endTime, pendingLogs, duration) so we start completely fresh.
    // Only startTime and gymId are set; everything else resets to defaults.
    // sessionId is cleared here because the DB INSERT is async —
    // it will be set later via setSessionId() once the mutation succeeds.
    set({
      isActive: true,
      startTime: Date.now(),
      endTime: null,
      gymId,
      pendingLogs: [],
      duration: 0,
      sessionId: null,
    });
  },

  endSession: () => {
    const { startTime } = get();
    const endTime = Date.now();

    // Compute duration in whole minutes. Math.round() handles sessions that
    // end mid-minute (e.g., 45.7 min → 46 min). If startTime is somehow
    // null (endSession called without startSession), duration stays 0.
    const duration = startTime
      ? Math.round((endTime - startTime) / 60000)
      : 0;

    set({
      isActive: false,
      endTime,
      duration,
    });
  },

  addPendingLog: (log: PendingLog) => {
    // Spread creates a new array so React detects the state change.
    // New logs go at the end (chronological order).
    set((state) => ({
      pendingLogs: [...state.pendingLogs, log],
    }));
  },

  removePendingLog: (id: string) => {
    // Filter creates a new array without the target log. If the ID doesn't
    // match anything, the array is unchanged (no-op, harmless).
    set((state) => ({
      pendingLogs: state.pendingLogs.filter((log) => log.id !== id),
    }));
  },

  setSelectedRouteId: (id: string | null) => {
    set({ selectedRouteId: id });
  },

  setSessionId: (id: string) => {
    set({ sessionId: id });
  },

  reset: () => {
    // Spread INITIAL_STATE to return to the idle state without replacing
    // the action functions (Zustand merges by default, not replaces).
    set({ ...INITIAL_STATE });
  },
}));
