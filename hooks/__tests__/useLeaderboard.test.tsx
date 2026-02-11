/**
 * useLeaderboard Hook Tests
 *
 * The leaderboard hook wraps leaderboardService.getLeaderboard() with
 * TanStack Query, caching results by gym ID, time period, and scoring model.
 *
 * Leaderboards show ranked scores per gym per period per model. Each entry
 * includes the user's profile info (display_name, avatar_url) via PostgREST
 * resource embedding in the service layer.
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
    getLeaderboard: jest.fn(),
  },
}));

import { useLeaderboard } from "../useLeaderboard";

const { leaderboardService } = jest.requireMock<{
  leaderboardService: {
    getLeaderboard: jest.Mock;
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

const mockEntries = [
  {
    user_id: "user-1",
    gym_id: "gym-1",
    period: "weekly",
    rank: 1,
    score: 500,
    scoring_model: "hardest_grade",
    profile: { display_name: "ClimbKing", avatar_url: null },
  },
  {
    user_id: "user-2",
    gym_id: "gym-1",
    period: "weekly",
    rank: 2,
    score: 350,
    scoring_model: "hardest_grade",
    profile: { display_name: "BoulderQueen", avatar_url: "https://example.com/avatar.jpg" },
  },
];

describe("useLeaderboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Before the query resolves, isLoading is true — the leaderboard
    // screen shows a skeleton loader during this phase.
    leaderboardService.getLeaderboard.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useLeaderboard("gym-1", "weekly"),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns leaderboard entries on success", async () => {
    // Each entry has a rank, score, and embedded profile data.
    // The hook passes gymId, period, and model to the service, and TanStack
    // Query caches the result under ["leaderboard", gymId, period, model].
    leaderboardService.getLeaderboard.mockResolvedValueOnce({
      data: mockEntries,
      error: null,
    });

    const { result } = renderHook(
      () => useLeaderboard("gym-1", "weekly"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockEntries);
    // Default model should be 'hardest_grade'
    expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith(
      "gym-1", "weekly", "hardest_grade"
    );
  });

  it("returns error on failure", async () => {
    leaderboardService.getLeaderboard.mockResolvedValueOnce({
      data: null,
      error: { message: "Timeout" },
    });

    const { result } = renderHook(
      () => useLeaderboard("gym-1", "monthly"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it("uses default hardest_grade model when not specified", async () => {
    // When the model parameter is omitted, the hook should default to
    // 'hardest_grade' and include it in the query key for proper caching.
    leaderboardService.getLeaderboard.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    renderHook(
      () => useLeaderboard("gym-1", "2026-W06"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(leaderboardService.getLeaderboard).toHaveBeenCalled();
    });

    // Service should be called with the default model
    expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith(
      "gym-1", "2026-W06", "hardest_grade"
    );
  });

  it("passes custom scoring model to service", async () => {
    // When a specific model is provided (e.g., 'flash_rate'), it should
    // be forwarded to the service and included in the query key.
    leaderboardService.getLeaderboard.mockResolvedValueOnce({
      data: [{ score: 0.75, rank: 1, scoring_model: "flash_rate" }],
      error: null,
    });

    renderHook(
      () => useLeaderboard("gym-1", "2026-W06", "flash_rate"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(leaderboardService.getLeaderboard).toHaveBeenCalled();
    });

    // Service should receive the specified model
    expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith(
      "gym-1", "2026-W06", "flash_rate"
    );
  });
});
