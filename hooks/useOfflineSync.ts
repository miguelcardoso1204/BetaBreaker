/**
 * useOfflineSync Hook — hooks/useOfflineSync.ts
 *
 * Orchestrates the sync engine by monitoring network connectivity and
 * triggering queue draining when the device reconnects. This is the
 * React-facing layer that glues together:
 *
 *   - NetInfo (connectivity detection)
 *   - drainQueue (the sync engine that replays offline actions)
 *   - offlineStore (the queue of pending actions)
 *   - queryClient (TanStack Query cache invalidation)
 *
 * HOW IT WORKS:
 * 1. On mount, subscribes to @react-native-community/netinfo for
 *    real-time connectivity events (isConnected changes).
 * 2. When the device transitions from offline → online, calls drainQueue()
 *    with store deps to replay all queued actions via the service layer.
 * 3. After a successful sync (synced > 0), invalidates the "sessions"
 *    query key so screens refetch fresh data from the server.
 * 4. If some actions failed (failed > 0), schedules a backoff retry
 *    with exponentially increasing delays from SYNC_BACKOFF_DELAYS.
 * 5. On unmount, cleans up the NetInfo subscription and any pending
 *    retry timers to prevent memory leaks.
 *
 * WHY SEPARATE FROM THE SYNC ENGINE?
 * drainQueue is a pure function — no React, no subscriptions, no timers.
 * This hook adds the React lifecycle concerns (effects, state, cleanup).
 * Keeping them separate means the sync logic is testable without rendering
 * any React components, and the hook is testable with simple mocks.
 *
 * USAGE:
 * Mount this hook once at the app root (in a <SyncManager /> component
 * inside the QueryClientProvider). It returns sync status for optional
 * UI indicators:
 *
 *   const { isSyncing, lastSyncResult } = useOfflineSync();
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { drainQueue } from '@/lib/syncEngine';
import type { SyncResult } from '@/lib/syncEngine';
import { useOfflineStore } from '@/stores/offlineStore';
import { queryClient } from '@/lib/queryClient';
import { SYNC_BACKOFF_DELAYS } from '@/lib/constants';

export function useOfflineSync(): {
  /** True while drainQueue is actively processing the queue. */
  isSyncing: boolean;
  /** Result of the most recent drain attempt, or null if never synced. */
  lastSyncResult: SyncResult | null;
} {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Track whether the device was previously offline so we can detect
  // the offline → online transition. useRef avoids re-renders on change.
  const wasOnlineRef = useRef<boolean | null>(null);

  // Track the current backoff retry attempt index (0, 1, 2).
  // Resets on a new reconnection event or when all items sync successfully.
  const retryIndexRef = useRef(0);

  // Store the timeout ID so we can clear it on unmount or new reconnect.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Execute a drain pass: call drainQueue, handle results, schedule retries.
   *
   * This is extracted into a callback so both the reconnect handler and
   * the backoff retry timer can share the same logic.
   */
  const executeDrain = useCallback(async () => {
    setIsSyncing(true);

    try {
      // Get the current store functions to inject into drainQueue.
      // We call getState() at drain time (not mount time) to ensure
      // we always get the latest queue contents.
      const { getAll, dequeue, incrementRetry } = useOfflineStore.getState();

      const result = await drainQueue({ getAll, dequeue, incrementRetry });
      setLastSyncResult(result);

      // If any actions were successfully synced, the server now has data
      // that the local TanStack Query cache doesn't know about. Invalidate
      // the "sessions" query key so screens refetch fresh data.
      if (result.synced > 0) {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      }

      // If some actions failed but are still retryable, schedule another
      // drain attempt with exponential backoff. This handles transient
      // errors (server 500s, brief connectivity drops) without hammering.
      if (result.failed > 0 && retryIndexRef.current < SYNC_BACKOFF_DELAYS.length) {
        const delay = SYNC_BACKOFF_DELAYS[retryIndexRef.current];
        retryIndexRef.current++;

        retryTimerRef.current = setTimeout(() => {
          executeDrain();
        }, delay);
      } else {
        // All items synced (or all retries exhausted) — reset for next time.
        retryIndexRef.current = 0;
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    // Subscribe to network connectivity changes. NetInfo fires the listener
    // immediately with the current state, then again on each change.
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true;
      const wasOnline = wasOnlineRef.current;

      // Detect the offline → online transition. We specifically check
      // `wasOnline === false` (not `wasOnline !== true`) to avoid
      // triggering on the initial mount event where wasOnline is null.
      if (isOnline && wasOnline === false) {
        // Clear any pending backoff timer from a previous drain pass —
        // a fresh reconnection event should start the backoff sequence
        // from scratch.
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        retryIndexRef.current = 0;

        // Trigger the drain
        executeDrain();
      }

      // Update the ref for next comparison
      wasOnlineRef.current = isOnline;
    });

    // Cleanup on unmount: unsubscribe from NetInfo and clear any pending
    // retry timers to prevent state updates on unmounted components.
    return () => {
      unsubscribe();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [executeDrain]);

  return { isSyncing, lastSyncResult };
}
