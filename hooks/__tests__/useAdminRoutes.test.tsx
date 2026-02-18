/**
 * useAdminRoutes Hook Tests — TanStack Query Wrappers for Admin Route CRUD
 *
 * These hooks wrap routeService with TanStack Query to provide:
 *   - useAdminRoutes(gymId) — query for all routes (active + retiring + archived)
 *   - useGymSetters(gymId) — query for users who can be assigned as setters
 *   - useCreateRoute() — mutation to insert a new route
 *   - useUpdateRoute() — mutation to edit route info or change status
 *   - useDeleteRoute() — mutation to remove a route
 *   - useGenerateQr() — mutation to generate a signed QR token
 *
 * Mock strategy (matching useEvents.test.tsx):
 *   - Mock routeService (not Supabase) — hooks don't know about PostgREST
 *   - Mock useAuth to provide a stable user ID + homeGymId
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock routeService ────────────────────────────────────────────────
jest.mock("@/services/routes.service", () => ({
  routeService: {
    getRoutes: jest.fn(),
    getGymSetters: jest.fn(),
    createRoute: jest.fn(),
    updateRoute: jest.fn(),
    deleteRoute: jest.fn(),
    generateQrToken: jest.fn(),
  },
}));

// ── Mock useAuth ──────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1", homeGymId: "gym-1" },
    session: { user: { id: "admin-1" } },
    isAuthenticated: true,
    role: "gym_admin",
  }),
}));

import {
  useAdminRoutes,
  useGymSetters,
  useCreateRoute,
  useUpdateRoute,
  useDeleteRoute,
  useGenerateQr,
} from "../useAdminRoutes";

const { routeService } = jest.requireMock<{
  routeService: {
    getRoutes: jest.Mock;
    getGymSetters: jest.Mock;
    createRoute: jest.Mock;
    updateRoute: jest.Mock;
    deleteRoute: jest.Mock;
    generateQrToken: jest.Mock;
  };
}>("@/services/routes.service");

// ── Test wrapper ──────────────────────────────────────────────────────
// Fresh QueryClient per test prevents cache leakage between tests.

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

// ── useAdminRoutes tests ──────────────────────────────────────────────

describe("useAdminRoutes", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches routes with all statuses for admin view", async () => {
    // Admin route list shows ALL statuses (active, retiring_soon, archived)
    // unlike the climber view which defaults to only active + retiring_soon.
    const mockRoutes = [
      { id: "route-1", name: "Crimper", status: "active" },
      { id: "route-2", name: "Old Slab", status: "archived" },
    ];
    routeService.getRoutes.mockResolvedValueOnce({
      data: mockRoutes,
      error: null,
    });

    const { result } = renderHook(() => useAdminRoutes("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.routes).toEqual(mockRoutes);
    // Verify all three statuses are requested for the admin view
    expect(routeService.getRoutes).toHaveBeenCalledWith({
      gymId: "gym-1",
      status: ["active", "retiring_soon", "archived"],
    });
  });

  it("is disabled when gymId is null", async () => {
    // If the admin's home gym hasn't loaded yet, the query should be
    // disabled to prevent fetching with an undefined gymId.
    const { result } = renderHook(() => useAdminRoutes(null), {
      wrapper: createWrapper(),
    });

    // Should not fire the query at all
    expect(routeService.getRoutes).not.toHaveBeenCalled();
    expect(result.current.routes).toEqual([]);
  });
});

// ── useGymSetters tests ───────────────────────────────────────────────

describe("useGymSetters", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches setter list for a gym", async () => {
    const mockSetters = [
      {
        user_id: "setter-1",
        role: "setter",
        profile: { id: "setter-1", display_name: "RouteSetterPro" },
      },
    ];
    routeService.getGymSetters.mockResolvedValueOnce({
      data: mockSetters,
      error: null,
    });

    const { result } = renderHook(() => useGymSetters("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.setters).toEqual(mockSetters);
    expect(routeService.getGymSetters).toHaveBeenCalledWith("gym-1");
  });
});

// ── useCreateRoute tests ──────────────────────────────────────────────

describe("useCreateRoute", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with route data", async () => {
    routeService.createRoute.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useCreateRoute(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        gymId: "gym-1",
        name: "New Crimper",
        canonicalGrade: 14,
        color: "#EF4444",
        wallSection: "South",
        setterId: "setter-1",
      });
    });

    // Hook transforms camelCase to snake_case for the service layer
    expect(routeService.createRoute).toHaveBeenCalledWith({
      gym_id: "gym-1",
      name: "New Crimper",
      canonical_grade: 14,
      color: "#EF4444",
      wall_section: "South",
      setter_id: "setter-1",
    });
  });
});

// ── useUpdateRoute tests ──────────────────────────────────────────────

describe("useUpdateRoute", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with routeId and partial update data", async () => {
    routeService.updateRoute.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useUpdateRoute(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        routeId: "route-1",
        data: { name: "Updated Name", status: "retiring_soon" },
      });
    });

    expect(routeService.updateRoute).toHaveBeenCalledWith("route-1", {
      name: "Updated Name",
      status: "retiring_soon",
    });
  });
});

// ── useDeleteRoute tests ──────────────────────────────────────────────

describe("useDeleteRoute", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with routeId", async () => {
    routeService.deleteRoute.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteRoute(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ routeId: "route-1" });
    });

    expect(routeService.deleteRoute).toHaveBeenCalledWith("route-1");
  });
});

// ── useGenerateQr tests ───────────────────────────────────────────────

describe("useGenerateQr", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with routeId and returns token", async () => {
    routeService.generateQrToken.mockResolvedValueOnce({
      data: { token: "signed-jwt-token-123" },
      error: null,
    });

    const { result } = renderHook(() => useGenerateQr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ routeId: "route-1" });
    });

    expect(routeService.generateQrToken).toHaveBeenCalledWith("route-1");
  });

  it("surfaces error when Edge Function fails", async () => {
    // If the sign-qr Edge Function returns an error (e.g., route not found,
    // auth failure), the mutation should propagate it to the UI.
    routeService.generateQrToken.mockResolvedValueOnce({
      data: null,
      error: { message: "Route not found" },
    });

    const { result } = renderHook(() => useGenerateQr(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ routeId: "invalid-route" });
    });

    // TanStack Query should surface the error from the mutation
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
