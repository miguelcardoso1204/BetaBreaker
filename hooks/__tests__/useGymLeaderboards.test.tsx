/**
 * useGymLeaderboards Hook Tests
 *
 * The gym leaderboards hook wraps leaderboardService.getGymLeaderboards()
 * with TanStack Query. It fetches the list of leaderboards for a specific
 * gym, filtered by active or retired status.
 *
 * Mock strategy: Mock leaderboardService (not Supabase), renderHook with
 * a fresh QueryClient wrapped in QueryClientProvider.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock leaderboardService ────────────────────────────────────────
jest.mock("@/services/leaderboard.service", () => ({
  leaderboardService: {
    getGymLeaderboards: jest.fn(),
  },
}));

import { useGymLeaderboards } from "../useGymLeaderboards";

const { leaderboardService } = jest.requireMock<{
  leaderboardService: {
    getGymLeaderboards: jest.Mock;
  };
}>("@/services/leaderboard.service");

// ── Test wrapper ──────────────────────────────────────────────────
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

const mockLeaderboards = [
  {
    id: "lb-1",
    name: "March Madness",
    starts_at: "2026-03-01T00:00:00Z",
    ends_at: "2026-03-31T23:59:59Z",
    total_participants: 25,
  },
  {
    id: "lb-2",
    name: "Flash Friday",
    starts_at: "2026-03-14T00:00:00Z",
    ends_at: "2026-03-14T23:59:59Z",
    total_participants: 12,
  },
];

describe("useGymLeaderboards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns gym leaderboards on success", async () => {
    leaderboardService.getGymLeaderboards.mockResolvedValueOnce({
      data: mockLeaderboards,
      error: null,
    });

    const { result } = renderHook(
      () => useGymLeaderboards("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockLeaderboards);
    // Default active=true
    expect(leaderboardService.getGymLeaderboards).toHaveBeenCalledWith("gym-1", true);
  });

  it("returns loading state initially", () => {
    leaderboardService.getGymLeaderboards.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useGymLeaderboards("gym-1"),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("passes active=false for retired leaderboards", async () => {
    leaderboardService.getGymLeaderboards.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(
      () => useGymLeaderboards("gym-1", false),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(leaderboardService.getGymLeaderboards).toHaveBeenCalledWith("gym-1", false);
  });

  it("returns error on failure", async () => {
    leaderboardService.getGymLeaderboards.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(
      () => useGymLeaderboards("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});
