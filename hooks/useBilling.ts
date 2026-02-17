/**
 * useBilling — TanStack Query Hooks for the Admin Billing Dashboard
 *
 * Wraps billingService with useQuery to provide reactive billing data
 * for the admin billing screen. Returns:
 *   - `billingHistory` — all past billing records for the gym
 *   - `activeUsers` — current month's active user count (live from RPC)
 *   - `projectedBill` — activeUsers × GYM_BILLING_RATE_EUR
 *   - Standard TanStack Query fields (isLoading, error)
 *
 * WHY TWO SEPARATE QUERIES?
 * Billing history is a simple table read (fast, cached), while the
 * active user count calls an RPC that does a real-time aggregate query
 * (slower, should refetch more often). Separate queries let TanStack
 * manage their caching independently.
 *
 * WHEN gymId IS NULL:
 * Both queries are disabled (enabled: !!gymId). This prevents a wasted
 * fetch when the admin hasn't selected a gym yet — the billing screen
 * won't have a gymId until the user navigates from a gym context.
 */

import { useQuery } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import { GYM_BILLING_RATE_EUR } from "@/lib/constants";

export function useBilling(gymId: string | null) {
  /**
   * Query: full billing history for a gym.
   *
   * Keyed on ["billingHistory", gymId] so different gyms get separate
   * cache entries. Disabled when gymId is null.
   */
  const billingHistoryQuery = useQuery({
    queryKey: ["billingHistory", gymId],
    queryFn: async () => {
      const result = await billingService.getGymBillingHistory(gymId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!gymId,
  });

  /**
   * Query: current month's active user count at this gym.
   *
   * This calls the get_gym_active_user_count() RPC which does a live
   * COUNT(DISTINCT user_id) query against route_ascents. It's not
   * cached by Postgres, so each fetch gives the real-time count.
   */
  const activeUsersQuery = useQuery({
    queryKey: ["activeUsers", gymId],
    queryFn: async () => {
      const result = await billingService.getCurrentMonthActiveUsers(gymId!);
      if (result.error) throw result.error;
      return (result.data as number) ?? 0;
    },
    enabled: !!gymId,
  });

  /**
   * Computed: projected bill for the current month.
   *
   * Simple multiplication: active users × rate per user.
   * Returns 0 if the active user count hasn't loaded yet.
   */
  const projectedBill = (activeUsersQuery.data ?? 0) * GYM_BILLING_RATE_EUR;

  return {
    billingHistory: billingHistoryQuery.data ?? [],
    activeUsers: activeUsersQuery.data ?? 0,
    projectedBill,
    isLoading: billingHistoryQuery.isLoading || activeUsersQuery.isLoading,
    error: billingHistoryQuery.error || activeUsersQuery.error,
  };
}
