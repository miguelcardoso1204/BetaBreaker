/**
 * Leaderboard Hook — TanStack Query Wrapper for Gym Leaderboards
 *
 * Fetches ranked leaderboard entries for a specific gym, time period, and
 * scoring model. Each entry includes the user's profile info (display_name,
 * avatar_url) for rendering names and avatars alongside scores and ranks.
 *
 * QUERY KEY: ["leaderboard", gymId, period, model]
 *
 * Why include gymId, period, AND model in the key?
 * TanStack Query uses the key for cache identity. A gym's hardest_grade
 * leaderboard and its flash_rate leaderboard are different datasets — by
 * including the model in the key, switching between scoring models uses
 * separate cache entries, enabling instant tab switching for loaded data.
 */

import { useQuery } from "@tanstack/react-query";
import {
  leaderboardService,
  type ScoringModel,
} from "@/services/leaderboard.service";

/**
 * Fetch leaderboard entries for a gym in a specific time period and model.
 *
 * @param gymId - The UUID of the gym whose leaderboard to display
 * @param period - Time period filter (e.g., "2026-W06")
 * @param model - Scoring model: 'hardest_grade' (default), 'flash_rate', or 'volume'
 */
export function useLeaderboard(
  gymId: string,
  period: string,
  model: ScoringModel = "hardest_grade",
) {
  return useQuery({
    queryKey: ["leaderboard", gymId, period, model],
    queryFn: async () => {
      const result = await leaderboardService.getLeaderboard(gymId, period, model);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}
