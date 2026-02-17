/**
 * useGradePyramid — Pro-Gated Grade Pyramid Analytics Query
 *
 * This hook provides the Grade Pyramid data for the analytics dashboard.
 * It combines three concerns:
 *
 * 1. TIME PERIOD → DATE RANGE CONVERSION
 *    The UI presents friendly time periods ('last_month', 'three_months',
 *    'all_time'). This hook converts them to ISO date strings that the
 *    service layer uses for `gte`/`lte` filters on `created_at`.
 *
 * 2. PRO-TIER GATING
 *    Analytics is a Pro-only feature (FR-E1). The query is disabled when
 *    the user doesn't have the 'analytics' entitlement, preventing
 *    unnecessary network requests for free-tier users.
 *
 * 3. TANSTACK QUERY WRAPPER
 *    Provides caching, loading/error states, and automatic background
 *    refetch. The query key includes userId + timePeriod so each
 *    combination gets its own cache entry.
 *
 * Usage:
 *   const { data, isLoading, error, hasAccess, tier } = useGradePyramid('last_month');
 *   if (!hasAccess) return <Paywall feature="analytics" />;
 *   if (isLoading) return <Skeleton />;
 *   return <GradePyramid data={data ?? []} gradeSystem="v-scale" />;
 */

import { useQuery } from "@tanstack/react-query";
import { sessionsService } from "@/services/sessions.service";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlement } from "@/hooks/useEntitlement";
import type { TimePeriod } from "@/lib/constants";
import type { GradePyramidEntry } from "@/services/sessions.service";

/**
 * Compute the ISO date range for a given time period.
 *
 * Uses simple day arithmetic relative to "now". Returns undefined for
 * `all_time` so the service skips date filtering entirely.
 *
 * Why not use a date library?
 * These are straightforward day offsets. `Date` handles month/year
 * rollover correctly (e.g., Jan 15 minus 30 days → Dec 16), so a
 * library like date-fns would be overkill here.
 */
function computeDateRange(period: TimePeriod): {
  startDate?: string;
  endDate?: string;
} {
  if (period === "all_time") {
    return {};
  }

  const now = new Date();
  const end = now.toISOString();

  // Calculate how many days to look back based on the period.
  // 30 days for last_month, 90 days for three_months.
  const daysBack = period === "last_month" ? 30 : 90;
  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);

  return {
    startDate: start.toISOString(),
    endDate: end,
  };
}

/** The shape returned by useGradePyramid(), extending the TanStack Query result. */
export interface UseGradePyramidReturn {
  /** The pyramid data: grade/count pairs sorted ascending by grade. */
  data: GradePyramidEntry[] | undefined;
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
 * Fetch grade pyramid data for the current user.
 *
 * @param timePeriod - How far back to look ('last_month', 'three_months', 'all_time')
 * @returns Pyramid data + entitlement info for conditional rendering
 */
export function useGradePyramid(timePeriod: TimePeriod): UseGradePyramidReturn {
  const { user } = useAuth();
  const userId = user?.id;
  const { hasAccess, tier } = useEntitlement("analytics");

  // Convert the friendly time period to ISO date strings for the service.
  const { startDate, endDate } = computeDateRange(timePeriod);

  const { data, isLoading, error } = useQuery({
    // Include userId + timePeriod in the key so each user × period
    // combination gets its own cache entry. Changing the period selector
    // in the UI triggers a new fetch (or cache hit) automatically.
    queryKey: ["analytics", "pyramid", userId, timePeriod],
    queryFn: () => sessionsService.getGradePyramid(userId!, startDate, endDate),
    // Disabled when:
    //   - No user (not authenticated)
    //   - No access (free tier — don't waste bandwidth fetching data
    //     the user can't see behind the paywall)
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
