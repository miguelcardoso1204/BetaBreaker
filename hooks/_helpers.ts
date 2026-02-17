/**
 * Shared helpers for analytics hooks.
 *
 * Internal module (prefixed with _) — not exported from hooks/index.
 * Contains utilities shared between useGradePyramid and useStyleInsights
 * to avoid duplicating time-period → date-range conversion logic.
 */

import type { TimePeriod } from "@/lib/constants";

/**
 * Convert a friendly time period to ISO date range strings.
 *
 * Uses simple day arithmetic relative to "now". Returns undefined for
 * `all_time` so the service skips date filtering entirely.
 *
 * Why not use a date library?
 * These are straightforward day offsets. `Date` handles month/year
 * rollover correctly (e.g., Jan 15 minus 30 days → Dec 16), so a
 * library like date-fns would be overkill here.
 */
export function computeDateRange(period: TimePeriod): {
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
