/**
 * Enrolled Leaderboards Hook — TanStack Query Wrapper for User Standings
 *
 * Fetches the current user's leaderboard standings across all gyms they've
 * competed at. Returns enriched data including gym names and total participant
 * counts by calling the get_enrolled_leaderboards() Postgres function via RPC.
 *
 * QUERY KEY: ["leaderboards", "enrolled", userId]
 *
 * Why include userId in the key?
 * Different users see different leaderboard standings. Including userId ensures
 * TanStack Query maintains separate caches per user, which matters if the app
 * ever supports account switching.
 *
 * The query is disabled when userId is undefined (user not logged in), which
 * prevents firing an RPC call with a null parameter.
 */

import { useQuery } from "@tanstack/react-query";
import { leaderboardService } from "@/services/leaderboard.service";

/**
 * Shape of a single leaderboard entry displayed on the Leaderboards tab.
 * Each entry represents the user's standing at one gym for a given period
 * and scoring model.
 *
 * This interface matches the return type of get_enrolled_leaderboards() —
 * the Postgres function that joins leaderboard_entries with gyms and computes
 * participant counts.
 */
export interface EnrolledLeaderboard {
  /** Unique identifier for this leaderboard entry */
  id: string;
  /** The gym this leaderboard belongs to */
  gym_id: string;
  /** Display name of the gym (joined from gyms table) */
  gym_name: string;
  /** ISO week period string, e.g. "2026-W06" */
  period: string;
  /** Which scoring model this entry uses */
  scoring_model: string;
  /** User's rank position in this leaderboard (1 = first place) */
  rank: number;
  /** User's total score for this period */
  score: number;
  /** How many climbers are in this leaderboard */
  total_participants: number;
}

/**
 * Fetch the current user's enrolled leaderboard standings.
 *
 * @param userId - The UUID of the current user, or undefined if not logged in
 */
export function useEnrolledLeaderboards(userId: string | undefined) {
  return useQuery({
    queryKey: ["leaderboards", "enrolled", userId],
    queryFn: async () => {
      // userId is guaranteed non-undefined here because enabled: !!userId
      // prevents this from running when userId is falsy.
      const result = await leaderboardService.getEnrolledLeaderboards(userId!);
      if (result.error) throw result.error;
      return result.data as EnrolledLeaderboard[];
    },
    // Don't fetch until we have a userId — prevents RPC call with null param
    enabled: !!userId,
  });
}
