/**
 * Feedback Service Tests
 *
 * Tests the feedbackService methods that manage text-based beta tips
 * and voting on climbing routes. Beta tips live in the route_feedback
 * table, and votes in route_feedback_votes.
 *
 * "Beta" is climbing slang for information about how to climb a route —
 * sequences, holds to use, body positioning tips, etc. Users can post
 * tips and upvote/downvote other people's tips so the best advice
 * rises to the top.
 *
 * Mock strategy: same as savedRoutes.service.test.ts — mock @/lib/supabase
 * inside the jest.mock() factory (hoisting), then configure chain mocks
 * per test.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { feedbackService } from "../feedback.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("feedbackService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getRouteFeedback ────────────────────────────────────────────

  describe("getRouteFeedback", () => {
    it("fetches feedback for a route with profile join", async () => {
      // getRouteFeedback selects feedback rows with a resource-embedding
      // join to profiles (display_name, avatar_url) so the UI can show
      // who wrote each tip without a second query.
      const mockFeedback = [
        {
          id: "fb-1",
          route_id: "route-1",
          user_id: "user-1",
          body: "Start with left hand on the jug",
          score: 3,
          created_at: "2026-02-10T00:00:00Z",
          profile: { display_name: "Alex", avatar_url: null },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockFeedback,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await feedbackService.getRouteFeedback("route-1");

      expect(supabase.from).toHaveBeenCalledWith("route_feedback");
      // The select should include a profile join for display_name and avatar_url
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, profile:profiles(display_name, avatar_url)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("route_id", "route-1");
      // Results ordered by score descending so best tips float to top
      expect(chainMock.order).toHaveBeenCalledWith("score", {
        ascending: false,
      });
      expect(result.data).toEqual(mockFeedback);
    });

    it("includes profile join in the select", async () => {
      // Verify the profile join is present — this is the mechanism that
      // lets us show the author's name and avatar on each tip card
      // without making N+1 queries.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await feedbackService.getRouteFeedback("route-1");

      const selectArg = chainMock.select.mock.calls[0][0] as string;
      expect(selectArg).toContain("profiles");
      expect(selectArg).toContain("display_name");
      expect(selectArg).toContain("avatar_url");
    });
  });

  // ── getUserVotes ────────────────────────────────────────────────

  describe("getUserVotes", () => {
    it("fetches the user's votes for all feedback on a route", async () => {
      // getUserVotes retrieves which tips the current user has voted on
      // (and in which direction). This powers the "active" highlight
      // on the thumbs-up/thumbs-down buttons in the UI.
      const mockVotes = [
        { feedback_id: "fb-1", user_id: "user-1", vote: "up" },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: mockVotes,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await feedbackService.getUserVotes(
        ["fb-1", "fb-2"],
        "user-1"
      );

      expect(supabase.from).toHaveBeenCalledWith("route_feedback_votes");
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(chainMock.in).toHaveBeenCalledWith("feedback_id", [
        "fb-1",
        "fb-2",
      ]);
      expect(result.data).toEqual(mockVotes);
    });
  });

  // ── createFeedback ──────────────────────────────────────────────

  describe("createFeedback", () => {
    it("inserts feedback with routeId, userId, and body", async () => {
      // createFeedback adds a new beta tip for a route. The score starts
      // at 0 (set by DB default) and users can vote it up or down.
      const mockInserted = {
        id: "fb-new",
        route_id: "route-1",
        user_id: "user-1",
        body: "Heel hook on the volume",
        score: 0,
        created_at: "2026-02-10T00:00:00Z",
      };

      const chainMock = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: mockInserted,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await feedbackService.createFeedback(
        "route-1",
        "user-1",
        "Heel hook on the volume"
      );

      expect(supabase.from).toHaveBeenCalledWith("route_feedback");
      expect(chainMock.insert).toHaveBeenCalledWith({
        route_id: "route-1",
        user_id: "user-1",
        body: "Heel hook on the volume",
      });
      expect(result.data).toEqual(mockInserted);
    });
  });

  // ── deleteFeedback ──────────────────────────────────────────────

  describe("deleteFeedback", () => {
    it("deletes feedback by ID", async () => {
      // Users can delete their own tips. RLS ensures they can only
      // delete rows where user_id matches auth.uid().
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await feedbackService.deleteFeedback("fb-1");

      expect(supabase.from).toHaveBeenCalledWith("route_feedback");
      expect(chainMock.delete).toHaveBeenCalledTimes(1);
      expect(eqMock).toHaveBeenCalledWith("id", "fb-1");
      expect(result.error).toBeNull();
    });
  });

  // ── vote ────────────────────────────────────────────────────────

  describe("vote", () => {
    it("deletes existing vote then inserts new vote", async () => {
      // Voting is an upsert pattern: remove any existing vote first
      // (the user might be switching from up to down), then insert the
      // new vote. Two sequential calls to avoid complex ON CONFLICT logic.

      // First call: delete existing vote
      const deleteEq2 = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const deleteEq1 = jest
        .fn()
        .mockReturnValueOnce({ eq: deleteEq2 });
      const deleteChain = {
        delete: jest.fn().mockReturnValueOnce({ eq: deleteEq1 }),
      };

      // Second call: insert new vote
      const insertChain = {
        insert: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      };

      // Third call: update score
      const updateEq = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const updateChain = {
        update: jest.fn().mockReturnValueOnce({ eq: updateEq }),
      };

      supabase.from
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      await feedbackService.vote("fb-1", "user-1", "up");

      // Verify delete was called on route_feedback_votes
      expect(supabase.from).toHaveBeenNthCalledWith(
        1,
        "route_feedback_votes"
      );
      expect(deleteEq1).toHaveBeenCalledWith("feedback_id", "fb-1");
      expect(deleteEq2).toHaveBeenCalledWith("user_id", "user-1");

      // Verify insert was called with the new vote
      expect(supabase.from).toHaveBeenNthCalledWith(
        2,
        "route_feedback_votes"
      );
      expect(insertChain.insert).toHaveBeenCalledWith({
        feedback_id: "fb-1",
        user_id: "user-1",
        vote: "up",
      });
    });

    it("updates feedback score after voting", async () => {
      // After inserting the vote, the service must recalculate and
      // update the score on the route_feedback row. Score is the
      // net sum: count(up) - count(down).

      // Delete existing vote
      const deleteEq2 = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const deleteEq1 = jest
        .fn()
        .mockReturnValueOnce({ eq: deleteEq2 });
      supabase.from.mockReturnValueOnce({
        delete: jest.fn().mockReturnValueOnce({ eq: deleteEq1 }),
      });

      // Insert new vote
      supabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      });

      // Update score — this is what we're testing
      const updateEq = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const updateMock = jest.fn().mockReturnValueOnce({ eq: updateEq });
      supabase.from.mockReturnValueOnce({ update: updateMock });

      await feedbackService.vote("fb-1", "user-1", "up");

      // The third from() call should target route_feedback to update score
      expect(supabase.from).toHaveBeenNthCalledWith(3, "route_feedback");
      expect(updateEq).toHaveBeenCalledWith("id", "fb-1");
    });
  });

  // ── unvote ──────────────────────────────────────────────────────

  describe("unvote", () => {
    it("deletes vote and updates score", async () => {
      // Unvoting removes the user's vote entirely (toggling off).
      // The score must be recalculated after removing the vote.

      // Delete vote
      const deleteEq2 = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const deleteEq1 = jest
        .fn()
        .mockReturnValueOnce({ eq: deleteEq2 });
      supabase.from.mockReturnValueOnce({
        delete: jest.fn().mockReturnValueOnce({ eq: deleteEq1 }),
      });

      // Update score
      const updateEq = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      supabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnValueOnce({ eq: updateEq }),
      });

      await feedbackService.unvote("fb-1", "user-1");

      // Verify delete on votes table
      expect(supabase.from).toHaveBeenNthCalledWith(
        1,
        "route_feedback_votes"
      );
      expect(deleteEq1).toHaveBeenCalledWith("feedback_id", "fb-1");
      expect(deleteEq2).toHaveBeenCalledWith("user_id", "user-1");

      // Verify score update on feedback table
      expect(supabase.from).toHaveBeenNthCalledWith(2, "route_feedback");
      expect(updateEq).toHaveBeenCalledWith("id", "fb-1");
    });
  });
});
