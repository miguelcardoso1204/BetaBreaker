/**
 * useOfflineSync Hook Tests — hooks/__tests__/useOfflineSync.test.ts
 *
 * Tests for the hook that orchestrates connectivity monitoring and offline
 * queue synchronization. This hook:
 *
 * 1. Subscribes to NetInfo for real-time connectivity changes
 * 2. Calls drainQueue() when the device reconnects (offline → online)
 * 3. Invalidates TanStack Query caches after successful syncs
 * 4. Schedules exponential backoff retries on partial failures
 * 5. Cleans up subscriptions and timers on unmount
 *
 * MOCK STRATEGY (captured-callback pattern):
 * We mock @react-native-community/netinfo and capture the listener that
 * useOfflineSync registers. Tests then simulate connectivity changes by
 * calling the captured listener directly — no real network monitoring.
 * This is the same pattern used in useAuth.test.ts for auth state changes.
 *
 * We also mock the syncEngine (drainQueue) and the offline store to
 * control what the hook sees when it tries to drain the queue.
 *
 * HOISTING NOTE (from MEMORY.md — "Jest Mock Hoisting"):
 * jest.mock() factories are hoisted above all const/let declarations by
 * Babel. Variables declared with const outside the factory are in the
 * temporal dead zone when the factory runs. For variables that must be
 * shared between the mock factory and test code:
 *   - `let` variables work for captured callbacks (assigned inside the
 *     factory's inner function, evaluated at call time — not factory time)
 *   - For mock functions used AS values in the module object, define them
 *     INSIDE the factory and access via jest.requireMock()
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { SYNC_BACKOFF_DELAYS } from '@/lib/constants';

// ── Capture the NetInfo listener ─────────────────────────────────────
// When useOfflineSync mounts, it calls NetInfo.addEventListener(callback).
// We store that callback so tests can simulate connectivity changes.
// `let` is safe here because the factory only ASSIGNS to it inside the
// addEventListener callback (evaluated at call time, not factory time).
let capturedNetInfoListener: ((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void) | null = null;

// ── Mock @react-native-community/netinfo ─────────────────────────────
// Provides a fake addEventListener that captures the listener callback.
// The unsubscribe mock is defined INSIDE the factory to avoid hoisting
// issues — we retrieve it via jest.requireMock later.
jest.mock('@react-native-community/netinfo', () => {
  const unsubscribe = jest.fn();
  return {
    addEventListener: jest.fn((listener: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void) => {
      capturedNetInfoListener = listener;
      return unsubscribe;
    }),
    __mockUnsubscribe: unsubscribe,
  };
});

// ── Mock the sync engine ─────────────────────────────────────────────
// drainQueue is the function the hook calls to process the offline queue.
// We control its return value to simulate success/failure scenarios.
jest.mock('@/lib/syncEngine', () => ({
  drainQueue: jest.fn(),
}));

// ── Mock the offline store ───────────────────────────────────────────
// The hook calls useOfflineStore.getState() to get store functions
// (getAll, dequeue, incrementRetry) to pass to drainQueue.
jest.mock('@/stores/offlineStore', () => ({
  useOfflineStore: {
    getState: jest.fn(() => ({
      getAll: jest.fn(),
      dequeue: jest.fn(),
      incrementRetry: jest.fn(),
    })),
  },
}));

// ── Mock the query client ────────────────────────────────────────────
// The hook invalidates TanStack Query caches after successful syncs.
// The mock fn is defined INSIDE the factory (not outside) because
// jest.mock factories are hoisted above all const declarations — any
// const defined outside would be in the temporal dead zone (undefined)
// when the factory runs. We retrieve it via jest.requireMock.
jest.mock('@/lib/queryClient', () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

// Import AFTER all mocks are defined
import { useOfflineSync } from '../useOfflineSync';

// Extract mocks for per-test configuration via jest.requireMock.
// This is the safe way to access mock objects defined inside factories.
const { drainQueue } = jest.requireMock<{
  drainQueue: jest.Mock;
}>('@/lib/syncEngine');

const NetInfo = jest.requireMock<{
  addEventListener: jest.Mock;
  __mockUnsubscribe: jest.Mock;
}>('@react-native-community/netinfo');

const { queryClient: mockQueryClient } = jest.requireMock<{
  queryClient: { invalidateQueries: jest.Mock };
}>('@/lib/queryClient');

// ── Tests ────────────────────────────────────────────────────────────

describe('useOfflineSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    capturedNetInfoListener = null;

    // Default: drainQueue returns all-success result
    drainQueue.mockResolvedValue({ synced: 0, failed: 0, skipped: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('subscribes to NetInfo on mount', () => {
    // The hook must register a connectivity listener on mount so it
    // knows when the device goes online/offline. Without this, the
    // sync engine has no way to trigger queue draining.
    renderHook(() => useOfflineSync());

    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    expect(NetInfo.addEventListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('triggers drain on reconnect (offline → online)', async () => {
    // The core behavior: when the device transitions from offline to
    // online, drainQueue should be called to replay pending actions.
    renderHook(() => useOfflineSync());

    // Simulate going offline first
    await act(async () => {
      capturedNetInfoListener?.({ isConnected: false, isInternetReachable: false });
    });

    // Now come back online — this should trigger a drain
    drainQueue.mockResolvedValueOnce({ synced: 2, failed: 0, skipped: 0 });
    await act(async () => {
      capturedNetInfoListener?.({ isConnected: true, isInternetReachable: true });
    });

    expect(drainQueue).toHaveBeenCalled();
  });

  it('does not drain when going offline', async () => {
    // Going offline should NOT trigger a drain — there's no network to
    // send requests to. Only the offline → online transition matters.
    renderHook(() => useOfflineSync());

    await act(async () => {
      capturedNetInfoListener?.({ isConnected: false, isInternetReachable: false });
    });

    expect(drainQueue).not.toHaveBeenCalled();
  });

  it('invalidates TanStack Query cache after successful sync', async () => {
    // After drainQueue syncs actions, the server has new data that the
    // local TanStack Query cache doesn't know about. Invalidating the
    // "sessions" query key triggers a refetch so screens show fresh data.
    renderHook(() => useOfflineSync());

    // Go offline, then online with successful sync
    await act(async () => {
      capturedNetInfoListener?.({ isConnected: false, isInternetReachable: false });
    });

    drainQueue.mockResolvedValueOnce({ synced: 3, failed: 0, skipped: 0 });
    await act(async () => {
      capturedNetInfoListener?.({ isConnected: true, isInternetReachable: true });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['sessions'],
    });
  });

  it('schedules backoff retry on partial failure', async () => {
    // When some actions fail (e.g., server returned 500 for one item),
    // the hook schedules another drain attempt after a backoff delay.
    // The first retry uses SYNC_BACKOFF_DELAYS[0] = 1000ms.
    renderHook(() => useOfflineSync());

    // Go offline, then online with partial failure
    await act(async () => {
      capturedNetInfoListener?.({ isConnected: false, isInternetReachable: false });
    });

    drainQueue.mockResolvedValueOnce({ synced: 1, failed: 2, skipped: 0 });
    await act(async () => {
      capturedNetInfoListener?.({ isConnected: true, isInternetReachable: true });
    });

    // The first retry should be scheduled at SYNC_BACKOFF_DELAYS[0]
    drainQueue.mockResolvedValueOnce({ synced: 2, failed: 0, skipped: 0 });
    await act(async () => {
      jest.advanceTimersByTime(SYNC_BACKOFF_DELAYS[0]);
    });

    // drainQueue should have been called twice: once on reconnect, once on retry
    expect(drainQueue).toHaveBeenCalledTimes(2);
  });

  it('exposes isSyncing state during drain', async () => {
    // The hook returns `isSyncing: true` while drainQueue is running.
    // UI components can use this to show a spinner or "Syncing..." indicator.
    //
    // We use a deferred promise to control when drainQueue resolves.
    // The `waitFor` utility handles the async state update timing —
    // executeDrain is fire-and-forget from the NetInfo listener, so
    // React may not flush setIsSyncing(true) immediately after act().
    let resolveDrain!: (value: { synced: number; failed: number; skipped: number }) => void;
    drainQueue.mockImplementation(() => new Promise((resolve) => {
      resolveDrain = resolve;
    }));

    const { result } = renderHook(() => useOfflineSync());

    // Go offline, then online to trigger drain
    await act(async () => {
      capturedNetInfoListener?.({ isConnected: false, isInternetReachable: false });
    });
    await act(async () => {
      capturedNetInfoListener?.({ isConnected: true, isInternetReachable: true });
    });

    // While drainQueue is still pending, isSyncing should be true.
    // Use waitFor because setIsSyncing(true) is called inside an async
    // fire-and-forget function — React may need a tick to flush the update.
    await waitFor(() => {
      expect(result.current.isSyncing).toBe(true);
    });

    // Resolve the drain — isSyncing should go back to false
    await act(async () => {
      resolveDrain({ synced: 1, failed: 0, skipped: 0 });
    });

    expect(result.current.isSyncing).toBe(false);
  });

  it('cleans up NetInfo subscription on unmount', () => {
    // When the component using this hook unmounts, it must unsubscribe
    // from NetInfo to prevent memory leaks and stale listener callbacks.
    const { unmount } = renderHook(() => useOfflineSync());

    unmount();

    // Access the unsubscribe mock via the __mockUnsubscribe helper we
    // stashed in the NetInfo mock module (defined inside the factory).
    expect(NetInfo.__mockUnsubscribe).toHaveBeenCalled();
  });
});
