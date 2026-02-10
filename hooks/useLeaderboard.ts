/**
 * Leaderboard Hook — TanStack Query Wrapper for Gym Leaderboards
 *
 * Fetches ranked leaderboard entries for a specific gym and time period.
 * Each entry includes the user's profile info (display_name, avatar_url)
 * for rendering names and avatars alongside scores and ranks.
 *
 * QUERY KEY: ["leaderboard", gymId, period]
 *
 * Why include both gymId and period in the key?
 * TanStack Query uses the key for cache identity. A gym's weekly leaderboard
 * and monthly leaderboard are different datasets — by including period in
 * the key, switching between tabs (weekly/monthly/all_time) uses separate
 * cache entries, enabling instant tab switching for previously loaded data.
 */

import { useQuery } from "@tanstack/react-query";
import { gamificationService } from "@/services/gamification.service";

/**
 * Fetch leaderboard entries for a gym in a specific time period.
 *
 * @param gymId - The UUID of the gym whose leaderboard to display
 * @param period - Time period: "weekly", "monthly", or "all_time"
 */
export function useLeaderboard(gymId: string, period: string) {
  return useQuery({
    queryKey: ["leaderboard", gymId, period],
    queryFn: async () => {
      const result = await gamificationService.getLeaderboard(gymId, period);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}
