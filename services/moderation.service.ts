/**
 * Moderation Service — Thin Wrapper for Content Reporting & Admin Review
 *
 * This service manages the content_reports table, which stores user-submitted
 * reports about inappropriate content. The moderation workflow is:
 *
 *   1. User sees something inappropriate (spam, harassment, etc.)
 *   2. User taps the report/flag button → picks a reason → submits
 *   3. Report enters the queue with status = 'pending'
 *   4. Admin opens the moderation screen → sees pending reports
 *   5. Admin either "dismisses" (false alarm) or "reviews" (takes action)
 *
 * DATA MODEL:
 *   content_reports: { id, reporter_id, target_type, target_id, reason,
 *                      status, reviewed_by, reviewed_at, created_at }
 *
 * target_type is polymorphic — 'video' | 'feedback' | 'user' — pointing
 * at route_media, route_feedback, or profiles respectively. No FK constraint
 * on target_id because different types reference different tables.
 *
 * RLS POLICIES:
 *   - INSERT: authenticated users can create reports (reporter_id = auth.uid())
 *   - SELECT own: users see only their own reports
 *   - SELECT admin: gym_admin/super_admin see ALL reports (via is_admin())
 *   - UPDATE admin: only admins can change report status
 *
 * IMPORTANT: createReport does NOT use RETURNING (.select().single()) because
 * of the RLS + INSERT RETURNING gotcha — see MEMORY.md. We just fire the
 * insert and let the caller invalidate queries to see the result.
 */

import { supabase } from "@/lib/supabase";

export const moderationService = {
  /**
   * Submit a new content report.
   *
   * Inserts a row into content_reports with status defaulting to 'pending'
   * (set by the DB). Does NOT chain .select() to avoid the RLS RETURNING
   * gotcha — the reporter might not pass the admin SELECT policy.
   *
   * @param reporterId - The authenticated user filing the report
   * @param targetType - What kind of content: 'video', 'feedback', or 'user'
   * @param targetId - UUID of the reported item (route_media, route_feedback, or profile)
   * @param reason - Human-readable reason from the predefined list
   */
  createReport(
    reporterId: string,
    targetType: string,
    targetId: string,
    reason: string
  ) {
    return supabase.from("content_reports").insert({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      reason,
    });
  },

  /**
   * Fetch content reports, optionally filtered by status.
   *
   * Joins the reporter's profile (display_name, avatar_url) via PostgREST
   * resource embedding so the admin queue can show who submitted each report.
   * Results are ordered newest-first (created_at DESC) so the most recent
   * reports appear at the top of the moderation queue.
   *
   * RLS restricts this to:
   *   - Regular users: only their own reports
   *   - Admins: all reports (via is_admin() policy)
   *
   * @param status - Optional filter: 'pending', 'reviewed', or 'dismissed'
   */
  getReports(status?: string) {
    let query = supabase
      .from("content_reports")
      .select(
        "*, reporter:profiles!content_reports_reporter_id_fkey(display_name, avatar_url)"
      );

    // Only add the status filter if a specific status was requested.
    // Without this, the query returns all reports (useful for an "all" tab).
    if (status) {
      query = query.eq("status", status);
    }

    return query.order("created_at", { ascending: false });
  },

  /**
   * Resolve a content report (admin action).
   *
   * Sets the report's status to the given resolution ('reviewed' or 'dismissed'),
   * records who reviewed it and when. The reviewed_at timestamp uses
   * new Date().toISOString() rather than a DB default because the UPDATE
   * policy doesn't set it automatically.
   *
   * @param reportId - The report to resolve
   * @param reviewerId - The admin user resolving the report
   * @param status - Resolution: 'reviewed' (action taken) or 'dismissed' (false alarm)
   */
  resolveReport(reportId: string, reviewerId: string, status: string) {
    return supabase
      .from("content_reports")
      .update({
        status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reportId);
  },
};
