/**
 * Challenges Service Tests (Step 8.4)
 *
 * These tests verify that challengesService methods correctly build
 * Supabase PostgREST query chains for fetching challenge definitions
 * and user progress.
 *
 * Mock strategy: Same as gamification.service.test.ts — mock `@/lib/supabase`
 * and verify the PostgREST query chain is built correctly. We don't hit
 * the actual DB; that's the integration tests' job.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
// Must be inside jest.mock factory due to hoisting (temporal dead zone).
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { challengesService } from "../challenges.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("challengesService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getActiveChallenges ───────────────────────────────────────────

  describe("getActiveChallenges", () => {
    it("builds correct query chain with date filters", async () => {
      // getActiveChallenges fetches challenges where now() is between
      // start_date and end_date. Uses PostgREST's lte/gte operators
      // for date range filtering, and resource embeds the reward badge.
      const mockChallenges = [
        { id: "c1", name: "Flash Five", criteria: { type: "flash_count", target: 5 } },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValueOnce({
          data: mockChallenges,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await challengesService.getActiveChallenges("gym-1");

      expect(supabase.from).toHaveBeenCalledWith("challenges");
      // Resource embedding: include reward badge info for display
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, reward_badge:badges(name, icon_key)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("gym_id", "gym-1");
      expect(result.data).toEqual(mockChallenges);
    });

    it("returns empty array when no active challenges", async () => {
      // A gym with no current challenges returns an empty result set.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await challengesService.getActiveChallenges("gym-1");

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // ── getAllChallenges ───────────────────────────────────────────────

  describe("getAllChallenges", () => {
    it("builds correct query chain ordered by start_date DESC", async () => {
      // getAllChallenges fetches ALL challenges for a gym (past, active,
      // future), sorted newest-first. Used by the admin panel.
      const mockChallenges = [
        { id: "c1", name: "Recent Challenge", start_date: "2026-02-01" },
        { id: "c2", name: "Old Challenge", start_date: "2026-01-01" },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockChallenges,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await challengesService.getAllChallenges("gym-1");

      expect(supabase.from).toHaveBeenCalledWith("challenges");
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, reward_badge:badges(name, icon_key)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("gym_id", "gym-1");
      expect(chainMock.order).toHaveBeenCalledWith("start_date", { ascending: false });
      expect(result.data).toEqual(mockChallenges);
    });
  });

  // ── getUserChallengeProgress ──────────────────────────────────────

  describe("getUserChallengeProgress", () => {
    it("builds correct query chain with challenge embed", async () => {
      // getUserChallengeProgress fetches progress rows for a user
      // at a specific gym. Embeds the challenge details so the UI
      // can show challenge name/criteria alongside progress.
      const mockProgress = [
        { user_id: "user-1", challenge_id: "c1", progress: 3, challenge: { name: "Flash Five" } },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockProgress,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await challengesService.getUserChallengeProgress("user-1", "gym-1");

      expect(supabase.from).toHaveBeenCalledWith("user_challenge_progress");
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, challenge:challenges(*, reward_badge:badges(name, icon_key))"
      );
      expect(chainMock.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
      expect(result.data).toEqual(mockProgress);
    });

    it("returns empty array for user with no challenge progress", async () => {
      // A user who hasn't logged any ascents during an active challenge
      // might have no progress rows.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await challengesService.getUserChallengeProgress("user-1", "gym-1");

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // ── getUserProgressForChallenge ───────────────────────────────────

  describe("getUserProgressForChallenge", () => {
    it("uses maybeSingle for specific challenge progress", async () => {
      // getUserProgressForChallenge returns a single row (or null)
      // for a specific user+challenge combination. Uses maybeSingle()
      // because the user might not have started the challenge yet.
      const mockSingle = {
        user_id: "user-1",
        challenge_id: "c1",
        progress: 7,
        completed_at: null,
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: mockSingle,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await challengesService.getUserProgressForChallenge("user-1", "c1");

      expect(supabase.from).toHaveBeenCalledWith("user_challenge_progress");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
      expect(chainMock.eq).toHaveBeenNthCalledWith(2, "challenge_id", "c1");
      expect(chainMock.maybeSingle).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(mockSingle);
    });

    it("returns null when user has no progress for challenge", async () => {
      // A user who hasn't interacted with a specific challenge
      // gets null data (not an error).
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await challengesService.getUserProgressForChallenge("user-1", "c1");

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });
});
