/**
 * Offline Queue Store — Zustand + SQLite Dual-Write
 *
 * This store manages the queue of user actions taken while offline. It follows
 * a dual-write pattern: every mutation updates BOTH the in-memory Zustand state
 * AND the on-disk SQLite database (via lib/offlineDb). This ensures:
 *
 *   1. Fast reads — UI components read from the in-memory queue (no DB queries)
 *   2. Durability — if the app crashes or is force-closed, actions survive in SQLite
 *   3. Hydration — on app startup, `hydrate()` loads the SQLite queue into memory
 *
 * HOW IT CONNECTS:
 *   - User taps "Log Ascent" while offline → `enqueue('log_ascent', { routeId, ... })`
 *   - App restarts → root layout calls `hydrate()` → pending actions restored
 *   - Network returns → sync engine (Step 6.3) calls `getAll()`, replays each action,
 *     then `dequeue(id)` on success or `incrementRetry(id)` on failure
 *
 * WHY DUAL-WRITE INSTEAD OF SQLITE-ONLY?
 * Reading from SQLite on every render would be slow and awkward with React's
 * render cycle. Zustand gives us reactive subscriptions (components re-render
 * when the queue changes) while SQLite gives us crash-safe persistence.
 * The tradeoff is that we must keep both in sync — every write goes to both.
 *
 * ID FORMAT: 'offline-<timestamp>-<random>' — the prefix makes it easy to
 * identify offline-generated IDs vs. server-generated UUIDs in logs/debugging.
 */

import { create } from 'zustand';
import {
  insertQueueItem,
  deleteQueueItem,
  getAllQueueItems,
  incrementRetryCount as dbIncrementRetryCount,
} from '@/lib/offlineDb';

// ── Types ────────────────────────────────────────────────────────

/**
 * A single offline action in the queue (camelCase for JS conventions).
 *
 * This is the in-memory representation. When persisting to SQLite,
 * field names are mapped to snake_case (see enqueue/hydrate).
 */
export interface OfflineAction {
  /** Unique ID with 'offline-' prefix for easy identification. */
  id: string;
  /** What operation to replay: 'log_ascent', 'delete_ascent', etc. */
  actionType: string;
  /** The action's data — route ID, ascent status, etc. Flexible shape per action type. */
  payload: Record<string, unknown>;
  /** ISO 8601 timestamp of when the action was queued. */
  createdAt: string;
  /** How many times the sync engine has tried (and failed) to replay this action. */
  retryCount: number;
}

/** Full store shape: queue state + actions. */
interface OfflineState {
  /** In-memory queue of pending offline actions, ordered by creation time (FIFO). */
  queue: OfflineAction[];

  /**
   * Add a new action to the offline queue.
   * Writes to both Zustand state and SQLite for durability.
   * @returns The generated ID for the queued action.
   */
  enqueue: (actionType: string, payload: Record<string, unknown>) => string;

  /**
   * Remove a completed action from the queue (after successful sync).
   * Removes from both Zustand state and SQLite.
   * No-op if the ID doesn't exist (safe to call multiple times).
   */
  dequeue: (id: string) => void;

  /**
   * Get all queued actions. Convenience accessor that returns the current
   * in-memory queue without hitting SQLite.
   */
  getAll: () => OfflineAction[];

  /**
   * Increment the retry count for a failed action.
   * Updates both Zustand state and SQLite.
   * No-op if the ID doesn't exist.
   */
  incrementRetry: (id: string) => void;

  /**
   * Load the SQLite queue into memory on app startup.
   * Parses JSON payloads and maps snake_case DB columns to camelCase.
   * Should be called once in the root layout's useEffect.
   */
  hydrate: () => void;
}

// ── Store ────────────────────────────────────────────────────────

export const useOfflineStore = create<OfflineState>((set, get) => ({
  queue: [],

  enqueue: (actionType: string, payload: Record<string, unknown>): string => {
    // Generate a unique ID with a recognizable prefix. The timestamp component
    // provides rough ordering, and the random suffix prevents collisions if
    // two actions are queued in the same millisecond.
    const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const createdAt = new Date().toISOString();

    const action: OfflineAction = {
      id,
      actionType,
      payload,
      createdAt,
      retryCount: 0,
    };

    // Dual-write: persist to SQLite first (crash-safe), then update in-memory.
    // If SQLite fails, the action won't be in memory either (consistent state).
    insertQueueItem({
      id,
      action_type: actionType,
      payload: JSON.stringify(payload),
      created_at: createdAt,
      retry_count: 0,
    });

    // Append to the end of the queue (maintains FIFO order by creation time).
    set((state) => ({
      queue: [...state.queue, action],
    }));

    return id;
  },

  dequeue: (id: string) => {
    // Check if the action exists before hitting SQLite — avoids unnecessary
    // DB operations for non-existent IDs (defensive programming).
    const exists = get().queue.some((a) => a.id === id);
    if (!exists) return;

    deleteQueueItem(id);

    set((state) => ({
      queue: state.queue.filter((a) => a.id !== id),
    }));
  },

  getAll: () => {
    // Read from in-memory state — no SQLite query needed.
    // The queue is kept in sync via dual-write in enqueue/dequeue/hydrate.
    return get().queue;
  },

  incrementRetry: (id: string) => {
    // Check existence before mutating — no-op for unknown IDs.
    const exists = get().queue.some((a) => a.id === id);
    if (!exists) return;

    dbIncrementRetryCount(id);

    set((state) => ({
      queue: state.queue.map((a) =>
        a.id === id ? { ...a, retryCount: a.retryCount + 1 } : a
      ),
    }));
  },

  hydrate: () => {
    // Load all rows from SQLite and transform to the in-memory format.
    // This bridges the snake_case SQL world and the camelCase JS world.
    const rows = getAllQueueItems();

    const actions: OfflineAction[] = rows.map((row) => ({
      id: row.id,
      actionType: row.action_type,
      // Parse the JSON string back into an object. The payload was stringified
      // during enqueue — now we restore it to its original shape.
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      createdAt: row.created_at,
      retryCount: row.retry_count,
    }));

    set({ queue: actions });
  },
}));
