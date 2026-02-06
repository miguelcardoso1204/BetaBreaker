/**
 * Jest Setup — Global Test Configuration
 *
 * This file runs after the test framework is installed but before tests execute.
 * It configures libraries that need special handling in the test environment.
 *
 * TanStack Query's notifyManager:
 * By default, TanStack Query batches state updates using setTimeout(fn, 0).
 * In tests, these deferred updates don't flush inside React's act() wrapper,
 * causing mutation error/success states to appear stale. Setting the schedule
 * function to synchronous (fn => fn()) ensures state updates happen immediately
 * during act(), making tests deterministic.
 *
 * This is the officially recommended approach from the TanStack Query docs:
 * https://tanstack.com/query/latest/docs/framework/react/guides/testing
 */

import { notifyManager } from "@tanstack/react-query";

// Make TanStack Query state updates synchronous in tests.
// Without this, useMutation error states may not be flushed
// before assertions run, causing flaky test failures.
notifyManager.setScheduler((fn) => {
  fn();
});
