/**
 * Moderation Hooks — TanStack Query Wrappers for Content Reporting
 *
 * These hooks wrap moderationService with TanStack Query to provide:
 *   - `useCreateReport()` — mutation for users to submit a content report
 *   - `useReports(status?)` — query for admins to fetch the moderation queue
 *   - `useResolveReport()` — mutation for admins to dismiss/review a report
 *
 * HOOK BREAKDOWN:
 *   - useCreateReport: fire-and-forget mutation. Invalidates ["reports"]
 *     on success so the user's "my reports" view stays fresh.
 *   - useReports: parameterized query keyed on ["reports", status]. The
 *     admin moderation screen passes "pending" to see unresolved reports.
 *   - useResolveReport: mutation that sets status + reviewed_by. Invalidates
 *     ["reports"] so the moderation queue updates immediately.
 *
 * WHY INJECT userId FROM useAuth?
 * The service layer needs the authenticated user's ID for reporter_id
 * (createReport) and reviewed_by (resolveReport). Rather than making
 * each caller pass it manually, the hooks pull it from the auth context
 * automatically. This is the same pattern used in useFeedback.ts.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { moderationService } from "@/services/moderation.service";
import { useAuth } from "@/hooks/useAuth";

/**
 * Mutation to submit a content report.
 *
 * Accepts `{ targetType, targetId, reason }` and automatically supplies
 * the userId from the auth context as reporter_id. Invalidates the
 * reports query on completion so any cached report lists stay fresh.
 */
export function useCreateReport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      targetType,
      targetId,
      reason,
    }: {
      targetType: string;
      targetId: string;
      reason: string;
    }) => {
      if (!user?.id) throw new Error("Must be logged in to report content");
      const result = await moderationService.createReport(
        user.id,
        targetType,
        targetId,
        reason
      );
      if (result.error) throw result.error;
    },
    // Refetch the reports list so any cached views stay consistent
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

/**
 * Fetch content reports, optionally filtered by status.
 *
 * Returns:
 *   - `reports`: array of report objects with reporter profile info
 *   - Standard TanStack Query fields (isLoading, error, etc.)
 *
 * The query key includes the status filter so different status tabs
 * each get their own cached result (e.g., ["reports", "pending"]
 * is separate from ["reports", "reviewed"]).
 *
 * @param status - Optional filter: 'pending', 'reviewed', or 'dismissed'
 */
export function useReports(status?: string) {
  const query = useQuery({
    queryKey: ["reports", status],
    queryFn: async () => {
      const result = await moderationService.getReports(status);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });

  return {
    reports: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Mutation to resolve (dismiss or review) a content report.
 *
 * Accepts `{ reportId, status }` where status is 'reviewed' or 'dismissed'.
 * Automatically supplies the admin's userId from auth as reviewed_by.
 * Invalidates all ["reports"] queries on completion so the moderation
 * queue updates immediately (the resolved report disappears from pending).
 */
export function useResolveReport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reportId,
      status,
    }: {
      reportId: string;
      status: string;
    }) => {
      if (!user?.id) throw new Error("Must be logged in to resolve reports");
      const result = await moderationService.resolveReport(
        reportId,
        user.id,
        status
      );
      if (result.error) throw result.error;
    },
    // Invalidate all report queries regardless of status filter —
    // a resolved report affects multiple views (pending count, all list, etc.)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
