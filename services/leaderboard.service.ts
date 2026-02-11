/**
 * Leaderboard Service — Thin Wrapper Around Supabase Leaderboard Queries
 *
 * This service handles all leaderboard-related data access:
 *   - getLeaderboard: Fetch ranked entries for a gym/period/model
 *   - getEnrolledLeaderboards: Fetch a user's standings across all gyms
 *
 * Why a separate service from gamificationService?
 * The gamificationService previously had a getLeaderboard method, but it
 * didn't support multiple scoring models. This dedicated service is the
 * canonical source for leaderboard queries going forward. It also adds
 * the getEnrolledLeaderboards method (backed by an RPC function) which
 * returns enriched data with gym names and participant counts.
 *
 * Scoring models:
 *   - 'hardest_grade': MAX(canonical_grade) — rewards pushing limits
 *   - 'flash_rate': flash_count / total_sends — rewards clean climbing
 *   - 'volume': COUNT(flash+send) — rewards total effort
 */

import { supabase } from "@/lib/supabase";

/** Valid scoring model values for leaderboard queries. */
export type ScoringModel = "hardest_grade" | "flash_rate" | "volume";

export const leaderboardService = {
  /**
   * Fetch leaderboard entries for a gym in a specific time period and model.
   *
   * Each entry includes the user's profile info (display_name, avatar_url)
   * via PostgREST resource embedding — needed for rendering names and avatars
   * in the leaderboard UI.
   *
   * Sorted by rank ascending (1st place at the top).
   *
   * @param gymId - The UUID of the gym
   * @param period - Time period filter (e.g., "2026-W06")
   * @param model - Scoring model to filter by (defaults to 'hardest_grade')
   */
  getLeaderboard(
    gymId: string,
    period: string,
    model: ScoringModel = "hardest_grade",
  ) {
    return supabase
      .from("leaderboard_entries")
      .select("*, profile:profiles(display_name, avatar_url)")
      .eq("gym_id", gymId)
      .eq("period", period)
      .eq("scoring_model", model)
      .order("rank");
  },

  /**
   * Fetch a user's enrolled leaderboard standings across all gyms.
   *
   * Calls the get_enrolled_leaderboards() Postgres function via RPC.
   * This function joins with gyms for gym_name and computes total_participants
   * via a lateral subquery — more efficient than multiple PostgREST calls.
   *
   * Returns one row per gym per scoring_model — only the most recent period.
   *
   * @param userId - The UUID of the user whose standings to fetch
   */
  getEnrolledLeaderboards(userId: string) {
    return supabase.rpc("get_enrolled_leaderboards", {
      p_user_id: userId,
    });
  },
};
