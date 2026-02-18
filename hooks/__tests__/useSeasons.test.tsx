/**
 * useSeasons Hook Tests (Step 15.6)
 *
 * Tests the TanStack Query wrappers for season management:
 *   Queries:
 *     - useSeasons(gymId) — all seasons for a gym
 *   Mutations:
 *     - useCreateSeason() — create a new season
 *     - useCloseSeason() — close season + archive routes (compound call)
 *     - useDeleteSeason() — remove a season
 *
 * Mock strategy (matching useMaintenanceTickets.test.tsx):
 *   - Mock seasonsService (not Supabase) — hooks don't know about PostgREST
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock seasonsService ──────────────────────────────────────────────
jest.mock("@/services/seasons.service", () => ({
  seasonsService: {
    getSeasonsByGym: jest.fn(),
    createSeason: jest.fn(),
    closeSeason: jest.fn(),
    archiveGymRoutes: jest.fn(),
    deleteSeason: jest.fn(),
  },
}));

import {
  useSeasons,
  useCreateSeason,
  useCloseSeason,
  useDeleteSeason,
} from "../useSeasons";

const { seasonsService } = jest.requireMock<{
  seasonsService: {
    getSeasonsByGym: jest.Mock;
    createSeason: jest.Mock;
    closeSeason: jest.Mock;
    archiveGymRoutes: jest.Mock;
    deleteSeason: jest.Mock;
  };
}>("@/services/seasons.service");

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

// ── useSeasons tests ─────────────────────────────────────────────────

describe("useSeasons", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches seasons for a gym", async () => {
    const mockSeasons = [
      { id: "s1", name: "Spring 2026", status: "active" },
      { id: "s2", name: "Winter 2025", status: "closed" },
    ];
    seasonsService.getSeasonsByGym.mockResolvedValueOnce({
      data: mockSeasons,
      error: null,
    });

    const { result } = renderHook(
      () => useSeasons("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.seasons).toEqual(mockSeasons);
    expect(seasonsService.getSeasonsByGym).toHaveBeenCalledWith("gym-1");
  });

  it("throws on service error", async () => {
    seasonsService.getSeasonsByGym.mockResolvedValueOnce({
      data: null,
      error: new Error("Permission denied"),
    });

    const { result } = renderHook(
      () => useSeasons("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.seasons).toEqual([]);
  });

  it("is disabled when gymId is null", () => {
    const { result } = renderHook(
      () => useSeasons(null),
      { wrapper: createWrapper() }
    );

    // Query should not fire — stays in idle state
    expect(seasonsService.getSeasonsByGym).not.toHaveBeenCalled();
    expect(result.current.seasons).toEqual([]);
  });
});

// ── useCreateSeason tests ────────────────────────────────────────────

describe("useCreateSeason", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls createSeason and succeeds", async () => {
    seasonsService.createSeason.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useCreateSeason(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        gym_id: "gym-1",
        name: "Spring 2026",
        start_date: "2026-03-01",
        end_date: "2026-06-01",
      });
    });

    expect(seasonsService.createSeason).toHaveBeenCalledWith({
      gym_id: "gym-1",
      name: "Spring 2026",
      start_date: "2026-03-01",
      end_date: "2026-06-01",
    });
  });

  it("throws on service error", async () => {
    seasonsService.createSeason.mockResolvedValueOnce({
      data: null,
      error: new Error("Insert failed"),
    });

    const { result } = renderHook(() => useCreateSeason(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          gym_id: "gym-1",
          name: "Spring 2026",
          start_date: "2026-03-01",
          end_date: "2026-06-01",
        });
      })
    ).rejects.toThrow("Insert failed");
  });
});

// ── useCloseSeason tests ─────────────────────────────────────────────

describe("useCloseSeason", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls closeSeason then archiveGymRoutes sequentially", async () => {
    // Closing a season is a compound operation: first close the season,
    // then batch-archive all active routes for the gym. The hook calls
    // both service methods in sequence.
    seasonsService.closeSeason.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    seasonsService.archiveGymRoutes.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useCloseSeason(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        seasonId: "season-1",
        gymId: "gym-1",
      });
    });

    // Both service methods should have been called
    expect(seasonsService.closeSeason).toHaveBeenCalledWith("season-1");
    expect(seasonsService.archiveGymRoutes).toHaveBeenCalledWith("gym-1");

    // closeSeason should be called before archiveGymRoutes
    const closeOrder = seasonsService.closeSeason.mock.invocationCallOrder[0];
    const archiveOrder = seasonsService.archiveGymRoutes.mock.invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(archiveOrder);
  });

  it("throws if closeSeason fails (does not call archiveGymRoutes)", async () => {
    seasonsService.closeSeason.mockResolvedValueOnce({
      data: null,
      error: new Error("Update failed"),
    });

    const { result } = renderHook(() => useCloseSeason(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          seasonId: "season-1",
          gymId: "gym-1",
        });
      })
    ).rejects.toThrow("Update failed");

    // archiveGymRoutes should NOT have been called since closeSeason failed
    expect(seasonsService.archiveGymRoutes).not.toHaveBeenCalled();
  });
});

// ── useDeleteSeason tests ────────────────────────────────────────────

describe("useDeleteSeason", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls deleteSeason with id", async () => {
    seasonsService.deleteSeason.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteSeason(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ seasonId: "season-1" });
    });

    expect(seasonsService.deleteSeason).toHaveBeenCalledWith("season-1");
  });
});
