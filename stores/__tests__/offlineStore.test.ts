/**
 * Tests for stores/offlineStore.ts — Offline Queue Store
 *
 * These tests verify the Zustand offline store that manages the SQLite-backed
 * queue of actions taken while offline. The store uses a dual-write pattern:
 * every mutation updates both in-memory state and the SQLite database.
 *
 * MOCKING STRATEGY:
 * We mock the entire `@/lib/offlineDb` module so tests never touch real SQLite.
 * This isolates the store's logic (ID generation, FIFO ordering, dual-write
 * calls) from the database layer, which has its own tests (future Step 6.2).
 *
 * The mock functions are defined INSIDE the jest.mock() factory to avoid the
 * temporal dead zone issue with jest-expo's Babel hoisting — see MEMORY.md
 * "Jest Mock Hoisting" for details.
 *
 * STORE RESET:
 * Zustand stores are singletons — state persists between tests. We call
 * `useOfflineStore.setState({ queue: [] })` in beforeEach to start each
 * test with a clean queue. This is the standard Zustand testing pattern.
 */

// Mock the SQLite database module — all DB calls become jest.fn() no-ops.
// This prevents tests from needing actual native SQLite bindings.
jest.mock('@/lib/offlineDb', () => ({
  insertQueueItem: jest.fn(),
  deleteQueueItem: jest.fn(),
  getAllQueueItems: jest.fn(() => []),
  incrementRetryCount: jest.fn(),
  clearQueue: jest.fn(),
}));

import { useOfflineStore } from '../offlineStore';
import type { OfflineQueueRow } from '@/lib/offlineDb';

// Access the mocked functions so we can assert they were called correctly.
// jest.requireMock ensures we get the mock version, not the real module.
const mockDb = jest.requireMock<{
  insertQueueItem: jest.Mock;
  deleteQueueItem: jest.Mock;
  getAllQueueItems: jest.Mock;
  incrementRetryCount: jest.Mock;
  clearQueue: jest.Mock;
}>('@/lib/offlineDb');

beforeEach(() => {
  // Reset the Zustand store to empty state before each test.
  // This prevents test pollution — each test starts with a clean queue.
  useOfflineStore.setState({ queue: [] });

  // Clear all mock call history so assertions only check the current test's calls.
  jest.clearAllMocks();
});

/* ── Test 1: Empty initial state ──────────────────────────────────────── */

describe('initial state', () => {
  it('starts with an empty queue', () => {
    // A freshly created store should have no pending actions.
    // getAll() is a convenience accessor that reads from in-memory state.
    const { queue, getAll } = useOfflineStore.getState();

    expect(queue).toEqual([]);
    expect(getAll()).toEqual([]);
  });
});

/* ── Test 2–4: Enqueue ────────────────────────────────────────────────── */

describe('enqueue', () => {
  it('adds an action with correct fields and retryCount of 0', () => {
    // Enqueue should create an OfflineAction with all expected fields:
    // - Generated ID with 'offline-' prefix
    // - The action type and payload we passed in
    // - An ISO timestamp for createdAt
    // - retryCount starting at 0 (never been retried yet)
    const { enqueue } = useOfflineStore.getState();

    enqueue('log_ascent', { routeId: 'route-1', status: 'flash' });

    const { queue } = useOfflineStore.getState();
    expect(queue).toHaveLength(1);

    const action = queue[0];
    expect(action.id).toMatch(/^offline-/);
    expect(action.actionType).toBe('log_ascent');
    expect(action.payload).toEqual({ routeId: 'route-1', status: 'flash' });
    expect(action.createdAt).toBeDefined();
    expect(action.retryCount).toBe(0);
  });

  it('returns the generated ID', () => {
    // The returned ID lets callers track the specific queued action
    // (e.g., to show a "pending" indicator next to a logged ascent).
    const { enqueue } = useOfflineStore.getState();

    const id = enqueue('delete_ascent', { ascentId: 'ascent-1' });

    expect(typeof id).toBe('string');
    expect(id).toMatch(/^offline-/);
  });

  it('persists to SQLite via insertQueueItem', () => {
    // The dual-write pattern: enqueue should call insertQueueItem with the
    // snake_case row shape that matches the SQLite table schema.
    const { enqueue } = useOfflineStore.getState();

    enqueue('log_ascent', { routeId: 'route-2' });

    expect(mockDb.insertQueueItem).toHaveBeenCalledTimes(1);

    // Verify the row shape matches OfflineQueueRow (snake_case, JSON payload).
    const row = mockDb.insertQueueItem.mock.calls[0][0];
    expect(row.id).toMatch(/^offline-/);
    expect(row.action_type).toBe('log_ascent');
    expect(row.payload).toBe(JSON.stringify({ routeId: 'route-2' }));
    expect(row.created_at).toBeDefined();
    expect(row.retry_count).toBe(0);
  });
});

/* ── Test 5–6: Dequeue ────────────────────────────────────────────────── */

describe('dequeue', () => {
  it('removes from queue and calls deleteQueueItem', () => {
    // After the sync engine successfully replays an action, it dequeues it.
    // This should remove it from both in-memory state and SQLite.
    const { enqueue } = useOfflineStore.getState();
    const id = enqueue('log_ascent', { routeId: 'route-1' });

    expect(useOfflineStore.getState().queue).toHaveLength(1);

    useOfflineStore.getState().dequeue(id);

    expect(useOfflineStore.getState().queue).toHaveLength(0);
    expect(mockDb.deleteQueueItem).toHaveBeenCalledWith(id);
  });

  it('is a no-op for non-existent ID', () => {
    // Dequeuing an ID that doesn't exist should be safe — no crash,
    // no state change, and no unnecessary SQLite call.
    const { enqueue } = useOfflineStore.getState();
    enqueue('log_ascent', { routeId: 'route-1' });

    useOfflineStore.getState().dequeue('non-existent-id');

    // Queue should still have the one item we enqueued.
    expect(useOfflineStore.getState().queue).toHaveLength(1);
    // deleteQueueItem should NOT have been called for the non-existent ID.
    expect(mockDb.deleteQueueItem).not.toHaveBeenCalled();
  });
});

/* ── Test 7: FIFO ordering ────────────────────────────────────────────── */

describe('queue ordering', () => {
  it('maintains FIFO order by creation time', () => {
    // The sync engine must replay actions in the same order the user
    // performed them. Enqueue appends to the end, so the first item
    // enqueued should have the earliest createdAt.
    const { enqueue } = useOfflineStore.getState();

    enqueue('log_ascent', { routeId: 'route-1' });
    enqueue('log_ascent', { routeId: 'route-2' });
    enqueue('delete_ascent', { ascentId: 'ascent-1' });

    const { queue } = useOfflineStore.getState();
    expect(queue).toHaveLength(3);

    // Verify chronological ordering: each createdAt should be <= the next.
    // (They might be equal if enqueued in the same millisecond, but never reversed.)
    expect(queue[0].createdAt <= queue[1].createdAt).toBe(true);
    expect(queue[1].createdAt <= queue[2].createdAt).toBe(true);
  });
});

/* ── Test 8–9: Hydrate ────────────────────────────────────────────────── */

describe('hydrate', () => {
  it('loads rows from SQLite and parses JSON payloads', () => {
    // On app startup, hydrate() reads all rows from SQLite and populates
    // the in-memory queue. It must parse the JSON payload string back into
    // an object and map snake_case column names to camelCase field names.
    const mockRows: OfflineQueueRow[] = [
      {
        id: 'offline-1',
        action_type: 'log_ascent',
        payload: JSON.stringify({ routeId: 'route-1', status: 'send' }),
        created_at: '2026-02-10T10:00:00.000Z',
        retry_count: 1,
      },
      {
        id: 'offline-2',
        action_type: 'delete_ascent',
        payload: JSON.stringify({ ascentId: 'ascent-1' }),
        created_at: '2026-02-10T10:05:00.000Z',
        retry_count: 0,
      },
    ];

    mockDb.getAllQueueItems.mockReturnValueOnce(mockRows);

    useOfflineStore.getState().hydrate();

    const { queue } = useOfflineStore.getState();
    expect(queue).toHaveLength(2);

    // Verify snake_case → camelCase mapping and JSON parsing.
    expect(queue[0]).toEqual({
      id: 'offline-1',
      actionType: 'log_ascent',
      payload: { routeId: 'route-1', status: 'send' },
      createdAt: '2026-02-10T10:00:00.000Z',
      retryCount: 1,
    });

    expect(queue[1]).toEqual({
      id: 'offline-2',
      actionType: 'delete_ascent',
      payload: { ascentId: 'ascent-1' },
      createdAt: '2026-02-10T10:05:00.000Z',
      retryCount: 0,
    });
  });

  it('survives simulated restart (enqueue → reset → hydrate)', () => {
    // Simulate the full lifecycle: user enqueues while offline, app is
    // force-closed (state lost), app restarts and hydrate() restores the queue.
    const { enqueue } = useOfflineStore.getState();
    enqueue('log_ascent', { routeId: 'route-1' });

    // Capture what was written to SQLite so we can return it on hydrate.
    const insertedRow = mockDb.insertQueueItem.mock.calls[0][0];

    // Simulate app restart by resetting the in-memory store to empty.
    useOfflineStore.setState({ queue: [] });
    expect(useOfflineStore.getState().queue).toHaveLength(0);

    // Mock SQLite returning the previously persisted row.
    mockDb.getAllQueueItems.mockReturnValueOnce([insertedRow]);

    // Hydrate should restore the queue from SQLite.
    useOfflineStore.getState().hydrate();

    const { queue } = useOfflineStore.getState();
    expect(queue).toHaveLength(1);
    expect(queue[0].actionType).toBe('log_ascent');
    expect(queue[0].payload).toEqual({ routeId: 'route-1' });
  });
});

/* ── Test 10–11: incrementRetry ───────────────────────────────────────── */

describe('incrementRetry', () => {
  it('increments retryCount and calls incrementRetryCount on SQLite', () => {
    // When the sync engine fails to replay an action, it increments the
    // retry count. After MAX_OFFLINE_RETRIES, the engine stops retrying.
    const { enqueue } = useOfflineStore.getState();
    const id = enqueue('log_ascent', { routeId: 'route-1' });

    expect(useOfflineStore.getState().queue[0].retryCount).toBe(0);

    useOfflineStore.getState().incrementRetry(id);

    expect(useOfflineStore.getState().queue[0].retryCount).toBe(1);
    expect(mockDb.incrementRetryCount).toHaveBeenCalledWith(id);
  });

  it('is a no-op for non-existent ID', () => {
    // Incrementing retry on a non-existent ID should be safe — no crash,
    // no state change, and no SQLite call.
    const { enqueue } = useOfflineStore.getState();
    enqueue('log_ascent', { routeId: 'route-1' });

    useOfflineStore.getState().incrementRetry('non-existent-id');

    // The existing action's retryCount should be unchanged.
    expect(useOfflineStore.getState().queue[0].retryCount).toBe(0);
    expect(mockDb.incrementRetryCount).not.toHaveBeenCalled();
  });
});
