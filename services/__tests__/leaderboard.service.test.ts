/**
 * Leaderboard Service Tests
 *
 * These tests verify that leaderboardService methods correctly build
 * Supabase PostgREST query chains and RPC calls for leaderboard data.
 *
 * The leaderboard system has four main operations:
 *   - getLeaderboardEntries: Ranked entries for a leaderboard (PostgREST)
 *   - getEnrolledLeaderboards: User's standings filtered by active/retired (RPC)
 *   - getGymLeaderboards: Gym's leaderboards filtered by active/retired (RPC)
 *   - createLeaderboard: Admin creates a new leaderboard (PostgREST INSERT)
 *
 * Mock strategy: Mock `@/lib/supabase` and verify the query chain or RPC
 * call is built correctly.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
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

  // ── getLeaderboardEntries ───────────────────────────────────────

  describe("getLeaderboardEntries", () => {
    it("builds correct query chain for a leaderboard ID", async () => {
      // The query should select entries with embedded profile data,
      // filter by leaderboard_id, and sort by rank ascending.
      const mockEntries = [
        { user_id: "u1", score: 15, rank: 1 },
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

      const result = await leaderboardService.getLeaderboardEntries("lb-1");

      expect(supabase.from).toHaveBeenCalledWith("leaderboard_entries");
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, profile:profiles(display_name, avatar_url)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("leaderboard_id", "lb-1");
      expect(chainMock.order).toHaveBeenCalledWith("rank");
      expect(result.data).toEqual(mockEntries);
    });

    it("returns entries with profile data on success", async () => {
      const mockEntries = [
        {
          user_id: "u1",
          score: 500,
          rank: 1,
          profile: { display_name: "ClimbKing", avatar_url: null },
        },
        {
          user_id: "u2",
          score: 350,
          rank: 2,
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

      const result = await leaderboardService.getLeaderboardEntries("lb-1");

      expect(result.data).toHaveLength(2);
      expect(result.error).toBeNull();
    });
  });

  // ── getEnrolledLeaderboards ─────────────────────────────────────

  describe("getEnrolledLeaderboards", () => {
    it("calls RPC with userId and active=true by default", async () => {
      const mockData = [
        {
          id: "entry-1",
          leaderboard_id: "lb-1",
          gym_id: "gym-1",
          gym_name: "Boulder Haven",
          leaderboard_name: "March Madness",
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
        p_active: true,
      });
      expect(result.data).toEqual(mockData);
    });

    it("passes active=false for retired leaderboards", async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null });

      await leaderboardService.getEnrolledLeaderboards("user-123", false);

      expect(supabase.rpc).toHaveBeenCalledWith("get_enrolled_leaderboards", {
        p_user_id: "user-123",
        p_active: false,
      });
    });

    it("returns empty array when user has no entries", async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null });

      const result = await leaderboardService.getEnrolledLeaderboards("new-user");

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // ── getGymLeaderboards ──────────────────────────────────────────

  describe("getGymLeaderboards", () => {
    it("calls RPC with gymId and active=true by default", async () => {
      const mockData = [
        {
          id: "lb-1",
          name: "March Madness",
          starts_at: "2026-03-01T00:00:00Z",
          ends_at: "2026-03-31T23:59:59Z",
          total_participants: 25,
        },
      ];

      supabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

      const result = await leaderboardService.getGymLeaderboards("gym-1");

      expect(supabase.rpc).toHaveBeenCalledWith("get_gym_leaderboards", {
        p_gym_id: "gym-1",
        p_active: true,
      });
      expect(result.data).toEqual(mockData);
    });

    it("passes active=false for retired leaderboards", async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null });

      await leaderboardService.getGymLeaderboards("gym-1", false);

      expect(supabase.rpc).toHaveBeenCalledWith("get_gym_leaderboards", {
        p_gym_id: "gym-1",
        p_active: false,
      });
    });
  });

  // ── createLeaderboard ───────────────────────────────────────────

  describe("createLeaderboard", () => {
    it("inserts a new leaderboard with correct fields", async () => {
      const chainMock = {
        insert: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await leaderboardService.createLeaderboard({
        gymId: "gym-1",
        name: "Flash Friday",
        startsAt: "2026-03-14T00:00:00Z",
        endsAt: "2026-03-14T23:59:59Z",
      });

      expect(supabase.from).toHaveBeenCalledWith("leaderboards");
      expect(chainMock.insert).toHaveBeenCalledWith({
        gym_id: "gym-1",
        name: "Flash Friday",
        starts_at: "2026-03-14T00:00:00Z",
        ends_at: "2026-03-14T23:59:59Z",
        rules: null,
        prizes: null,
      });
    });
  });
});
