/**
 * Gym Leaderboards Hook — TanStack Query Wrapper for Gym-Level Leaderboard List
 *
 * Fetches the list of leaderboards for a specific gym, filtered by active
 * or retired status. Returns leaderboard metadata with participant counts.
 *
 * QUERY KEY: ["leaderboards", "gym", gymId, active]
 *
 * Used by the gym leaderboard screen to show a list of leaderboards that
 * the user can tap into for detailed rankings.
 */

import { useQuery } from "@tanstack/react-query";
import { leaderboardService } from "@/services/leaderboard.service";

/**
 * Shape of a gym leaderboard list item.
 * Matches the return type of get_gym_leaderboards() RPC.
 */
export interface GymLeaderboard {
  /** Unique identifier for this leaderboard */
  id: string;
  /** Display name of the leaderboard (e.g., "March Madness") */
  name: string;
  /** When the leaderboard started */
  starts_at: string;
  /** When the leaderboard ends (or ended) */
  ends_at: string;
  /** How many participants are in this leaderboard */
  total_participants: number;
  /** Optional rules set by the gym admin */
  rules: string | null;
  /** Optional prizes set by the gym admin */
  prizes: string | null;
}

/**
 * Fetch leaderboards for a gym filtered by active/retired status.
 *
 * @param gymId - The UUID of the gym
 * @param active - true for active leaderboards, false for retired
 */
export function useGymLeaderboards(gymId: string, active: boolean = true) {
  return useQuery({
    queryKey: ["leaderboards", "gym", gymId, active],
    queryFn: async () => {
      const result = await leaderboardService.getGymLeaderboards(gymId, active);
      if (result.error) throw result.error;
      return result.data as GymLeaderboard[];
    },
  });
}
