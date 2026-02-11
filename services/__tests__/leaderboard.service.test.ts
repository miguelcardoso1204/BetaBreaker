/**
 * Leaderboard Service Tests
 *
 * These tests verify that leaderboardService methods correctly build
 * Supabase PostgREST query chains and RPC calls for leaderboard data.
 *
 * The leaderboard system has two main reads:
 *   - getLeaderboard: Ranked entries for a gym/period/model (PostgREST)
 *   - getEnrolledLeaderboards: User's standings across gyms (RPC function)
 *
 * Mock strategy: Same as gamification.service.test.ts — mock `@/lib/supabase`
 * and verify the query chain or RPC call is built correctly.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
// Must be inside jest.mock factory due to hoisting (temporal dead zone).
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { leaderboardService } from "../leaderboard.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock; rpc: jest.Mock };
}>("@/lib/supabase");

describe("leaderboardService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getLeaderboard ────────────────────────────────────────────────

  describe("getLeaderboard", () => {
    it("builds correct query with default hardest_grade model", async () => {
      // When no model is specified, getLeaderboard defaults to 'hardest_grade'.
      // The query chain should filter by gym_id, period, AND scoring_model,
      // then sort by rank ascending.
      const mockEntries = [
        { user_id: "u1", score: 15, rank: 1, scoring_model: "hardest_grade" },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockEntries,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await leaderboardService.getLeaderboard("gym-1", "2026-W06");

      expect(supabase.from).toHaveBeenCalledWith("leaderboard_entries");
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, profile:profiles(display_name, avatar_url)"
      );
      // Should filter by gym_id, period, AND scoring_model (default)
      expect(chainMock.eq).toHaveBeenNthCalledWith(1, "gym_id", "gym-1");
      expect(chainMock.eq).toHaveBeenNthCalledWith(2, "period", "2026-W06");
      expect(chainMock.eq).toHaveBeenNthCalledWith(3, "scoring_model", "hardest_grade");
      expect(chainMock.order).toHaveBeenCalledWith("rank");
      expect(result.data).toEqual(mockEntries);
    });

    it("passes custom scoring_model filter", async () => {
      // When a specific model is provided, it should be used in the eq filter
      // instead of the default 'hardest_grade'.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [{ score: 0.75, scoring_model: "flash_rate" }],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await leaderboardService.getLeaderboard("gym-1", "2026-W06", "flash_rate");

      // Third .eq() call should use 'flash_rate' instead of 'hardest_grade'
      expect(chainMock.eq).toHaveBeenNthCalledWith(3, "scoring_model", "flash_rate");
    });

    it("returns entries on success", async () => {
      // Verify the full response shape flows through correctly.
      const mockEntries = [
        {
          user_id: "u1",
          score: 500,
          rank: 1,
          scoring_model: "hardest_grade",
          profile: { display_name: "ClimbKing", avatar_url: null },
        },
        {
          user_id: "u2",
          score: 350,
          rank: 2,
          scoring_model: "hardest_grade",
          profile: { display_name: "BoulderQueen", avatar_url: "https://example.com/a.jpg" },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockEntries,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await leaderboardService.getLeaderboard("gym-1", "2026-W06");

      expect(result.data).toHaveLength(2);
      expect(result.error).toBeNull();
    });
  });

  // ── getEnrolledLeaderboards ─────────────────────────────────────────

  describe("getEnrolledLeaderboards", () => {
    it("calls RPC with userId", async () => {
      // getEnrolledLeaderboards delegates to the get_enrolled_leaderboards
      // Postgres function via supabase.rpc(). The function returns enriched
      // data with gym names and participant counts.
      const mockData = [
        {
          id: "entry-1",
          gym_id: "gym-1",
          gym_name: "Boulder Haven",
          period: "2026-W06",
          scoring_model: "hardest_grade",
          rank: 2,
          score: 15,
          total_participants: 10,
        },
      ];

      supabase.rpc.mockResolvedValueOnce({
        data: mockData,
        error: null,
      });

      const result = await leaderboardService.getEnrolledLeaderboards("user-123");

      expect(supabase.rpc).toHaveBeenCalledWith("get_enrolled_leaderboards", {
        p_user_id: "user-123",
      });
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it("returns empty array when user has no entries", async () => {
      // A user who has never logged ascents at any gym will have no
      // leaderboard entries. The RPC should return an empty array.
      supabase.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await leaderboardService.getEnrolledLeaderboards("new-user");

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });
});
