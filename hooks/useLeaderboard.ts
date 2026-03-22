/**
 * Leaderboard Hook — TanStack Query Wrapper for Leaderboard Entries
 *
 * Fetches ranked entries for a specific leaderboard. Each entry includes
 * the user's profile info (display_name, avatar_url) for rendering.
 *
 * QUERY KEY: ["leaderboard", leaderboardId]
 *
 * Simplified from the old (gymId, period, model) key since each leaderboard
 * now has its own ID that encapsulates gym, time window, and scoring model.
 */

import { useQuery } from "@tanstack/react-query";
import { leaderboardService } from "@/services/leaderboard.service";

/**
 * Fetch ranked entries for a specific leaderboard.
 *
 * @param leaderboardId - The UUID of the leaderboard to display
 */
export function useLeaderboard(leaderboardId: string) {
  return useQuery({
    queryKey: ["leaderboard", leaderboardId],
    queryFn: async () => {
      const result = await leaderboardService.getLeaderboardEntries(leaderboardId);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}
