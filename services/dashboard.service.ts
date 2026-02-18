/**
 * Dashboard Service — Admin Dashboard Data Queries
 *
 * Thin Supabase wrappers for the gym admin dashboard (Step 15.1).
 * Provides four metrics:
 *   1. Active route count — routes with status 'active'
 *   2. Retiring-soon count — routes with status 'retiring_soon'
 *   3. Total ascent count — all ascents logged on the gym's routes
 *   4. Recent activity — latest ascents with route/climber details
 *
 * WHY "RETIRING SOON" INSTEAD OF "SETS IN PROGRESS"?
 * The spec called for "sets in progress" but no `draft` route status
 * exists in the schema. We reinterpret this as routes about to be
 * taken down (retiring_soon), which is more useful for gym admins.
 *
 * WHY "TOTAL ASCENTS" INSTEAD OF "SCAN COUNT"?
 * The spec called for QR scan counts but no qr_scans table exists.
 * Total ascents is the closest meaningful metric — it shows overall
 * climbing activity at the gym.
 *
 * QUERY PATTERNS:
 * - Count queries use `{ count: 'exact', head: true }` — returns only
 *   the count, no row data. Same pattern as mediaService.getWeeklyUploadCount.
 * - The `fromRouteAscents` cast is needed because database.types.ts hasn't
 *   been regenerated. Same cast as sessions.service.ts.
 * - The `!inner` join on routes filters ascents to only those whose route
 *   belongs to the target gym. Same pattern as sessionsService.getSentRouteIds.
 */

import { supabase } from '@/lib/supabase';

// Cast supabase.from() for route_ascents — same reason as sessions.service.ts:
// database.types.ts hasn't been regenerated to include this table yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromRouteAscents = () => (supabase as any).from('route_ascents');

// ── Types ────────────────────────────────────────────────────────────

/**
 * A single item in the recent activity feed.
 *
 * Combines ascent data with joined route info (name, grade) and
 * climber profile (display name). Used by the dashboard FlatList.
 */
export interface RecentActivityItem {
  id: string;
  status: string;
  attempts: number;
  created_at: string;
  route: {
    name: string;
    gym_id: string;
    canonical_grade: number | null;
  };
  climber: {
    display_name: string | null;
  };
}

// ── Service ──────────────────────────────────────────────────────────

export const dashboardService = {
  /**
   * Count routes with 'active' status at a gym.
   *
   * Uses head:true so no row data is transferred — just the count.
   * The admin dashboard shows this as the "Active Routes" stat widget.
   *
   * @param gymId - The gym to count active routes for
   */
  getActiveRouteCount(gymId: string) {
    return supabase
      .from('routes')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .eq('status', 'active');
  },

  /**
   * Count routes with 'retiring_soon' status at a gym.
   *
   * Shows how many routes are about to be taken down. Gym admins use
   * this to plan route setting schedules — when retiring count is high,
   * it's time to set new routes.
   *
   * @param gymId - The gym to count retiring routes for
   */
  getRetiringRouteCount(gymId: string) {
    return supabase
      .from('routes')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .eq('status', 'retiring_soon');
  },

  /**
   * Count all ascents logged on routes belonging to a gym.
   *
   * Uses PostgREST's `!inner` join to filter route_ascents to only
   * those whose route belongs to the target gym. Without `!inner`, rows
   * with non-matching gym_id would still be counted (with null route data).
   *
   * @param gymId - The gym to count total ascents for
   */
  getTotalAscentCount(gymId: string) {
    return fromRouteAscents()
      .select('id, route:routes!inner(gym_id)', { count: 'exact', head: true })
      .eq('route.gym_id', gymId);
  },

  /**
   * Fetch recent ascents at a gym with route and climber details.
   *
   * Joins routes (for name + grade) and profiles (for climber display name)
   * in a single PostgREST query. The `!inner` join on routes ensures we only
   * get ascents for routes at the target gym. The profiles join uses
   * `!user_id` to specify the FK relationship.
   *
   * @param gymId - The gym to fetch activity for
   * @param limit - Max items to return (default 20)
   */
  getRecentActivity(gymId: string, limit = 20) {
    return fromRouteAscents()
      .select(
        'id, status, attempts, created_at, route:routes!inner(name, gym_id, canonical_grade), climber:profiles!user_id(display_name)'
      )
      .eq('route.gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(limit);
  },
};
