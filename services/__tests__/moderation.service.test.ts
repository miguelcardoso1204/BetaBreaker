/**
 * Moderation Service Tests
 *
 * Tests the moderationService methods that manage content reports —
 * the system for flagging inappropriate content (videos, feedback, users)
 * and resolving those flags in an admin moderation queue.
 *
 * DATA MODEL:
 *   content_reports: { id, reporter_id, target_type, target_id, reason,
 *                      status, reviewed_by, reviewed_at, created_at }
 *
 * KEY DESIGN DECISIONS:
 *   - createReport does NOT use RETURNING — the reporter's SELECT policy
 *     only allows reading their own reports, but INSERT + RETURNING requires
 *     the new row to pass SELECT as well. Since the row just got inserted,
 *     this works, but we keep it simple and consistent with the pattern
 *     used elsewhere (see MEMORY.md: RLS + INSERT RETURNING Gotcha).
 *   - getReports joins profiles on reporter_id so the admin queue can
 *     display who submitted each report without N+1 queries.
 *   - resolveReport sets status, reviewed_by, and reviewed_at in one UPDATE.
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

import { moderationService } from "../moderation.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("moderationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createReport ───────────────────────────────────────────────────

  describe("createReport", () => {
    it("inserts with reporter_id, target_type, target_id, reason", async () => {
      // createReport adds a new content report. Users flag inappropriate
      // content by selecting a reason from a predefined list.
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await moderationService.createReport(
        "user-1",
        "feedback",
        "target-123",
        "Inappropriate content"
      );

      expect(supabase.from).toHaveBeenCalledWith("content_reports");
      expect(chainMock.insert).toHaveBeenCalledWith({
        reporter_id: "user-1",
        target_type: "feedback",
        target_id: "target-123",
        reason: "Inappropriate content",
      });
    });

    it("does not use RETURNING (no .select() or .single() chain)", async () => {
      // Per the RLS + INSERT RETURNING lesson: we avoid RETURNING on
      // tables where the SELECT policy might not match the INSERT policy
      // for all callers. The insert call should terminate at .insert()
      // without chaining .select().single().
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await moderationService.createReport(
        "user-1",
        "video",
        "target-456",
        "Spam"
      );

      // insert() should be called but select/single should NOT be chained
      expect(chainMock.insert).toHaveBeenCalledTimes(1);
      // If select were chained, it would be a property of the mock —
      // we verify the return value of insert is directly awaited
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });
  });

  // ── getReports ─────────────────────────────────────────────────────

  describe("getReports", () => {
    it("fetches all reports with reporter profile join", async () => {
      // The admin moderation queue needs reporter info (name, avatar)
      // to display alongside each report. PostgREST resource embedding
      // fetches this in a single query.
      const mockReports = [
        {
          id: "report-1",
          reporter_id: "user-1",
          target_type: "feedback",
          target_id: "target-1",
          reason: "Spam",
          status: "pending",
          created_at: "2026-02-11T00:00:00Z",
          reporter: { display_name: "Alex", avatar_url: null },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockReports,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await moderationService.getReports();

      expect(supabase.from).toHaveBeenCalledWith("content_reports");
      // The select should include a profile join on reporter_id
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, reporter:profiles!content_reports_reporter_id_fkey(display_name, avatar_url)"
      );
      expect(chainMock.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(result.data).toEqual(mockReports);
    });

    it("filters by status when provided", async () => {
      // The moderation screen typically shows only "pending" reports,
      // but the service supports filtering by any status value.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await moderationService.getReports("pending");

      expect(chainMock.eq).toHaveBeenCalledWith("status", "pending");
    });
  });

  // ── resolveReport ──────────────────────────────────────────────────

  describe("resolveReport", () => {
    it("updates status, reviewed_by, and reviewed_at", async () => {
      // When an admin resolves a report, we record who reviewed it,
      // when, and what the resolution was (reviewed/dismissed).
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        update: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await moderationService.resolveReport(
        "report-1",
        "admin-user-1",
        "reviewed"
      );

      expect(supabase.from).toHaveBeenCalledWith("content_reports");
      const updateArg = chainMock.update.mock.calls[0][0];
      expect(updateArg.status).toBe("reviewed");
      expect(updateArg.reviewed_by).toBe("admin-user-1");
      // reviewed_at should be an ISO timestamp string
      expect(updateArg.reviewed_at).toBeDefined();
    });

    it("filters by report id", async () => {
      // The UPDATE should target a specific report by ID to avoid
      // accidentally resolving multiple reports.
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        update: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await moderationService.resolveReport(
        "report-42",
        "admin-user-1",
        "dismissed"
      );

      expect(eqMock).toHaveBeenCalledWith("id", "report-42");
    });
  });
});
