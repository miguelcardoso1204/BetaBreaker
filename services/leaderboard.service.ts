/**
 * Leaderboard Service — Thin Wrapper Around Supabase Leaderboard Queries
 *
 * Handles all leaderboard-related data access:
 *   - getLeaderboardEntries: Fetch ranked entries for a specific leaderboard
 *   - getEnrolledLeaderboards: Fetch a user's standings filtered by active/retired
 *   - getGymLeaderboards: Fetch leaderboards for a gym filtered by active/retired
 *   - createLeaderboard: Admin creates a new leaderboard for a gym
 *
 * Leaderboards are admin-created entities with a name, scoring model, and
 * custom time window (starts_at → ends_at). "Active" means ends_at > now(),
 * "retired" means ends_at <= now().
 *
 * Scoring models:
 *   - 'hardest_grade': MAX(canonical_grade) — rewards pushing limits
 *   - 'flash_rate': flash_count / total_sends — rewards clean climbing
 *   - 'volume': COUNT(flash+send) — rewards total effort
 */

import { supabase } from "@/lib/supabase";

export const leaderboardService = {
  /**
   * Fetch ranked entries for a specific leaderboard.
   *
   * Each entry includes the user's profile info (display_name, avatar_url)
   * via PostgREST resource embedding — needed for rendering names and avatars.
   * Sorted by rank ascending (1st place at the top).
   *
   * @param leaderboardId - The UUID of the leaderboard to display
   */
  getLeaderboardEntries(leaderboardId: string) {
    return supabase
      .from("leaderboard_entries")
      .select("*, profile:profiles(display_name, avatar_url)")
      .eq("leaderboard_id", leaderboardId)
      .order("rank");
  },

  /**
   * Fetch a user's enrolled leaderboard standings across all gyms.
   *
   * Calls the get_enrolled_leaderboards() RPC which joins leaderboard_entries
   * with leaderboards and gyms, and computes participant counts.
   *
   * @param userId - The UUID of the user whose standings to fetch
   * @param active - true for active leaderboards, false for retired
   */
  getEnrolledLeaderboards(userId: string, active: boolean = true) {
    return supabase.rpc("get_enrolled_leaderboards", {
      p_user_id: userId,
      p_active: active,
    });
  },

  /**
   * Fetch leaderboards for a specific gym, filtered by active/retired status.
   *
   * Calls the get_gym_leaderboards() RPC which returns leaderboard metadata
   * with participant counts.
   *
   * @param gymId - The UUID of the gym
   * @param active - true for active leaderboards, false for retired
   */
  getGymLeaderboards(gymId: string, active: boolean = true) {
    return supabase.rpc("get_gym_leaderboards", {
      p_gym_id: gymId,
      p_active: active,
    });
  },

  /**
   * Create a new leaderboard for a gym.
   *
   * Only gym admins can call this (enforced by RLS INSERT policy on the
   * leaderboards table). The leaderboard starts accepting entries immediately
   * if starts_at <= now().
   *
   * @param params - Leaderboard configuration
   */
  createLeaderboard(params: {
    gymId: string;
    name: string;
    startsAt: string;
    endsAt: string;
    rules?: string;
    prizes?: string;
  }) {
    return supabase.from("leaderboards").insert({
      gym_id: params.gymId,
      name: params.name,
      starts_at: params.startsAt,
      ends_at: params.endsAt,
      rules: params.rules ?? null,
      prizes: params.prizes ?? null,
    });
  },
};
