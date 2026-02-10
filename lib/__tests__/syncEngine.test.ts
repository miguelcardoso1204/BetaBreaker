/**
 * Sync Engine Tests — lib/__tests__/syncEngine.test.ts
 *
 * Tests for the `drainQueue` function that replays offline-queued actions
 * against the real service layer when connectivity returns. The sync engine
 * is a pure async function with injected dependencies — no React, no NetInfo.
 *
 * MOCK STRATEGY:
 * - `sessionsService` is mocked at the module level (jest.mock) so the tests
 *   never hit Supabase. We control what createAscent/deleteAscent return.
 * - Store dependencies (getAll, dequeue, incrementRetry) are injected as
 *   plain jest.fn() mocks — no need for a real Zustand store.
 *
 * WHY INJECT STORE DEPS?
 * drainQueue takes `{ getAll, dequeue, incrementRetry }` as a parameter
 * rather than importing the store directly. This makes tests trivial: we
 * just pass mock functions. It also avoids circular dependencies between
 * the sync engine and the offline store.
 */

import type { OfflineAction } from '@/stores/offlineStore';
import type { SyncResult } from '../syncEngine';
import { MAX_OFFLINE_RETRIES } from '@/lib/constants';

// ── Mock sessionsService ─────────────────────────────────────────────
// Mock the service layer so drainQueue's replayAction() calls go through
// our controlled fakes instead of hitting the network.
jest.mock('@/services/sessions.service', () => ({
  sessionsService: {
    createAscent: jest.fn(),
    deleteAscent: jest.fn(),
  },
}));

// Import after mocks are defined — Jest replaces real modules with mocks.
import { drainQueue } from '../syncEngine';

// Extract the mock so we can configure per-test return values.
const { sessionsService } = jest.requireMock<{
  sessionsService: {
    createAscent: jest.Mock;
    deleteAscent: jest.Mock;
  };
}>('@/services/sessions.service');

// ── Test Fixtures ────────────────────────────────────────────────────

/** Helper to create a fake OfflineAction with sensible defaults. */
function makeAction(overrides: Partial<OfflineAction> = {}): OfflineAction {
  return {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    actionType: 'log_ascent',
    payload: {
      userId: 'user-1',
      routeId: 'route-1',
      status: 'send',
      attempts: 1,
    },
    createdAt: new Date().toISOString(),
    retryCount: 0,
    ...overrides,
  };
}

/** Helper to create the injected dependencies as jest mocks. */
function makeDeps(queue: OfflineAction[] = []) {
  return {
    getAll: jest.fn(() => queue),
    dequeue: jest.fn(),
    incrementRetry: jest.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('drainQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, service calls succeed (resolve with no error).
    // Individual tests can override this for failure scenarios.
    sessionsService.createAscent.mockResolvedValue({ data: {}, error: null });
    sessionsService.deleteAscent.mockResolvedValue({ data: null, error: null });
  });

  it('replays actions in FIFO order (oldest first)', async () => {
    // The sync engine must process items in the order they were queued.
    // If a user logged ascent A then deleted ascent B while offline,
    // they must replay in that exact order to avoid data inconsistencies.
    const action1 = makeAction({ id: 'first', createdAt: '2026-01-01T00:00:00Z' });
    const action2 = makeAction({ id: 'second', createdAt: '2026-01-01T00:01:00Z' });
    const deps = makeDeps([action1, action2]);

    await drainQueue(deps);

    // Verify createAscent was called twice, in order
    expect(sessionsService.createAscent).toHaveBeenCalledTimes(2);
    const firstCallOrder = sessionsService.createAscent.mock.invocationCallOrder[0];
    const secondCallOrder = sessionsService.createAscent.mock.invocationCallOrder[1];
    expect(firstCallOrder).toBeLessThan(secondCallOrder);
  });

  it('dequeues an action after successful replay', async () => {
    // When a queued action is successfully replayed against the server,
    // it should be removed from the queue so it's not replayed again.
    const action = makeAction({ id: 'success-action' });
    const deps = makeDeps([action]);

    await drainQueue(deps);

    expect(deps.dequeue).toHaveBeenCalledWith('success-action');
  });

  it('increments retry count on failed replay', async () => {
    // When the service call fails (e.g., server 500), the action stays
    // in the queue but its retryCount is incremented. The next drain pass
    // will try again, up to MAX_OFFLINE_RETRIES.
    const action = makeAction({ id: 'fail-action' });
    const deps = makeDeps([action]);

    // Simulate a server error
    sessionsService.createAscent.mockRejectedValueOnce(new Error('Server error'));

    await drainQueue(deps);

    expect(deps.incrementRetry).toHaveBeenCalledWith('fail-action');
    expect(deps.dequeue).not.toHaveBeenCalled();
  });

  it('skips actions that have reached MAX_OFFLINE_RETRIES', async () => {
    // Actions that have failed MAX_OFFLINE_RETRIES times (3) are considered
    // permanently failed — they're counted as "skipped" and NOT replayed.
    // The user can manually retry or discard these from a sync UI.
    const exhaustedAction = makeAction({
      id: 'exhausted',
      retryCount: MAX_OFFLINE_RETRIES,
    });
    const deps = makeDeps([exhaustedAction]);

    const result = await drainQueue(deps);

    // Should NOT attempt to replay
    expect(sessionsService.createAscent).not.toHaveBeenCalled();
    // Should NOT dequeue or increment
    expect(deps.dequeue).not.toHaveBeenCalled();
    expect(deps.incrementRetry).not.toHaveBeenCalled();
    // Should count as skipped
    expect(result.skipped).toBe(1);
  });

  it('maps log_ascent to sessionsService.createAscent with correct AscentLog shape', async () => {
    // The sync engine must transform the generic offline action payload
    // into the typed AscentLog that sessionsService.createAscent expects.
    // This ensures the same code path is used for both online and offline logs.
    const action = makeAction({
      actionType: 'log_ascent',
      payload: {
        userId: 'user-abc',
        routeId: 'route-xyz',
        status: 'flash',
        attempts: 1,
        notes: 'Great route!',
        perceivedGrade: 12,
      },
    });
    const deps = makeDeps([action]);

    await drainQueue(deps);

    expect(sessionsService.createAscent).toHaveBeenCalledWith({
      userId: 'user-abc',
      routeId: 'route-xyz',
      status: 'flash',
      attempts: 1,
      notes: 'Great route!',
      perceivedGrade: 12,
    });
  });

  it('maps delete_ascent to sessionsService.deleteAscent with payload.ascentId', async () => {
    // For delete actions, the payload contains the ascentId to remove.
    // The sync engine extracts this and calls deleteAscent with just the ID.
    const action = makeAction({
      actionType: 'delete_ascent',
      payload: { ascentId: 'ascent-to-delete' },
    });
    const deps = makeDeps([action]);

    await drainQueue(deps);

    expect(sessionsService.deleteAscent).toHaveBeenCalledWith('ascent-to-delete');
  });

  it('treats no-op delete as success (last-write-wins conflict resolution)', async () => {
    // If the ascent was already deleted (e.g., by another device), the
    // deleteAscent call returns no error even though 0 rows were affected.
    // The sync engine should treat this as success and dequeue the action,
    // following the "last-write-wins" idempotent pattern.
    const action = makeAction({
      id: 'idempotent-delete',
      actionType: 'delete_ascent',
      payload: { ascentId: 'already-deleted' },
    });
    const deps = makeDeps([action]);

    // Supabase returns no error even for 0-row deletes
    sessionsService.deleteAscent.mockResolvedValueOnce({ data: null, error: null });

    await drainQueue(deps);

    // Should still dequeue — a no-op delete is not an error
    expect(deps.dequeue).toHaveBeenCalledWith('idempotent-delete');
  });

  it('returns accurate SyncResult counts (synced + failed + skipped = total)', async () => {
    // The SyncResult tells the caller how many actions were successfully
    // synced, how many failed (will retry), and how many were permanently
    // skipped. These three counts must always sum to the total queue length.
    const successAction = makeAction({ id: 'ok' });
    const failAction = makeAction({ id: 'fail' });
    const skippedAction = makeAction({
      id: 'skip',
      retryCount: MAX_OFFLINE_RETRIES,
    });
    const deps = makeDeps([successAction, failAction, skippedAction]);

    // First action succeeds, second fails
    sessionsService.createAscent
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockRejectedValueOnce(new Error('Temporary failure'));

    const result: SyncResult = await drainQueue(deps);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.synced + result.failed + result.skipped).toBe(3);
  });
});
