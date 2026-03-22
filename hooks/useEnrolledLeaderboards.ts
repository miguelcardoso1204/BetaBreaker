/**
 * Enrolled Leaderboards Hook — TanStack Query Wrapper for User Standings
 *
 * Fetches the current user's leaderboard standings across all gyms, filtered
 * by active or retired status. Returns enriched data including gym names,
 * leaderboard names, time windows, and participant counts.
 *
 * QUERY KEY: ["leaderboards", "enrolled", userId, active]
 *
 * Why include both userId and active in the key?
 * Different users see different standings, and active vs retired are separate
 * datasets. Including both ensures TanStack Query maintains separate caches
 * for each combination — switching tabs is instant if already loaded.
 *
 * The query is disabled when userId is undefined (user not logged in).
 */

import { useQuery } from "@tanstack/react-query";
import { leaderboardService } from "@/services/leaderboard.service";

/**
 * Shape of a single enrolled leaderboard entry on the Leaderboards tab.
 * Each entry represents the user's standing in one leaderboard at one gym.
 *
 * Matches the return type of get_enrolled_leaderboards() — the Postgres
 * function that joins leaderboard_entries → leaderboards → gyms and
 * computes participant counts.
 */
export interface EnrolledLeaderboard {
  /** Unique identifier for this leaderboard entry */
  id: string;
  /** The leaderboard this entry belongs to */
  leaderboard_id: string;
  /** The gym this leaderboard belongs to */
  gym_id: string;
  /** Display name of the gym (joined from gyms table) */
  gym_name: string;
  /** Name of the leaderboard (e.g., "March Madness") */
  leaderboard_name: string;
  /** When the leaderboard started accepting entries */
  starts_at: string;
  /** When the leaderboard stops accepting entries */
  ends_at: string;
  /** User's rank position in this leaderboard (1 = first place) */
  rank: number;
  /** User's total score */
  score: number;
  /** How many climbers are in this leaderboard */
  total_participants: number;
  /** Optional rules set by the gym admin */
  rules: string | null;
  /** Optional prizes set by the gym admin */
  prizes: string | null;
}

/**
 * Fetch the current user's enrolled leaderboard standings.
 *
 * @param userId - The UUID of the current user, or undefined if not logged in
 * @param active - true for active (ongoing) leaderboards, false for retired (ended)
 */
export function useEnrolledLeaderboards(
  userId: string | undefined,
  active: boolean = true,
) {
  return useQuery({
    queryKey: ["leaderboards", "enrolled", userId, active],
    queryFn: async () => {
      // userId is guaranteed non-undefined here because enabled: !!userId
      const result = await leaderboardService.getEnrolledLeaderboards(userId!, active);
      if (result.error) throw result.error;
      return result.data as EnrolledLeaderboard[];
    },
    // Don't fetch until we have a userId
    enabled: !!userId,
  });
}
