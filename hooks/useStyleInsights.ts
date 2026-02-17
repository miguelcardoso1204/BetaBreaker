/**
 * useStyleInsights — Pro-Gated Style Tag Analytics Query
 *
 * This hook provides style distribution data for the analytics dashboard.
 * It answers: "What kinds of routes does this climber send?" by aggregating
 * crowd-sourced style tags (slab, overhang, crimpy, dyno, etc.) from the
 * user's completed routes.
 *
 * Same three-concern pattern as useGradePyramid:
 *
 * 1. TIME PERIOD → DATE RANGE CONVERSION
 *    computeDateRange() (from _helpers.ts) converts friendly periods
 *    to ISO date strings for the service's date filters.
 *
 * 2. PRO-TIER GATING
 *    Analytics is a Pro-only feature (FR-E2). Query disabled for free tier.
 *
 * 3. TANSTACK QUERY WRAPPER
 *    Caching, loading/error states, automatic refetch per userId × period.
 *
 * Usage:
 *   const { data, isLoading, error, hasAccess, tier } = useStyleInsights('all_time');
 *   if (!hasAccess) return <Paywall feature="analytics" />;
 *   if (isLoading) return <Skeleton />;
 *   return <StyleInsights data={data ?? []} />;
 */

import { useQuery } from "@tanstack/react-query";
import { sessionsService } from "@/services/sessions.service";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlement } from "@/hooks/useEntitlement";
import { computeDateRange } from "@/hooks/_helpers";
import type { TimePeriod } from "@/lib/constants";
import type { StyleInsightEntry } from "@/services/sessions.service";

/** The shape returned by useStyleInsights(). */
export interface UseStyleInsightsReturn {
  /** Style tag distribution: tagName/category/count sorted by count desc. */
  data: StyleInsightEntry[] | undefined;
  /** True while the query is fetching. */
  isLoading: boolean;
  /** Error from the service call, if any. */
  error: Error | null;
  /** Whether the user's tier grants access to analytics. */
  hasAccess: boolean;
  /** The user's current subscription tier. */
  tier: string;
}

/**
 * Fetch style tag distribution for the current user's sent routes.
 *
 * @param timePeriod - How far back to look ('last_month', 'three_months', 'all_time')
 * @returns Style data + entitlement info for conditional rendering
 */
export function useStyleInsights(timePeriod: TimePeriod): UseStyleInsightsReturn {
  const { user } = useAuth();
  const userId = user?.id;
  const { hasAccess, tier } = useEntitlement("analytics");

  // Convert the friendly time period to ISO date strings for the service.
  const { startDate, endDate } = computeDateRange(timePeriod);

  const { data, isLoading, error } = useQuery({
    // Separate cache entry per user × period. Changing the period selector
    // in the UI triggers a new fetch (or cache hit) automatically.
    queryKey: ["analytics", "style", userId, timePeriod],
    queryFn: () => sessionsService.getStyleInsights(userId!, startDate, endDate),
    // Disabled when no user (not authenticated) or no access (free tier).
    enabled: !!userId && hasAccess,
  });

  return {
    data,
    isLoading,
    error: error as Error | null,
    hasAccess,
    tier,
  };
}
