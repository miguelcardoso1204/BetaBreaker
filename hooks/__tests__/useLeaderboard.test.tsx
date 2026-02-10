/**
 * useLeaderboard Hook Tests
 *
 * The leaderboard hook wraps gamificationService.getLeaderboard() with
 * TanStack Query, caching results by gym ID and time period.
 *
 * Leaderboards show ranked scores per gym per period (weekly/monthly/all_time).
 * Each entry includes the user's profile info (display_name, avatar_url)
 * via PostgREST resource embedding in the service layer.
 *
 * Mock strategy: Mock gamificationService (not Supabase), renderHook with
 * a fresh QueryClient wrapped in QueryClientProvider.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock gamificationService ────────────────────────────────────────
jest.mock("@/services/gamification.service", () => ({
  gamificationService: {
    getLeaderboard: jest.fn(),
  },
}));

import { useLeaderboard } from "../useLeaderboard";

const { gamificationService } = jest.requireMock<{
  gamificationService: {
    getLeaderboard: jest.Mock;
  };
}>("@/services/gamification.service");

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
    profile: { display_name: "ClimbKing", avatar_url: null },
  },
  {
    user_id: "user-2",
    gym_id: "gym-1",
    period: "weekly",
    rank: 2,
    score: 350,
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
    gamificationService.getLeaderboard.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useLeaderboard("gym-1", "weekly"),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns leaderboard entries on success", async () => {
    // Each entry has a rank, score, and embedded profile data.
    // The hook passes gymId and period to the service, and TanStack
    // Query caches the result under ["leaderboard", gymId, period].
    gamificationService.getLeaderboard.mockResolvedValueOnce({
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
    expect(gamificationService.getLeaderboard).toHaveBeenCalledWith("gym-1", "weekly");
  });

  it("returns error on failure", async () => {
    gamificationService.getLeaderboard.mockResolvedValueOnce({
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
});
