/**
 * useAdminDashboard — TanStack Query Hooks for the Admin Dashboard
 *
 * Wraps dashboardService with four parallel useQuery calls to provide
 * reactive dashboard data for the admin screen. Returns:
 *   - `activeRoutes` — count of routes with 'active' status
 *   - `retiringRoutes` — count of routes with 'retiring_soon' status
 *   - `totalAscents` — total ascent logs across all gym routes
 *   - `recentActivity` — latest ascents with route/climber details
 *   - Standard TanStack Query fields (isLoading, error)
 *
 * WHY FOUR SEPARATE QUERIES?
 * Each metric has different data freshness needs and caching behavior.
 * Separate queries let TanStack manage their caching independently —
 * a stale count can refetch without re-fetching the activity feed.
 *
 * WHEN gymId IS NULL:
 * All queries are disabled (enabled: !!gymId). This prevents wasted
 * fetches when the admin hasn't selected a gym yet.
 */

import { useQuery } from "@tanstack/react-query";
import {
  dashboardService,
  type RecentActivityItem,
} from "@/services/dashboard.service";

export function useAdminDashboard(gymId: string | null) {
  /**
   * Query: count of active routes at this gym.
   * Uses the count-only response (head: true in the service query).
   */
  const activeRoutesQuery = useQuery({
    queryKey: ["adminDashboard", "activeRoutes", gymId],
    queryFn: async () => {
      const result = await dashboardService.getActiveRouteCount(gymId!);
      if (result.error) throw result.error;
      return result.count ?? 0;
    },
    enabled: !!gymId,
  });

  /**
   * Query: count of retiring-soon routes at this gym.
   * Helps admins plan route-setting schedules.
   */
  const retiringRoutesQuery = useQuery({
    queryKey: ["adminDashboard", "retiringRoutes", gymId],
    queryFn: async () => {
      const result = await dashboardService.getRetiringRouteCount(gymId!);
      if (result.error) throw result.error;
      return result.count ?? 0;
    },
    enabled: !!gymId,
  });

  /**
   * Query: total ascents logged on this gym's routes.
   * Overall activity metric replacing the spec's "scan count".
   */
  const totalAscentsQuery = useQuery({
    queryKey: ["adminDashboard", "totalAscents", gymId],
    queryFn: async () => {
      const result = await dashboardService.getTotalAscentCount(gymId!);
      if (result.error) throw result.error;
      return result.count ?? 0;
    },
    enabled: !!gymId,
  });

  /**
   * Query: recent activity feed for the gym.
   * Shows the latest ascents with climber name, route name, and status.
   */
  const recentActivityQuery = useQuery({
    queryKey: ["adminDashboard", "recentActivity", gymId],
    queryFn: async () => {
      const result = await dashboardService.getRecentActivity(gymId!);
      if (result.error) throw result.error;
      return (result.data ?? []) as RecentActivityItem[];
    },
    enabled: !!gymId,
  });

  return {
    activeRoutes: activeRoutesQuery.data ?? 0,
    retiringRoutes: retiringRoutesQuery.data ?? 0,
    totalAscents: totalAscentsQuery.data ?? 0,
    recentActivity: recentActivityQuery.data ?? [],
    isLoading:
      activeRoutesQuery.isLoading ||
      retiringRoutesQuery.isLoading ||
      totalAscentsQuery.isLoading ||
      recentActivityQuery.isLoading,
    error:
      activeRoutesQuery.error ||
      retiringRoutesQuery.error ||
      totalAscentsQuery.error ||
      recentActivityQuery.error,
  };
}
