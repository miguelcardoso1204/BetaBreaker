/**
 * Gamification Service Tests
 *
 * These tests verify that gamificationService methods correctly build
 * Supabase PostgREST query chains for fetching badges, user badges,
 * streaks, and leaderboard data.
 *
 * The gamification system has four main reads and one write:
 *   - Badge definitions (what badges exist)
 *   - User badges (which badges a user has earned)
 *   - User streak (current weekly climbing streak)
 *   - Leaderboard (ranked scores for a gym in a time period)
 *   - Pinned badges (read/write the user's pinned badge IDs on their profile)
 *
 * Mock strategy: Same as routes.service.test.ts — mock `@/lib/supabase`
 * and verify the PostgREST query chain is built correctly.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
// Must be inside jest.mock factory due to hoisting (temporal dead zone).
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { gamificationService } from "../gamification.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("gamificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getBadges ───────────────────────────────────────────────────

  describe("getBadges", () => {
    it("builds correct query chain for all badge definitions", async () => {
      // getBadges fetches all rows from the badges table, sorted by
      // criteria_type then criteria_value. This ordering groups badges
      // logically: all grade badges together, then volume, then streak.
      const mockBadges = [
        { id: "b1", name: "First V0", criteria_type: "first_grade", criteria_value: 0 },
        { id: "b2", name: "First Send", criteria_type: "total_sends", criteria_value: 1 },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        // First .order('criteria_type') returns this for chaining.
        // Second .order('criteria_value') is terminal — resolves the query.
        order: jest.fn()
          .mockReturnValueOnce({ order: jest.fn().mockResolvedValueOnce({ data: mockBadges, error: null }) }),
      };

      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gamificationService.getBadges();

      expect(supabase.from).toHaveBeenCalledWith("badges");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      // First sort: group by criteria_type (grade badges, volume badges, etc.)
      expect(chainMock.order).toHaveBeenCalledWith("criteria_type");
      expect(result.data).toEqual(mockBadges);
      expect(result.error).toBeNull();
    });
  });

  // ── getUserBadges ─────────────────────────────────────────────────

  describe("getUserBadges", () => {
    it("includes resource embedding and filters by userId", async () => {
      // getUserBadges joins the badges table via PostgREST resource embedding
      // so each user_badge row includes the full badge definition (name,
      // description, icon_key, etc.). Results are sorted newest-first so
      // the most recently earned badge appears at the top.
      const mockUserBadges = [
        {
          user_id: "user-1",
          badge_id: "b1",
          awarded_at: "2026-01-10T00:00:00Z",
          badge: { name: "First V0", icon_key: "badge-v0" },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockUserBadges,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gamificationService.getUserBadges("user-1");

      expect(supabase.from).toHaveBeenCalledWith("user_badges");
      // Resource embedding: join badges table to get badge details
      expect(chainMock.select).toHaveBeenCalledWith("*, badge:badges(*)");
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-1");
      // Newest earned badges first
      expect(chainMock.order).toHaveBeenCalledWith("awarded_at", { ascending: false });
      expect(result.data).toEqual(mockUserBadges);
    });

    it("returns empty array for user with no badges", async () => {
      // A new user who hasn't logged any ascents will have zero badges.
      // The service should return an empty array (not null or an error).
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gamificationService.getUserBadges("new-user");

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // ── getUserStreak ─────────────────────────────────────────────────

  describe("getUserStreak", () => {
    it("queries weekly streak with maybeSingle", async () => {
      // getUserStreak fetches the user's weekly streak record. We use
      // maybeSingle() instead of single() because a user with no ascents
      // won't have a streak row — maybeSingle returns null data without
      // erroring, whereas single() would throw.
      const mockStreak = {
        user_id: "user-1",
        streak_type: "weekly",
        current_streak: 5,
        longest_streak: 8,
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: mockStreak,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gamificationService.getUserStreak("user-1");

      expect(supabase.from).toHaveBeenCalledWith("user_streaks");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
      expect(chainMock.eq).toHaveBeenNthCalledWith(2, "streak_type", "weekly");
      // maybeSingle is the terminal method — returns null data for missing rows
      expect(chainMock.maybeSingle).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(mockStreak);
    });

    it("returns null when no streak exists", async () => {
      // A user who has never logged an ascent won't have a streak row.
      // maybeSingle returns { data: null, error: null } in this case,
      // which is different from single() that would error with PGRST116.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gamificationService.getUserStreak("no-streak-user");

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  // ── getLeaderboard ────────────────────────────────────────────────

  describe("getLeaderboard", () => {
    it("filters by gymId and period with profile join", async () => {
      // getLeaderboard fetches ranked entries for a specific gym and time
      // period (e.g., "weekly", "monthly"). Each entry includes the user's
      // profile info (display_name, avatar_url) via resource embedding,
      // which is needed to show names and avatars in the leaderboard UI.
      const mockEntries = [
        {
          gym_id: "gym-1",
          period: "weekly",
          rank: 1,
          score: 500,
          profile: { display_name: "ClimbKing", avatar_url: null },
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

      const result = await gamificationService.getLeaderboard("gym-1", "weekly");

      expect(supabase.from).toHaveBeenCalledWith("leaderboard_entries");
      // Resource embedding: join profiles for display_name + avatar_url
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, profile:profiles(display_name, avatar_url)"
      );
      expect(chainMock.eq).toHaveBeenNthCalledWith(1, "gym_id", "gym-1");
      expect(chainMock.eq).toHaveBeenNthCalledWith(2, "period", "weekly");
      // Sorted by rank ascending (1st place at top)
      expect(chainMock.order).toHaveBeenCalledWith("rank");
      expect(result.data).toEqual(mockEntries);
    });

    it("returns empty array when no entries exist", async () => {
      // A gym with no ascents in the period will have no leaderboard entries.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gamificationService.getLeaderboard("gym-1", "monthly");

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // ── getPinnedBadges ──────────────────────────────────────────────

  describe("getPinnedBadges", () => {
    it("queries profile by userId with single()", async () => {
      // getPinnedBadges fetches the pinned_badge_ids array from the
      // user's profile row. Uses single() because each user has exactly
      // one profile — missing profiles would indicate a data integrity issue.
      const mockProfile = { pinned_badge_ids: ["badge-uuid-1", "badge-uuid-2"] };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: mockProfile,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gamificationService.getPinnedBadges("user-1");

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(chainMock.select).toHaveBeenCalledWith("pinned_badge_ids");
      expect(chainMock.eq).toHaveBeenCalledWith("id", "user-1");
      expect(chainMock.single).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(mockProfile);
    });
  });

  // ── setPinnedBadges ──────────────────────────────────────────────

  describe("setPinnedBadges", () => {
    it("updates profile with badge ID array", async () => {
      // setPinnedBadges writes the pinned_badge_ids array to the user's
      // profile. The DB trigger enforces tier-based limits (free: 1, pro: 3).
      const badgeIds = ["badge-uuid-1"];

      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gamificationService.setPinnedBadges("user-1", badgeIds);

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(chainMock.update).toHaveBeenCalledWith({ pinned_badge_ids: badgeIds });
      expect(chainMock.eq).toHaveBeenCalledWith("id", "user-1");
      expect(result.error).toBeNull();
    });
  });
});
