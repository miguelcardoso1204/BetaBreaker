/**
 * Gamification Service — Thin Wrapper Around Supabase Gamification Queries
 *
 * This service builds PostgREST query chains for reading gamification data:
 * badges, user badges, streaks, and leaderboard entries. All four tables are
 * populated by Postgres triggers (see on_ascent_insert trigger chain) — the
 * client only needs to READ this data.
 *
 * Why read-only?
 * The gamification tables have SELECT-only RLS policies for authenticated
 * users. All writes happen inside SECURITY DEFINER trigger functions that
 * bypass RLS. This prevents users from manually awarding themselves badges
 * or manipulating leaderboard scores — the database enforces the rules.
 *
 * Each method returns a Supabase "thenable" — the HTTP request fires when
 * awaited. TanStack Query hooks (useBadges, useLeaderboard) call these
 * methods and manage caching, loading states, and cache invalidation.
 */

import { supabase } from "@/lib/supabase";

export const gamificationService = {
  /**
   * Fetch all badge definitions.
   *
   * Returns every row in the badges table, sorted by criteria_type then
   * criteria_value. This groups related badges together (e.g., all grade
   * badges from V0 to V10, then all volume badges from 1 to 100 sends).
   *
   * Used by the badge gallery screen to show all achievable badges.
   */
  getBadges() {
    return supabase
      .from("badges")
      .select("*")
      .order("criteria_type")
      .order("criteria_value");
  },

  /**
   * Fetch badges earned by a specific user.
   *
   * Uses PostgREST resource embedding to join the badges table:
   *   "*, badge:badges(*)" means "all user_badges columns + the full badge
   *   definition nested as a 'badge' object".
   *
   * Sorted newest-first so the most recently earned badge appears at the
   * top of the user's trophy case / profile screen.
   *
   * @param userId - The UUID of the user whose badges to fetch
   */
  getUserBadges(userId: string) {
    return supabase
      .from("user_badges")
      .select("*, badge:badges(*)")
      .eq("user_id", userId)
      .order("awarded_at", { ascending: false });
  },

  /**
   * Fetch a user's weekly climbing streak.
   *
   * Uses maybeSingle() instead of single() because a user who has never
   * logged an ascent won't have a streak row. maybeSingle() returns
   * { data: null, error: null } for missing rows, whereas single() would
   * throw an error with code PGRST116.
   *
   * The streak data includes:
   *   - current_streak: consecutive weeks of climbing (may include freezes)
   *   - longest_streak: all-time personal best streak length
   *   - last_active_week: the ISO week of the user's most recent ascent
   *
   * @param userId - The UUID of the user whose streak to fetch
   */
  getUserStreak(userId: string) {
    return supabase
      .from("user_streaks")
      .select("*")
      .eq("user_id", userId)
      .eq("streak_type", "weekly")
      .maybeSingle();
  },

  /**
   * Fetch leaderboard entries for a gym in a specific time period.
   *
   * Each leaderboard entry includes the user's profile info (display_name,
   * avatar_url) via resource embedding, which the leaderboard UI needs to
   * show names and avatars alongside scores and ranks.
   *
   * Sorted by rank ascending (1st place at the top).
   *
   * @param gymId - The UUID of the gym whose leaderboard to fetch
   * @param period - Time period filter (e.g., "weekly", "monthly", "all_time")
   */
  getLeaderboard(gymId: string, period: string) {
    return supabase
      .from("leaderboard_entries")
      .select("*, profile:profiles(display_name, avatar_url)")
      .eq("gym_id", gymId)
      .eq("period", period)
      .order("rank");
  },
};
