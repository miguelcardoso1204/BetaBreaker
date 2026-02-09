/**
 * useSavedRoutes Hook Tests — Favorite Toggle Logic
 *
 * These hooks wrap savedRoutesService with TanStack Query to provide:
 *   - `useIsFavorite(routeId)` — reactive boolean for whether the current
 *     user has favorited a specific route (drives the star icon fill state)
 *   - `useToggleFavorite(routeId)` — mutation that adds/removes the favorite,
 *     with optimistic cache updates for instant UI feedback
 *
 * Mock strategy:
 *   - Mock savedRoutesService (not Supabase) — hooks don't know about PostgREST
 *   - Mock useAuth to provide a stable user ID for the query
 *   - Wrap renderHook in QueryClientProvider with retry: false
 *
 * Why mock useAuth?
 * The saved_routes table is user-scoped — every query needs the current user's
 * ID. In production, useAuth provides this from the Supabase session. In tests,
 * we mock it to return a fixed user ID so we can verify the correct ID is
 * passed to the service layer.
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock savedRoutesService ──────────────────────────────────────────
jest.mock("@/services/savedRoutes.service", () => ({
  savedRoutesService: {
    getSavedRoute: jest.fn(),
    saveRoute: jest.fn(),
    unsaveRoute: jest.fn(),
  },
}));

// ── Mock useAuth ──────────────────────────────────────────────────────
// Return a fixed user so the hooks know whose favorites to query.
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { user: { id: "user-1" } },
    isAuthenticated: true,
  }),
}));

import { useIsFavorite, useToggleFavorite } from "../useSavedRoutes";

const { savedRoutesService } = jest.requireMock<{
  savedRoutesService: {
    getSavedRoute: jest.Mock;
    saveRoute: jest.Mock;
    unsaveRoute: jest.Mock;
  };
}>("@/services/savedRoutes.service");

// ── Test wrapper ──────────────────────────────────────────────────────
// TanStack Query hooks must render inside a QueryClientProvider.
// Fresh client per test prevents cache leakage between tests.

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

// ── useIsFavorite tests ──────────────────────────────────────────────

describe("useIsFavorite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns isLoading true initially", () => {
    // Before the query resolves, the hook should report loading state.
    // The screen uses this to conditionally show a placeholder star.
    savedRoutesService.getSavedRoute.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useIsFavorite("route-1"),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFavorite).toBe(false);
  });

  it("returns isFavorite true when saved route exists", async () => {
    // When the service finds a matching row, the route is favorited.
    // The hook should expose this as a simple boolean for the UI.
    savedRoutesService.getSavedRoute.mockResolvedValueOnce({
      data: {
        id: "saved-1",
        user_id: "user-1",
        route_id: "route-1",
        save_type: "favorite",
        created_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    });

    const { result } = renderHook(
      () => useIsFavorite("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFavorite).toBe(true);
    // Verify the service was called with the correct user ID and save type
    expect(savedRoutesService.getSavedRoute).toHaveBeenCalledWith(
      "user-1",
      "route-1",
      "favorite"
    );
  });

  it("returns isFavorite false when no saved route exists", async () => {
    // When the service returns null data, the route is not favorited.
    savedRoutesService.getSavedRoute.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(
      () => useIsFavorite("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFavorite).toBe(false);
  });
});

// ── useToggleFavorite tests ──────────────────────────────────────────

describe("useToggleFavorite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls saveRoute when route is not currently favorited", async () => {
    // When the user taps the star on an un-favorited route, the mutation
    // should INSERT a new saved_route row via saveRoute().
    savedRoutesService.getSavedRoute.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    savedRoutesService.saveRoute.mockResolvedValueOnce({
      data: { id: "saved-1", user_id: "user-1", route_id: "route-1", save_type: "favorite" },
      error: null,
    });

    const wrapper = createWrapper();

    const { result } = renderHook(
      () => ({
        favorite: useIsFavorite("route-1"),
        toggle: useToggleFavorite("route-1"),
      }),
      { wrapper }
    );

    // Wait for the initial query to resolve (not favorited)
    await waitFor(() => {
      expect(result.current.favorite.isLoading).toBe(false);
    });

    // Trigger the toggle mutation
    await act(async () => {
      result.current.toggle.mutate();
    });

    // Should have called saveRoute (not unsaveRoute)
    expect(savedRoutesService.saveRoute).toHaveBeenCalledWith(
      "user-1",
      "route-1",
      "favorite"
    );
    expect(savedRoutesService.unsaveRoute).not.toHaveBeenCalled();
  });

  it("calls unsaveRoute when route is currently favorited", async () => {
    // When the user taps the star on an already-favorited route, the
    // mutation should DELETE the saved_route row via unsaveRoute().
    savedRoutesService.getSavedRoute.mockResolvedValueOnce({
      data: {
        id: "saved-1",
        user_id: "user-1",
        route_id: "route-1",
        save_type: "favorite",
        created_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    });
    savedRoutesService.unsaveRoute.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const wrapper = createWrapper();

    const { result } = renderHook(
      () => ({
        favorite: useIsFavorite("route-1"),
        toggle: useToggleFavorite("route-1"),
      }),
      { wrapper }
    );

    // Wait for the initial query to resolve (is favorited)
    await waitFor(() => {
      expect(result.current.favorite.isFavorite).toBe(true);
    });

    // Trigger the toggle mutation
    await act(async () => {
      result.current.toggle.mutate();
    });

    // Should have called unsaveRoute (not saveRoute)
    expect(savedRoutesService.unsaveRoute).toHaveBeenCalledWith(
      "user-1",
      "route-1",
      "favorite"
    );
    expect(savedRoutesService.saveRoute).not.toHaveBeenCalled();
  });
});
