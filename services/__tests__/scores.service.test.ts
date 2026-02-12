/**
 * Scores Service Tests
 *
 * Tests the scoresService methods that manage competition score CRUD —
 * athletes submit scores, judges verify/update them, admins delete.
 *
 * DATA MODEL (from migration 20260206060000_competitions.sql):
 *   competition_scores: {
 *     id, event_id, user_id, route_id, category_id,
 *     score, verified_by, created_at
 *   }
 *   UNIQUE(event_id, user_id, route_id) — one score per athlete per route
 *
 * KEY DESIGN DECISIONS:
 *   - createScore does NOT use RETURNING — athletes pass INSERT RLS
 *     (user_id = auth.uid()) but the SELECT policy is also open, so
 *     RETURNING would work. We skip it for consistency with the pattern.
 *   - updateScore and verifyScore require judge+ role (RLS UPDATE policy).
 *   - getActiveEventsForRoute uses !inner join so only events that
 *     actually contain the route are returned.
 *   - getEventScores embeds user (profiles) and route info for display.
 *
 * Mock strategy: same as events.service.test.ts — mock @/lib/supabase
 * inside the jest.mock() factory, then configure chain mocks per test.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { scoresService } from "../scores.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("scoresService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getEventScores ──────────────────────────────────────────────────

  describe("getEventScores", () => {
    it("fetches all scores for an event with embedded user and route data", async () => {
      // The admin/judge screen needs athlete names and route info to
      // display a meaningful scoreboard, so we embed profiles + routes.
      const mockScores = [
        {
          id: "score-1",
          score: 100,
          user: { display_name: "Alice", avatar_url: null },
          route: { name: "Problem 1", canonical_grade: 10 },
        },
      ];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValueOnce({ data: mockScores, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await scoresService.getEventScores("event-1");

      expect(supabase.from).toHaveBeenCalledWith("competition_scores");
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, user:profiles!user_id(display_name, avatar_url), route:routes(name, canonical_grade)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("event_id", "event-1");
      expect(chainMock.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(result.data).toEqual(mockScores);
    });
  });

  // ── getUserEventScores ──────────────────────────────────────────────

  describe("getUserEventScores", () => {
    it("fetches one athlete's scores in an event", async () => {
      // The athlete event screen shows only the current user's scores.
      // We filter by both event_id and user_id.
      const mockScores = [{ id: "score-1", score: 50, route_id: "r-1" }];
      const eqUser = jest
        .fn()
        .mockResolvedValueOnce({ data: mockScores, error: null });
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValueOnce({ eq: eqUser }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await scoresService.getUserEventScores(
        "event-1",
        "user-1"
      );

      expect(supabase.from).toHaveBeenCalledWith("competition_scores");
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, route:routes(name, canonical_grade)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("event_id", "event-1");
      expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
      expect(result.data).toEqual(mockScores);
    });
  });

  // ── getScore ──────────────────────────────────────────────────────

  describe("getScore", () => {
    it("fetches a single score by event+user+route composite key", async () => {
      // Used to check if an athlete already submitted a score for a
      // specific route in an event before allowing another submission.
      const mockScore = { id: "score-1", score: 75 };
      const eqRoute = jest
        .fn()
        .mockReturnValueOnce({
          maybeSingle: jest
            .fn()
            .mockResolvedValueOnce({ data: mockScore, error: null }),
        });
      const eqUser = jest.fn().mockReturnValueOnce({ eq: eqRoute });
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValueOnce({ eq: eqUser }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await scoresService.getScore(
        "event-1",
        "user-1",
        "route-1"
      );

      expect(supabase.from).toHaveBeenCalledWith("competition_scores");
      expect(chainMock.eq).toHaveBeenCalledWith("event_id", "event-1");
      expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
      expect(eqRoute).toHaveBeenCalledWith("route_id", "route-1");
      expect(result.data).toEqual(mockScore);
    });
  });

  // ── getActiveEventsForRoute ──────────────────────────────────────

  describe("getActiveEventsForRoute", () => {
    it("fetches ongoing events containing a specific route via !inner join", async () => {
      // The !inner modifier ensures PostgREST performs an INNER JOIN
      // instead of a LEFT JOIN — only events that actually contain the
      // scanned route are returned. Without !inner, all ongoing events
      // would come back with event_routes as an empty array.
      const mockEvents = [
        { id: "event-1", name: "Spring Comp", status: "ongoing" },
      ];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      // The second .eq() call resolves the promise
      chainMock.eq
        .mockReturnValueOnce(chainMock) // first .eq() returns this for chaining
        .mockResolvedValueOnce({ data: mockEvents, error: null }); // second .eq() resolves

      supabase.from.mockReturnValueOnce(chainMock);

      const result = await scoresService.getActiveEventsForRoute("route-1");

      expect(supabase.from).toHaveBeenCalledWith("events");
      // The !inner modifier is the key part of this select string
      expect(chainMock.select).toHaveBeenCalledWith(
        "id, name, status, event_routes!inner(route_id)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("status", "ongoing");
      expect(chainMock.eq).toHaveBeenCalledWith(
        "event_routes.route_id",
        "route-1"
      );
      expect(result.data).toEqual(mockEvents);
    });
  });

  // ── createScore ─────────────────────────────────────────────────

  describe("createScore", () => {
    it("inserts a score without RETURNING", async () => {
      // Athletes submit scores via INSERT. The UNIQUE(event_id, user_id,
      // route_id) constraint prevents duplicate submissions — Postgres
      // returns a unique violation error which surfaces as "Already submitted".
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await scoresService.createScore({
        event_id: "event-1",
        user_id: "user-1",
        route_id: "route-1",
        score: 100,
      });

      expect(supabase.from).toHaveBeenCalledWith("competition_scores");
      expect(chainMock.insert).toHaveBeenCalledWith({
        event_id: "event-1",
        user_id: "user-1",
        route_id: "route-1",
        score: 100,
      });
    });

    it("supports optional category_id", async () => {
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await scoresService.createScore({
        event_id: "event-1",
        user_id: "user-1",
        route_id: "route-1",
        score: 50,
        category_id: "cat-1",
      });

      expect(chainMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: "cat-1" })
      );
    });
  });

  // ── updateScore ─────────────────────────────────────────────────

  describe("updateScore", () => {
    it("updates score and verified_by by score id (judge only)", async () => {
      // Only judges can UPDATE scores (RLS policy). This method sets both
      // the new score value and who verified it in a single UPDATE.
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        update: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await scoresService.updateScore("score-1", {
        score: 200,
        verified_by: "judge-1",
      });

      expect(supabase.from).toHaveBeenCalledWith("competition_scores");
      expect(chainMock.update).toHaveBeenCalledWith({
        score: 200,
        verified_by: "judge-1",
      });
      expect(eqMock).toHaveBeenCalledWith("id", "score-1");
    });
  });

  // ── verifyScore ─────────────────────────────────────────────────

  describe("verifyScore", () => {
    it("sets verified_by without changing the score value", async () => {
      // Convenience method: a judge confirms the athlete's self-reported
      // score is correct without modifying the value.
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        update: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await scoresService.verifyScore("score-1", "judge-1");

      expect(supabase.from).toHaveBeenCalledWith("competition_scores");
      expect(chainMock.update).toHaveBeenCalledWith({
        verified_by: "judge-1",
      });
      expect(eqMock).toHaveBeenCalledWith("id", "score-1");
    });
  });

  // ── deleteScore ─────────────────────────────────────────────────

  describe("deleteScore", () => {
    it("deletes a score by id (admin only)", async () => {
      // Only gym_admin+ can delete scores (RLS DELETE policy).
      // Used for removing erroneous or disputed entries.
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await scoresService.deleteScore("score-1");

      expect(supabase.from).toHaveBeenCalledWith("competition_scores");
      expect(chainMock.delete).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "score-1");
    });
  });
});
