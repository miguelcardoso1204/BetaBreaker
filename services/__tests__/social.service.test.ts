/**
 * Social Service Tests — Follow System & Activity Feed
 *
 * Tests the socialService methods that manage user follow relationships
 * and the activity feed. The follows table has a composite PK of
 * (follower_id, following_id) — no separate id column.
 *
 * The activity feed fetches recent ascents from followed users,
 * joining route_ascents with routes (for name/grade/color) and
 * profiles (for display_name/avatar_url).
 *
 * Mock strategy: same as feedback.service.test.ts — mock @/lib/supabase
 * inside the jest.mock() factory, then configure chain mocks per test.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { socialService } from "../social.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("socialService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── follow ────────────────────────────────────────────────────────

  describe("follow", () => {
    it("inserts with follower_id and following_id", async () => {
      const chainMock = {
        insert: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await socialService.follow("user-1", "user-2");

      expect(supabase.from).toHaveBeenCalledWith("follows");
      expect(chainMock.insert).toHaveBeenCalledWith({
        follower_id: "user-1",
        following_id: "user-2",
      });
      expect(result.error).toBeNull();
    });
  });

  // ── unfollow ──────────────────────────────────────────────────────

  describe("unfollow", () => {
    it("deletes by follower_id and following_id", async () => {
      // delete().eq("follower_id", ...).eq("following_id", ...)
      const eq2 = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const eq1 = jest.fn().mockReturnValueOnce({ eq: eq2 });
      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: eq1 }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await socialService.unfollow("user-1", "user-2");

      expect(supabase.from).toHaveBeenCalledWith("follows");
      expect(eq1).toHaveBeenCalledWith("follower_id", "user-1");
      expect(eq2).toHaveBeenCalledWith("following_id", "user-2");
      expect(result.error).toBeNull();
    });
  });

  // ── isFollowing ───────────────────────────────────────────────────

  describe("isFollowing", () => {
    it("returns data when follow relationship exists", async () => {
      const followRow = {
        follower_id: "user-1",
        following_id: "user-2",
        created_at: "2026-02-10T00:00:00Z",
      };
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: followRow,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await socialService.isFollowing("user-1", "user-2");

      expect(supabase.from).toHaveBeenCalledWith("follows");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenCalledWith("follower_id", "user-1");
      expect(chainMock.eq).toHaveBeenCalledWith("following_id", "user-2");
      expect(result.data).toEqual(followRow);
    });

    it("returns null when not following", async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await socialService.isFollowing("user-1", "user-3");

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  // ── getFollowCounts ───────────────────────────────────────────────

  describe("getFollowCounts", () => {
    it("queries followers and following counts with head:true", async () => {
      // First call: count followers (following_id = userId)
      const followersChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          count: 10,
          error: null,
        }),
      };
      // Second call: count following (follower_id = userId)
      const followingChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          count: 5,
          error: null,
        }),
      };

      supabase.from
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain);

      const result = await socialService.getFollowCounts("user-1");

      // First query: count how many people follow user-1
      expect(supabase.from).toHaveBeenNthCalledWith(1, "follows");
      expect(followersChain.select).toHaveBeenCalledWith("*", {
        count: "exact",
        head: true,
      });
      expect(followersChain.eq).toHaveBeenCalledWith(
        "following_id",
        "user-1"
      );

      // Second query: count how many people user-1 follows
      expect(supabase.from).toHaveBeenNthCalledWith(2, "follows");
      expect(followingChain.select).toHaveBeenCalledWith("*", {
        count: "exact",
        head: true,
      });
      expect(followingChain.eq).toHaveBeenCalledWith(
        "follower_id",
        "user-1"
      );

      expect(result).toEqual({ followers: 10, following: 5 });
    });
  });

  // ── getFollowing ──────────────────────────────────────────────────

  describe("getFollowing", () => {
    it("fetches following list with profile join", async () => {
      const mockFollowing = [
        {
          following_id: "user-2",
          profile: { display_name: "Alex", avatar_url: null },
        },
        {
          following_id: "user-3",
          profile: { display_name: "Sam", avatar_url: "https://img.com/sam" },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          data: mockFollowing,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await socialService.getFollowing("user-1");

      expect(supabase.from).toHaveBeenCalledWith("follows");
      expect(chainMock.select).toHaveBeenCalledWith(
        "following_id, profile:profiles!follows_following_id_fkey(display_name, avatar_url)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("follower_id", "user-1");
      expect(result.data).toEqual(mockFollowing);
    });
  });

  // ── getActivityFeed ───────────────────────────────────────────────

  describe("getActivityFeed", () => {
    it("queries route_ascents with route and profile joins", async () => {
      const mockAscents = [
        {
          id: "ascent-1",
          user_id: "user-2",
          status: "sent",
          created_at: "2026-02-10T14:00:00Z",
          route: { name: "Crimpy Arete", canonical_grade: 10, color: "#EF4444" },
          profile: { display_name: "Alex", avatar_url: null },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce({
          data: mockAscents,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await socialService.getActivityFeed(["user-2", "user-3"]);

      expect(supabase.from).toHaveBeenCalledWith("route_ascents");
      expect(chainMock.select).toHaveBeenCalledWith(
        "id, user_id, status, attempts, created_at, route:routes(name, canonical_grade, color), profile:profiles(display_name, avatar_url)"
      );
      expect(chainMock.in).toHaveBeenCalledWith("user_id", [
        "user-2",
        "user-3",
      ]);
      expect(result.data).toEqual(mockAscents);
    });

    it("orders by created_at DESC with limit 50", async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await socialService.getActivityFeed(["user-2"]);

      expect(chainMock.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(chainMock.limit).toHaveBeenCalledWith(50);
    });
  });

  // ── getUserRecentAscents ────────────────────────────────────────

  describe("getUserRecentAscents", () => {
    it("queries route_ascents with eq filter, order, and limit 10", async () => {
      const mockAscents = [
        {
          id: "ascent-1",
          user_id: "user-2",
          status: "sent",
          attempts: 1,
          created_at: "2026-02-10T14:00:00Z",
          route: { name: "Crimpy Arete", canonical_grade: 10, color: "#EF4444" },
          profile: { display_name: "Alex", avatar_url: null },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce({
          data: mockAscents,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await socialService.getUserRecentAscents("user-2");

      expect(supabase.from).toHaveBeenCalledWith("route_ascents");
      expect(chainMock.select).toHaveBeenCalledWith(
        "id, user_id, status, attempts, created_at, route:routes(name, canonical_grade, color), profile:profiles(display_name, avatar_url)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-2");
      expect(chainMock.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(chainMock.limit).toHaveBeenCalledWith(10);
      expect(result.data).toEqual(mockAscents);
    });

    it("passes through errors from Supabase", async () => {
      const mockError = { message: "DB error", code: "500" };
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce({
          data: null,
          error: mockError,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await socialService.getUserRecentAscents("user-2");

      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });
});
