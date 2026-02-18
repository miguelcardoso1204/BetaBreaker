/**
 * useAdminDashboard Hook Tests (Step 15.1)
 *
 * Tests for the hook that provides admin dashboard data: route counts,
 * total ascents, and recent activity. The hook wraps dashboardService
 * with four parallel TanStack queries.
 *
 * Mock strategy:
 * - Mock dashboardService methods (return controlled data/error)
 * - Wrap rendering in QueryClientProvider for TanStack Query
 * - Same pattern as useBilling.test.ts
 */

import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ───────────────────────────────────────────────────────────

jest.mock("@/services/dashboard.service", () => ({
  dashboardService: {
    getActiveRouteCount: jest.fn(),
    getRetiringRouteCount: jest.fn(),
    getTotalAscentCount: jest.fn(),
    getRecentActivity: jest.fn(),
  },
}));

import { useAdminDashboard } from "../useAdminDashboard";

const { dashboardService } = jest.requireMock<{
  dashboardService: {
    getActiveRouteCount: jest.Mock;
    getRetiringRouteCount: jest.Mock;
    getTotalAscentCount: jest.Mock;
    getRecentActivity: jest.Mock;
  };
}>("@/services/dashboard.service");

// ── Test wrapper with QueryClient ───────────────────────────────────
// TanStack Query hooks require a QueryClientProvider in the tree.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

// ── Helper: resolve all four service mocks with defaults ────────────
function mockAllSuccess(overrides?: {
  activeCount?: number;
  retiringCount?: number;
  ascentCount?: number;
  activity?: any[];
}) {
  dashboardService.getActiveRouteCount.mockResolvedValueOnce({
    count: overrides?.activeCount ?? 0,
    data: null,
    error: null,
  });
  dashboardService.getRetiringRouteCount.mockResolvedValueOnce({
    count: overrides?.retiringCount ?? 0,
    data: null,
    error: null,
  });
  dashboardService.getTotalAscentCount.mockResolvedValueOnce({
    count: overrides?.ascentCount ?? 0,
    data: null,
    error: null,
  });
  dashboardService.getRecentActivity.mockResolvedValueOnce({
    data: overrides?.activity ?? [],
    error: null,
  });
}

describe("useAdminDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns active route count", async () => {
    // The dashboard's "Active Routes" widget should show the count
    // from the routes table filtered by status = 'active'.
    mockAllSuccess({ activeCount: 15 });

    const { result } = renderHook(() => useAdminDashboard("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeRoutes).toBe(15);
    expect(dashboardService.getActiveRouteCount).toHaveBeenCalledWith("gym-1");
  });

  it("returns retiring route count", async () => {
    // The "Retiring Soon" widget shows routes about to be taken down.
    mockAllSuccess({ retiringCount: 4 });

    const { result } = renderHook(() => useAdminDashboard("gym-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.retiringRoutes).toBe(4);
    expect(dashboardService.getRetiringRouteCount).toHaveBeenCalledWith("gym-2");
  });

  it("returns total ascent count", async () => {
    // "Total Ascents" replaces the spec's "scan count" — shows overall
    // climbing activity at the gym.
    mockAllSuccess({ ascentCount: 200 });

    const { result } = renderHook(() => useAdminDashboard("gym-3"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.totalAscents).toBe(200);
    expect(dashboardService.getTotalAscentCount).toHaveBeenCalledWith("gym-3");
  });

  it("returns recent activity list", async () => {
    // The activity feed shows ascents with climber name, route, and status.
    const mockActivity = [
      {
        id: "asc-1",
        status: "send",
        attempts: 2,
        created_at: "2026-02-18T10:00:00Z",
        route: { name: "Crimpy Corner", gym_id: "gym-4", canonical_grade: 12 },
        climber: { display_name: "Alice" },
      },
    ];

    mockAllSuccess({ activity: mockActivity });

    const { result } = renderHook(() => useAdminDashboard("gym-4"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.recentActivity).toEqual(mockActivity);
    expect(dashboardService.getRecentActivity).toHaveBeenCalledWith("gym-4");
  });

  it("disables queries when gymId is null", () => {
    // When no gym is selected, all queries should be disabled — no
    // service calls, zeroes/empty defaults returned.
    const { result } = renderHook(() => useAdminDashboard(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.activeRoutes).toBe(0);
    expect(result.current.retiringRoutes).toBe(0);
    expect(result.current.totalAscents).toBe(0);
    expect(result.current.recentActivity).toEqual([]);

    // No service methods should have been called
    expect(dashboardService.getActiveRouteCount).not.toHaveBeenCalled();
    expect(dashboardService.getRetiringRouteCount).not.toHaveBeenCalled();
    expect(dashboardService.getTotalAscentCount).not.toHaveBeenCalled();
    expect(dashboardService.getRecentActivity).not.toHaveBeenCalled();
  });

  it("aggregates isLoading across all queries", async () => {
    // isLoading should be true while any of the four queries is pending.
    // We make the mocks never resolve to keep queries in loading state.
    dashboardService.getActiveRouteCount.mockReturnValueOnce(new Promise(() => {}));
    dashboardService.getRetiringRouteCount.mockReturnValueOnce(new Promise(() => {}));
    dashboardService.getTotalAscentCount.mockReturnValueOnce(new Promise(() => {}));
    dashboardService.getRecentActivity.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useAdminDashboard("gym-5"), {
      wrapper: createWrapper(),
    });

    // All queries are pending, so isLoading should be true
    expect(result.current.isLoading).toBe(true);
  });

  it("surfaces first error from any query", async () => {
    // If any query fails, the hook should expose the error so the
    // screen can display an error state.
    const testError = new Error("DB connection failed");

    dashboardService.getActiveRouteCount.mockResolvedValueOnce({
      count: 0,
      data: null,
      error: testError,
    });
    dashboardService.getRetiringRouteCount.mockResolvedValueOnce({
      count: 0,
      data: null,
      error: null,
    });
    dashboardService.getTotalAscentCount.mockResolvedValueOnce({
      count: 0,
      data: null,
      error: null,
    });
    dashboardService.getRecentActivity.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useAdminDashboard("gym-6"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error?.message).toBe("DB connection failed");
  });
});
