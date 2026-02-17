/**
 * Sessions Service Tests
 *
 * Tests the sessionsService methods that handle ascent logging (INSERT/DELETE)
 * and session aggregation (grouping ascents by date into summaries).
 *
 * The service has two kinds of methods:
 * 1. Thin wrappers (createAscent, deleteAscent) — same mock pattern as
 *    savedRoutes.service.test.ts: chain objects with a terminal method.
 * 2. Async aggregation (getSessionSummary, getSessionHistory) — these await
 *    the query chain and then reduce raw rows into summary objects. We mock
 *    the terminal method to resolve with test data rows.
 *
 * Why mock instead of hitting a real DB?
 * Unit tests should be fast and isolated. The integration tests (supabase/tests/)
 * verify the actual SQL, RLS, and triggers. These tests verify that the service
 * correctly builds queries and transforms the response data.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
// Define the mock INSIDE the jest.mock factory because Jest hoists
// jest.mock() above all variable declarations (temporal dead zone).
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Import AFTER mock is defined — Jest replaces the real module with our mock.
import { sessionsService } from "../sessions.service";

// Extract the mock so we can configure return values per-test.
const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("sessionsService", () => {
  // Clear all mock call history between tests to prevent leakage.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createAscent ────────────────────────────────────────────────

  describe("createAscent", () => {
    it("inserts an ascent row with snake_case column mapping", async () => {
      // createAscent takes camelCase AscentLog fields and maps them to the
      // route_ascents table's snake_case columns. This test verifies that
      // mapping is correct and the chain returns the created row.
      //
      // Chain: from('route_ascents') → insert({...}) → select() → single()
      const mockAscent = {
        id: "ascent-1",
        user_id: "user-1",
        route_id: "route-1",
        status: "send",
        attempts: 3,
        notes: null,
        perceived_grade: null,
        created_at: "2026-02-09T14:00:00Z",
      };

      const chainMock = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        // single() is the terminal method — resolves the HTTP request.
        single: jest.fn().mockResolvedValueOnce({
          data: mockAscent,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await sessionsService.createAscent({
        userId: "user-1",
        routeId: "route-1",
        status: "send",
        attempts: 3,
      });

      // Verify the correct table is targeted
      expect(supabase.from).toHaveBeenCalledWith("route_ascents");
      // Verify camelCase → snake_case mapping in the insert payload
      expect(chainMock.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        route_id: "route-1",
        status: "send",
        attempts: 3,
        notes: undefined,
        perceived_grade: undefined,
      });
      expect(chainMock.select).toHaveBeenCalledTimes(1);
      expect(chainMock.single).toHaveBeenCalledTimes(1);
      // Data should flow through untransformed from Supabase
      expect(result.data).toEqual(mockAscent);
      expect(result.error).toBeNull();
    });

    it("includes notes and perceived grade when provided", async () => {
      // Optional fields (notes, perceivedGrade) should be mapped to their
      // snake_case equivalents when the caller provides them. This verifies
      // the service doesn't accidentally strip these fields.
      const mockAscent = {
        id: "ascent-2",
        user_id: "user-1",
        route_id: "route-2",
        status: "flash",
        attempts: 1,
        notes: "Heel hook on the third hold was key",
        perceived_grade: 12,
        created_at: "2026-02-09T15:00:00Z",
      };

      const chainMock = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: mockAscent,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await sessionsService.createAscent({
        userId: "user-1",
        routeId: "route-2",
        status: "flash",
        attempts: 1,
        notes: "Heel hook on the third hold was key",
        perceivedGrade: 12,
      });

      // Verify optional fields are present in the insert payload
      expect(chainMock.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        route_id: "route-2",
        status: "flash",
        attempts: 1,
        notes: "Heel hook on the third hold was key",
        perceived_grade: 12,
      });
      expect(result.data).toEqual(mockAscent);
      expect(result.error).toBeNull();
    });
  });

  // ── getSessionSummary ───────────────────────────────────────────

  describe("getSessionSummary", () => {
    it("aggregates ascents into a session summary with correct counts and grade distribution", async () => {
      // getSessionSummary fetches ascents for a user on a given date, then
      // reduces them into counts (sends, flashes, attempts) and a grade
      // distribution map. This test provides 3 ascent rows at different
      // grades and statuses, then verifies the aggregation.
      //
      // Mock data: 3 ascents on Feb 9, 2026
      //   - Route A: V3 (grade 6), flash
      //   - Route B: V5 (grade 10), send
      //   - Route C: V3 (grade 6), attempt
      const mockRows = [
        {
          id: "a1",
          user_id: "user-1",
          route_id: "route-a",
          status: "flash",
          attempts: 1,
          notes: null,
          perceived_grade: null,
          created_at: "2026-02-09T10:00:00Z",
          route: { canonical_grade: 6 },
        },
        {
          id: "a2",
          user_id: "user-1",
          route_id: "route-b",
          status: "send",
          attempts: 4,
          notes: null,
          perceived_grade: null,
          created_at: "2026-02-09T11:00:00Z",
          route: { canonical_grade: 10 },
        },
        {
          id: "a3",
          user_id: "user-1",
          route_id: "route-c",
          status: "attempt",
          attempts: 2,
          notes: null,
          perceived_grade: null,
          created_at: "2026-02-09T12:00:00Z",
          route: { canonical_grade: 6 },
        },
      ];

      // The chain for an async aggregation method: the terminal `.order()`
      // resolves to { data, error }. The intermediate methods (select, eq,
      // gte, lte) all return `this` for chaining.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockRows,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const summary = await sessionsService.getSessionSummary(
        "user-1",
        new Date(2026, 1, 9) // Feb 9, 2026 (month is 0-indexed)
      );

      // Verify query construction
      expect(supabase.from).toHaveBeenCalledWith("route_ascents");
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, route:routes(canonical_grade)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(chainMock.gte).toHaveBeenCalledWith(
        "created_at",
        "2026-02-09T00:00:00"
      );
      expect(chainMock.lte).toHaveBeenCalledWith(
        "created_at",
        "2026-02-09T23:59:59"
      );

      // Verify aggregation results
      expect(summary).toEqual({
        date: "2026-02-09",
        totalAscents: 3,
        sends: 1, // one "send"
        flashes: 1, // one "flash"
        attempts: 1, // one "attempt"
        gradeDistribution: {
          6: 2, // two ascents at grade 6 (route-a and route-c)
          10: 1, // one ascent at grade 10 (route-b)
        },
      });
    });
  });

  // ── getSessionHistory ───────────────────────────────────────────

  describe("getSessionHistory", () => {
    it("groups ascents by date and returns sorted history entries", async () => {
      // getSessionHistory fetches all ascents for a user, groups them by
      // calendar date, and returns per-date summaries. This test provides
      // ascents across 2 different dates to verify grouping and stat
      // calculation (sends, flashes, topGrade per day).
      //
      // Mock data: 3 ascents across 2 dates
      //   Feb 9: route-a (grade 10, send), route-b (grade 6, flash)
      //   Feb 8: route-c (grade 8, attempt)
      //
      // The query orders by created_at DESC, so Feb 9 rows come first.
      const mockRows = [
        {
          id: "a1",
          user_id: "user-1",
          route_id: "route-a",
          status: "send",
          attempts: 3,
          notes: null,
          perceived_grade: null,
          created_at: "2026-02-09T14:00:00Z",
          route: { canonical_grade: 10 },
        },
        {
          id: "a2",
          user_id: "user-1",
          route_id: "route-b",
          status: "flash",
          attempts: 1,
          notes: null,
          perceived_grade: null,
          created_at: "2026-02-09T10:00:00Z",
          route: { canonical_grade: 6 },
        },
        {
          id: "a3",
          user_id: "user-1",
          route_id: "route-c",
          status: "attempt",
          attempts: 5,
          notes: null,
          perceived_grade: null,
          created_at: "2026-02-08T16:00:00Z",
          route: { canonical_grade: 8 },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockRows,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const history = await sessionsService.getSessionHistory("user-1");

      // Verify query construction
      expect(supabase.from).toHaveBeenCalledWith("route_ascents");
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, route:routes(canonical_grade)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(chainMock.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });

      // Verify grouping and aggregation — 2 dates, newest first
      expect(history).toHaveLength(2);

      // Feb 9 — 2 ascents: 1 send + 1 flash, top grade is 10
      expect(history[0]).toEqual({
        date: "2026-02-09",
        ascentCount: 2,
        sends: 1,
        flashes: 1,
        topGrade: 10,
      });

      // Feb 8 — 1 ascent: 0 sends, 0 flashes (only an attempt), top grade is 8
      expect(history[1]).toEqual({
        date: "2026-02-08",
        ascentCount: 1,
        sends: 0,
        flashes: 0,
        topGrade: 8,
      });
    });
  });

  // ── getGradePyramid ──────────────────────────────────────────────

  describe("getGradePyramid", () => {
    it("groups sends and flashes by grade, sorted ascending", async () => {
      // The pyramid counts successful completions (send + flash) per grade.
      // Given 3 rows: two at grade 6 (one flash, one send) and one at grade 10,
      // the result should be [{ grade: 6, count: 2 }, { grade: 10, count: 1 }].
      const mockRows = [
        {
          status: "flash",
          route: { canonical_grade: 6 },
        },
        {
          status: "send",
          route: { canonical_grade: 10 },
        },
        {
          status: "send",
          route: { canonical_grade: 6 },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: mockRows,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await sessionsService.getGradePyramid("user-1");

      // Verify correct table and filters
      expect(supabase.from).toHaveBeenCalledWith("route_ascents");
      expect(chainMock.select).toHaveBeenCalledWith(
        "status, route:routes(canonical_grade)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(chainMock.in).toHaveBeenCalledWith("status", ["send", "flash"]);

      // Verify grouping and ascending sort
      expect(result).toEqual([
        { grade: 6, count: 2 },
        { grade: 10, count: 1 },
      ]);
    });

    it("applies date range filters when startDate and endDate are provided", async () => {
      // When the hook passes a time period, the service should add gte/lte
      // filters on created_at. This test verifies the chain includes those calls.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValueOnce({
          data: [
            { status: "send", route: { canonical_grade: 8 } },
          ],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await sessionsService.getGradePyramid(
        "user-1",
        "2026-01-01T00:00:00",
        "2026-01-31T23:59:59"
      );

      // Verify date filters were applied
      expect(chainMock.gte).toHaveBeenCalledWith(
        "created_at",
        "2026-01-01T00:00:00"
      );
      expect(chainMock.lte).toHaveBeenCalledWith(
        "created_at",
        "2026-01-31T23:59:59"
      );
      expect(result).toEqual([{ grade: 8, count: 1 }]);
    });

    it("returns empty array when no ascent data exists", async () => {
      // A new user with no sends should get back an empty pyramid.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await sessionsService.getGradePyramid("user-1");

      expect(result).toEqual([]);
    });

    it("skips rows with null grades (route has no grade set)", async () => {
      // Some routes might have null canonical_grade (e.g., route was deleted
      // and the JOIN returns null). These should be silently skipped.
      const mockRows = [
        { status: "send", route: { canonical_grade: null } },
        { status: "send", route: { canonical_grade: 5 } },
        { status: "flash", route: null }, // route was deleted entirely
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: mockRows,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await sessionsService.getGradePyramid("user-1");

      // Only the row with grade 5 should appear
      expect(result).toEqual([{ grade: 5, count: 1 }]);
    });

    it("throws when Supabase returns an error", async () => {
      // If the PostgREST query fails (e.g., network error, RLS violation),
      // the service should propagate the error to the caller.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: "Connection refused", code: "PGRST000" },
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await expect(
        sessionsService.getGradePyramid("user-1")
      ).rejects.toEqual({ message: "Connection refused", code: "PGRST000" });
    });
  });

  // ── deleteAscent ────────────────────────────────────────────────

  describe("deleteAscent", () => {
    it("deletes an ascent by its primary key", async () => {
      // deleteAscent removes a single row from route_ascents by UUID.
      // The `on_ascent_delete` trigger handles decrementing gamification
      // counters automatically.
      //
      // Chain: from('route_ascents') → delete() → eq('id', ...)
      //
      // The `.eq()` after `.delete()` is the terminal method that resolves
      // the request. Unlike unsaveRoute (which chains 3 eq calls), we only
      // need one filter since ascent IDs are globally unique.
      const eqMock = jest.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await sessionsService.deleteAscent("ascent-123");

      // Verify the correct table and operation
      expect(supabase.from).toHaveBeenCalledWith("route_ascents");
      expect(chainMock.delete).toHaveBeenCalledTimes(1);
      // Verify the PK filter
      expect(eqMock).toHaveBeenCalledWith("id", "ascent-123");
      expect(result.error).toBeNull();
    });
  });
});
