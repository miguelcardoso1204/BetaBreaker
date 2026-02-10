/**
 * Sync Engine — lib/syncEngine.ts
 *
 * This module drains the offline action queue when network connectivity
 * returns. It's the bridge between the local SQLite queue (where actions
 * are stored while offline) and the Supabase API (where they need to go).
 *
 * ARCHITECTURE:
 * drainQueue is a pure async function — no React hooks, no NetInfo, no
 * store imports. Dependencies are injected as a `deps` parameter so the
 * function is trivially testable with simple mock objects.
 *
 * The hook layer (useOfflineSync) is responsible for:
 * - Detecting connectivity changes (NetInfo)
 * - Calling drainQueue with real store functions
 * - Invalidating TanStack Query caches after successful syncs
 * - Scheduling backoff retries on partial failures
 *
 * REPLAY FLOW:
 * 1. Get all queued items via deps.getAll()
 * 2. Process each item in FIFO order (oldest first):
 *    - Skip if retryCount >= MAX_OFFLINE_RETRIES (permanently failed)
 *    - Call replayAction() to execute via the service layer
 *    - On success: remove from queue via deps.dequeue()
 *    - On failure: increment retry count via deps.incrementRetry()
 * 3. Return a SyncResult summary of what happened
 *
 * WHY FIFO ORDER MATTERS:
 * If a user logged ascent A, then deleted ascent B while offline, those
 * actions must replay in that exact order. FIFO ensures causal consistency —
 * the server sees operations in the same order the user performed them.
 */

import { sessionsService } from '@/services/sessions.service';
import type { AscentLog } from '@/services/sessions.service';
import type { OfflineAction } from '@/stores/offlineStore';
import { MAX_OFFLINE_RETRIES } from '@/lib/constants';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Summary of what happened during a single drain pass.
 *
 * Callers (useOfflineSync) use this to decide next steps:
 * - synced > 0 → invalidate TanStack Query caches
 * - failed > 0 → schedule a backoff retry
 * - skipped > 0 → show a warning badge in the UI (future)
 *
 * Invariant: synced + failed + skipped === total items in the queue
 */
export interface SyncResult {
  /** Number of actions successfully replayed and removed from the queue. */
  synced: number;
  /** Number of actions that failed this pass (retry count incremented). */
  failed: number;
  /** Number of actions permanently failed (retryCount >= MAX_OFFLINE_RETRIES). */
  skipped: number;
}

/**
 * Dependencies injected into drainQueue for testability.
 *
 * In production, these come from useOfflineStore.getState(). In tests,
 * they're simple jest.fn() mocks. This pattern avoids importing the store
 * directly, which would create a circular dependency and make testing harder.
 */
export interface DrainDeps {
  getAll: () => OfflineAction[];
  dequeue: (id: string) => void;
  incrementRetry: (id: string) => void;
}

// ── Internal Helper ──────────────────────────────────────────────────

/**
 * Replay a single offline action through the appropriate service method.
 *
 * This is the core mapping layer: it takes a generic OfflineAction (with
 * actionType and payload as loose types) and routes it to the correct
 * typed service call. This means the same code path is used whether the
 * user was online (direct service call) or offline (queued → replayed).
 *
 * For delete_ascent: treats a no-error response as success even if 0 rows
 * were affected. This is the "last-write-wins" idempotent pattern — if
 * the ascent was already deleted (e.g., by another device), that's fine.
 *
 * @throws Error if the service call fails or the action type is unknown
 */
async function replayAction(action: OfflineAction): Promise<void> {
  switch (action.actionType) {
    case 'log_ascent': {
      // Map the generic payload to the typed AscentLog the service expects.
      // The payload was originally an AscentLog that got serialized to JSON
      // when enqueued — now we pass it through to createAscent.
      const payload = action.payload as unknown as AscentLog;
      const result = await sessionsService.createAscent(payload);

      // Supabase PostgREST returns { data, error }. The createAscent
      // call is a thenable chain (.insert().select().single()), so we
      // need to check the result's error field.
      if (result.error) {
        throw result.error;
      }
      break;
    }

    case 'delete_ascent': {
      // Extract the ascent ID from the payload. When the user deletes
      // an ascent offline, the payload stores { ascentId: '<uuid>' }.
      const ascentId = action.payload.ascentId as string;
      const result = await sessionsService.deleteAscent(ascentId);

      // For deletes, a no-error response is always success — even if
      // 0 rows were affected (the ascent might already be gone).
      // This is intentional: last-write-wins means duplicate deletes
      // are harmless and should not be retried.
      if (result.error) {
        throw result.error;
      }
      break;
    }

    default:
      // Defensive: if an unknown action type somehow ended up in the queue,
      // throw so it gets counted as a failure and eventually skipped after
      // MAX_OFFLINE_RETRIES. This should never happen in practice.
      throw new Error(`Unknown offline action type: ${action.actionType}`);
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Drain the offline action queue by replaying each action via the service layer.
 *
 * Processes items in FIFO order (oldest first). For each action:
 * - If retryCount >= MAX_OFFLINE_RETRIES → skip (permanently failed)
 * - If replay succeeds → dequeue (remove from queue)
 * - If replay fails → increment retry count (try again next drain pass)
 *
 * @param deps - Injected store functions (getAll, dequeue, incrementRetry)
 * @returns SyncResult with counts of synced, failed, and skipped actions
 */
export async function drainQueue(deps: DrainDeps): Promise<SyncResult> {
  const actions = deps.getAll();

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  // Process sequentially in FIFO order — parallel execution could cause
  // race conditions (e.g., creating then immediately deleting the same ascent).
  for (const action of actions) {
    // Skip permanently failed actions — they've exhausted all retries.
    // A future sync UI could show these to the user for manual resolution.
    if (action.retryCount >= MAX_OFFLINE_RETRIES) {
      skipped++;
      continue;
    }

    try {
      await replayAction(action);
      // Success — remove the action from the queue so it's not replayed again.
      deps.dequeue(action.id);
      synced++;
    } catch {
      // Failure — bump the retry count so the next drain pass knows how
      // many times this action has failed. After MAX_OFFLINE_RETRIES
      // failures, it'll be skipped instead of retried.
      deps.incrementRetry(action.id);
      failed++;
    }
  }

  return { synced, failed, skipped };
}
