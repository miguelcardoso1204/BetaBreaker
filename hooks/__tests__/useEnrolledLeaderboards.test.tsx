/**
 * useEnrolledLeaderboards Hook Tests
 *
 * The enrolled leaderboards hook wraps leaderboardService.getEnrolledLeaderboards()
 * with TanStack Query. It fetches the user's standings across all gyms via
 * the get_enrolled_leaderboards() Postgres RPC function, filtered by active
 * or retired status.
 *
 * Key behaviors tested:
 *   1. Returns data from the service on success
 *   2. Shows loading state while the query resolves
 *   3. Disabled when userId is undefined (not logged in)
 *   4. Propagates errors from the service
 *   5. Passes active filter to the service
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
    getEnrolledLeaderboards: jest.fn(),
  },
}));

import { useEnrolledLeaderboards } from "../useEnrolledLeaderboards";

const { leaderboardService } = jest.requireMock<{
  leaderboardService: {
    getEnrolledLeaderboards: jest.Mock;
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

const mockEnrolled = [
  {
    id: "entry-1",
    leaderboard_id: "lb-1",
    gym_id: "gym-1",
    gym_name: "Boulder Haven",
    leaderboard_name: "March Madness",
    starts_at: "2026-03-01T00:00:00Z",
    ends_at: "2026-03-31T23:59:59Z",
    rank: 2,
    score: 15,
    total_participants: 10,
  },
  {
    id: "entry-2",
    leaderboard_id: "lb-2",
    gym_id: "gym-2",
    gym_name: "Vertical World",
    leaderboard_name: "Volume Week",
    starts_at: "2026-03-01T00:00:00Z",
    ends_at: "2026-03-07T23:59:59Z",
    rank: 1,
    score: 8,
    total_participants: 5,
  },
];

describe("useEnrolledLeaderboards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns enrolled leaderboards on success", async () => {
    // When the RPC returns data, the hook should expose it via result.data.
    leaderboardService.getEnrolledLeaderboards.mockResolvedValueOnce({
      data: mockEnrolled,
      error: null,
    });

    const { result } = renderHook(
      () => useEnrolledLeaderboards("user-123"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockEnrolled);
    // Default active=true
    expect(leaderboardService.getEnrolledLeaderboards).toHaveBeenCalledWith("user-123", true);
  });

  it("returns loading state initially", () => {
    leaderboardService.getEnrolledLeaderboards.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useEnrolledLeaderboards("user-123"),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("disabled when userId is undefined", () => {
    // When the user is not logged in, the query should be disabled.
    const { result } = renderHook(
      () => useEnrolledLeaderboards(undefined),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(leaderboardService.getEnrolledLeaderboards).not.toHaveBeenCalled();
  });

  it("returns error on failure", async () => {
    leaderboardService.getEnrolledLeaderboards.mockResolvedValueOnce({
      data: null,
      error: { message: "Database unreachable" },
    });

    const { result } = renderHook(
      () => useEnrolledLeaderboards("user-123"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it("passes active=false for retired leaderboards", async () => {
    // When active=false, the hook should pass it to the service.
    leaderboardService.getEnrolledLeaderboards.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(
      () => useEnrolledLeaderboards("user-123", false),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(leaderboardService.getEnrolledLeaderboards).toHaveBeenCalledWith("user-123", false);
  });
});
