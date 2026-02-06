/**
 * useRoutes / useRouteDetail Hook Tests
 *
 * These hooks wrap routeService methods with TanStack Query, adding:
 * - Caching: identical filter combos share one cache entry
 * - Loading/error states: screens get { data, isLoading, error }
 * - Auto-refetch: changing filters triggers a new query automatically
 *
 * Mock strategy: We mock the SERVICE layer (routeService), not Supabase.
 * The hook doesn't know or care about PostgREST chains — it just calls
 * routeService.getRoutes(filters) and lets TanStack Query manage the rest.
 *
 * TanStack Query setup: Hooks must render inside a QueryClientProvider.
 * We create a fresh QueryClient per test (with retry disabled) to prevent
 * cache leakage between tests and avoid flaky retry-related timing issues.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock routeService ─────────────────────────────────────────────
jest.mock("@/services/routes.service", () => ({
  routeService: {
    getRoutes: jest.fn(),
    getRouteById: jest.fn(),
  },
}));

import { useRoutes, useRouteDetail } from "../useRoutes";

const { routeService } = jest.requireMock<{
  routeService: {
    getRoutes: jest.Mock;
    getRouteById: jest.Mock;
  };
}>("@/services/routes.service");

// ── Test wrapper ──────────────────────────────────────────────────
// TanStack Query hooks must render inside a QueryClientProvider.
// We create a fresh client per test with retry disabled so failed
// queries don't retry and cause flaky test timing.

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// ── Fixtures ──────────────────────────────────────────────────────

const mockRoutes = [
  { id: "route-1", name: "Baby Steps", canonical_grade: 0, status: "active", gym_id: "gym-1" },
  { id: "route-2", name: "The Crimp", canonical_grade: 10, status: "active", gym_id: "gym-1" },
];

const mockRouteDetail = {
  id: "route-1",
  name: "Baby Steps",
  canonical_grade: 0,
  status: "active",
  gym_id: "gym-1",
  setter: { display_name: "Sam Setter", avatar_url: null },
};

describe("useRoutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Before the query resolves, isLoading should be true and data undefined.
    // This is the state screens use to show a loading spinner.
    routeService.getRoutes.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useRoutes({ gymId: "gym-1" }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns routes data after fetch", async () => {
    // The service returns { data, error } — the hook should expose
    // just the data array (unwrapped from the Supabase response shape).
    routeService.getRoutes.mockResolvedValueOnce({
      data: mockRoutes,
      error: null,
    });

    const { result } = renderHook(
      () => useRoutes({ gymId: "gym-1" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockRoutes);
    expect(routeService.getRoutes).toHaveBeenCalledWith({ gymId: "gym-1" });
  });

  it("returns error state on failure", async () => {
    // When the service returns an error, TanStack Query sets the error
    // state. Screens use this to show an error message.
    routeService.getRoutes.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(
      () => useRoutes({ gymId: "gym-1" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it("passes filters to the service", async () => {
    // When the user applies filters (grade range, search, etc.), the hook
    // should forward them to the service unchanged. TanStack Query uses
    // the filters as part of the query key, so changing filters triggers
    // a new fetch automatically.
    routeService.getRoutes.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const filters = { gymId: "gym-1", gradeMin: 8, gradeMax: 16, sortBy: "grade" as const };

    const { result } = renderHook(
      () => useRoutes(filters),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(routeService.getRoutes).toHaveBeenCalledWith(filters);
  });
});

describe("useRouteDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches a single route by ID", async () => {
    // The detail hook fetches one route with setter info for the
    // route detail screen. The service does the PostgREST join —
    // the hook just wraps it in useQuery for caching.
    routeService.getRouteById.mockResolvedValueOnce({
      data: mockRouteDetail,
      error: null,
    });

    const { result } = renderHook(
      () => useRouteDetail("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockRouteDetail);
    expect(routeService.getRouteById).toHaveBeenCalledWith("route-1");
  });
});
