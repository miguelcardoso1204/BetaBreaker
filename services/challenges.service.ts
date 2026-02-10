/**
 * Challenges Service — Thin Wrapper Around Supabase Challenge Queries (Step 8.4)
 *
 * This service builds PostgREST query chains for reading challenge data:
 * challenge definitions and user progress. Follows the same read-only pattern
 * as gamificationService — all writes happen via SECURITY DEFINER triggers.
 *
 * WHY READ-ONLY?
 * The user_challenge_progress table has SELECT-only RLS policies. All writes
 * happen inside the update_challenge_progress() trigger function that fires
 * on ascent insert. This prevents users from manually setting their progress.
 *
 * Challenge definitions (challenges table) are writable by gym admins via RLS
 * policies, but the admin creation UI will be in a separate admin service.
 * This service focuses on the read path used by the profile/challenge screens.
 */

import { supabase } from "@/lib/supabase";

export const challengesService = {
  /**
   * Fetch active challenges for a gym.
   *
   * A challenge is "active" when now() falls between start_date and end_date.
   * PostgREST's lte/gte operators handle the date comparison server-side.
   * Resource embeds the reward badge so the UI can show badge name/icon.
   *
   * @param gymId - The UUID of the gym whose challenges to fetch
   */
  getActiveChallenges(gymId: string) {
    const now = new Date().toISOString();
    return supabase
      .from("challenges")
      .select("*, reward_badge:badges(name, icon_key)")
      .eq("gym_id", gymId)
      // start_date <= now (challenge has started)
      .lte("start_date", now)
      // end_date >= now (challenge hasn't ended)
      .gte("end_date", now);
  },

  /**
   * Fetch all challenges for a gym (past, active, and future).
   *
   * Sorted by start_date descending so the most recent challenges appear
   * first. Used by the admin panel for managing challenge lifecycle.
   *
   * @param gymId - The UUID of the gym whose challenges to fetch
   */
  getAllChallenges(gymId: string) {
    return supabase
      .from("challenges")
      .select("*, reward_badge:badges(name, icon_key)")
      .eq("gym_id", gymId)
      .order("start_date", { ascending: false });
  },

  /**
   * Fetch a user's progress for all challenges at a specific gym.
   *
   * Embeds the full challenge definition (including reward badge) so the
   * UI can render challenge cards with all necessary data in one query.
   * Filters by gym_id through the embedded challenge's gym_id column.
   *
   * @param userId - The UUID of the user whose progress to fetch
   * @param gymId  - The UUID of the gym to filter challenges by
   */
  getUserChallengeProgress(userId: string, gymId: string) {
    return supabase
      .from("user_challenge_progress")
      .select("*, challenge:challenges(*, reward_badge:badges(name, icon_key))")
      .eq("user_id", userId)
      .eq("challenge.gym_id", gymId)
      .order("updated_at", { ascending: false });
  },

  /**
   * Fetch a user's progress for a specific challenge.
   *
   * Uses maybeSingle() because the user might not have started the
   * challenge yet (no ascents during the challenge period = no progress
   * row). Returns { data: null, error: null } for missing rows.
   *
   * @param userId      - The UUID of the user
   * @param challengeId - The UUID of the challenge
   */
  getUserProgressForChallenge(userId: string, challengeId: string) {
    return supabase
      .from("user_challenge_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("challenge_id", challengeId)
      .maybeSingle();
  },
};
