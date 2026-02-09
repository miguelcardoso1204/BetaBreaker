/**
 * useSession Hook Tests — Session Management + Ascent Logging
 *
 * This hook is the primary API for tick-logging screens. It coordinates:
 *   - Zustand sessionStore (timer, pending logs) — used as REAL store here
 *   - sessionsService (database persistence) — MOCKED
 *   - TanStack Query cache (invalidation after mutations)
 *
 * Mock strategy:
 *   - Mock sessionsService — the hook doesn't care about PostgREST details
 *   - Mock useAuth — return a fixed user ID so we can verify userId injection
 *   - Use the REAL Zustand store (not mocked) — this lets us verify that
 *     optimistic updates and rollbacks actually modify store state correctly.
 *     Zustand stores are lightweight and don't need external dependencies,
 *     so there's no reason to mock them.
 *
 * Store reset:
 *   Each test calls `useSessionStore.getState().reset()` in beforeEach to
 *   ensure tests don't leak state. Zustand stores are singletons — without
 *   reset, a startSession() in one test would affect the next test's isActive.
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSessionStore } from "@/stores/sessionStore";

// ── Mock sessionsService ──────────────────────────────────────────────
// Mock the service layer so no real Supabase calls are made.
// We control what createAscent/deleteAscent return per test.
jest.mock("@/services/sessions.service", () => ({
  sessionsService: {
    createAscent: jest.fn(),
    deleteAscent: jest.fn(),
    getSessionSummary: jest.fn(),
    getSessionHistory: jest.fn(),
  },
}));

// ── Mock useAuth ──────────────────────────────────────────────────────
// Return a fixed user so the hook injects the correct userId into
// service calls. Matches the pattern from useSavedRoutes.test.tsx.
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { user: { id: "user-1" } },
    isAuthenticated: true,
  }),
}));

import { useSession } from "../useSession";

// Get typed references to the mocked service functions.
// jest.requireMock gives us the mock instances so we can configure
// return values and assert call arguments.
const { sessionsService } = jest.requireMock<{
  sessionsService: {
    createAscent: jest.Mock;
    deleteAscent: jest.Mock;
  };
}>("@/services/sessions.service");

// ── Test Setup ────────────────────────────────────────────────────────

/**
 * Creates a fresh QueryClient + wrapper for each test, plus a spy on
 * invalidateQueries so we can verify cache invalidation.
 *
 * Why a factory function instead of a shared client?
 * TanStack Query caches are stateful — a shared client would leak cache
 * entries between tests, causing flaky failures. Fresh client = isolation.
 */
function createTestSetup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const invalidateSpy = jest.spyOn(client, "invalidateQueries");

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  return { client, invalidateSpy, Wrapper };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("useSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the real Zustand store to idle state before each test.
    // This prevents state leakage between tests (e.g., a startSession
    // in one test affecting isActive in the next test).
    useSessionStore.getState().reset();
  });

  // ── Test 1: Log ascent mutation inserts + invalidates ─────────
  it("logAscent calls service with userId injected and invalidates cache", async () => {
    // Configure the mock to return a successful ascent creation.
    // The service returns { data, error } matching PostgREST's shape.
    sessionsService.createAscent.mockResolvedValueOnce({
      data: {
        id: "ascent-1",
        user_id: "user-1",
        route_id: "route-1",
        status: "send",
        attempts: 2,
        notes: null,
        perceived_grade: null,
        created_at: "2026-02-09T10:00:00Z",
      },
      error: null,
    });

    const { invalidateSpy, Wrapper } = createTestSetup();

    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    // Call mutateAsync so we can await the mutation completing.
    // The hook should inject user.id ("user-1") into the service call.
    await act(async () => {
      await result.current.logAscent.mutateAsync({
        routeId: "route-1",
        status: "send",
        attempts: 2,
      });
    });

    // Verify the service was called with userId injected from useAuth.
    // The screen only passes routeId/status/attempts — the hook adds userId.
    expect(sessionsService.createAscent).toHaveBeenCalledWith({
      userId: "user-1",
      routeId: "route-1",
      status: "send",
      attempts: 2,
      notes: undefined,
      perceivedGrade: undefined,
    });

    // Verify cache invalidation — ensures logbook/history screens re-fetch.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sessions"] });
  });

  // ── Test 2: Optimistic update — pending log appears immediately ──
  it("adds a pending log to the store optimistically before service resolves", async () => {
    // Create a deferred promise so we can control when the service resolves.
    // This lets us check the store state WHILE the mutation is in-flight,
    // proving the optimistic update happened before the server responded.
    let resolveService!: (value: unknown) => void;
    const deferredPromise = new Promise((resolve) => {
      resolveService = resolve;
    });
    sessionsService.createAscent.mockReturnValueOnce(deferredPromise);

    const { Wrapper } = createTestSetup();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    // Fire the mutation without awaiting — we want to inspect mid-flight.
    act(() => {
      result.current.logAscent.mutate({
        routeId: "route-2",
        status: "flash",
        attempts: 1,
      });
    });

    // The pending log should already be in the store (optimistic update via
    // onMutate) even though the service hasn't resolved yet.
    const storePendingLogs = useSessionStore.getState().pendingLogs;
    expect(storePendingLogs).toHaveLength(1);
    expect(storePendingLogs[0]).toMatchObject({
      routeId: "route-2",
      status: "flash",
      attempts: 1,
    });
    // The pending log ID should have the "pending-" prefix.
    expect(storePendingLogs[0].id).toMatch(/^pending-/);

    // Now resolve the service so the mutation completes cleanly.
    await act(async () => {
      resolveService({
        data: { id: "ascent-2" },
        error: null,
      });
    });
  });

  // ── Test 3: Rollback on error — pending log removed ───────────
  it("removes the pending log from the store when the service fails", async () => {
    // Simulate a service error (e.g., RLS violation, network failure).
    // The mutation's onError should remove the optimistic pending log.
    sessionsService.createAscent.mockResolvedValueOnce({
      data: null,
      error: new Error("RLS violation: permission denied"),
    });

    const { Wrapper } = createTestSetup();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    // Fire the mutation — it will fail because of the error in the response.
    await act(async () => {
      // Use mutate (not mutateAsync) so we don't need to catch the throw.
      result.current.logAscent.mutate({
        routeId: "route-3",
        status: "attempt",
        attempts: 3,
      });
    });

    // Wait for the mutation to transition to error state.
    await waitFor(() => {
      expect(result.current.logAscent.isError).toBe(true);
    });

    // The pending log should have been removed by onError (rollback).
    // The store should be back to empty — as if the mutation never happened.
    expect(useSessionStore.getState().pendingLogs).toHaveLength(0);
  });

  // ── Test 4: Session timer — startSession + endSession ─────────
  it("startSession activates timer and endSession computes duration", () => {
    // Mock Date.now() to return deterministic timestamps so we can
    // verify the duration calculation. We use mockReturnValue (not
    // mockReturnValueOnce) because React/TanStack internals may call
    // Date.now() during rendering, consuming "once" mocks prematurely.
    // We set the value right before each action and it persists until
    // we change it again.
    const dateNowSpy = jest.spyOn(Date, "now");

    const { Wrapper } = createTestSetup();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    // Set Date.now to 1,000,000 ms (an arbitrary non-zero start time).
    // Note: startTime must be non-zero because the store uses `startTime ?`
    // as a null check — 0 is falsy in JS and would skip duration calculation.
    const start = 1_000_000;
    const fortyFiveMinMs = 1000 * 60 * 45; // 2,700,000 ms
    dateNowSpy.mockReturnValue(start);

    // Start a session at gym-1. The store should become active.
    act(() => {
      result.current.startSession("gym-1");
    });

    expect(result.current.isActive).toBe(true);
    expect(result.current.gymId).toBe("gym-1");
    expect(result.current.startTime).toBe(start);

    // Set Date.now to 45 minutes after the start.
    // endSession will capture this as endTime and compute duration.
    dateNowSpy.mockReturnValue(start + fortyFiveMinMs);

    act(() => {
      result.current.endSession();
    });

    // Session should now be inactive with a computed duration of 45 minutes.
    expect(result.current.isActive).toBe(false);
    expect(result.current.duration).toBe(45);
    expect(result.current.endTime).toBe(start + fortyFiveMinMs);

    // Cleanup: restore Date.now to its real implementation.
    dateNowSpy.mockRestore();
  });
});
