/**
 * Seasons Service — Thin Supabase Wrappers for Season CRUD + Route Archival (Step 15.6)
 *
 * Gym admins manage seasons — named time periods (e.g., "Spring 2026") that
 * organize a gym's route rotation schedule. Closing a season batch-archives
 * all active routes and naturally freezes the leaderboard (archived routes
 * can't receive new ascents).
 *
 * Five methods:
 *   1. getSeasonsByGym — fetch all seasons for a gym, newest first
 *   2. createSeason — create a new season
 *   3. closeSeason — mark a season as 'closed'
 *   4. archiveGymRoutes — batch archive all active/retiring routes for a gym
 *   5. deleteSeason — remove a season
 *
 * DATA FLOW:
 *   Screen → useSeasons hook → seasonsService.getSeasonsByGym
 *     → supabase.from('seasons').select(...) → PostgREST → Postgres (RLS)
 *
 * SEASON CLOSE + ARCHIVE:
 * Closing a season is a two-step operation (closeSeason + archiveGymRoutes),
 * orchestrated by the useCloseSeason hook. The two calls are separate (not a
 * DB transaction) because both are idempotent — the admin can retry if one fails.
 */

import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Input shape for creating a new season.
 * All fields use snake_case to match Postgres column names.
 */
export interface CreateSeasonData {
  gym_id: string;
  name: string;
  start_date: string;
  end_date: string;
}

// ── Service ──────────────────────────────────────────────────────────

export const seasonsService = {
  /**
   * Fetch all seasons for a gym, ordered by start_date descending.
   *
   * Newest seasons appear first so the current/most recent season
   * is at the top of the admin list.
   *
   * @param gymId - The gym whose seasons to fetch
   */
  getSeasonsByGym(gymId: string) {
    return supabase
      .from('seasons')
      .select('*')
      .eq('gym_id', gymId)
      .order('start_date', { ascending: false });
  },

  /**
   * Create a new season for a gym.
   *
   * Only gym admins can create seasons per the RLS INSERT policy.
   * No RETURNING clause to avoid the RLS SELECT gotcha.
   *
   * @param data - Season fields: gym_id, name, start_date, end_date
   */
  createSeason(data: CreateSeasonData) {
    return supabase
      .from('seasons')
      .insert(data);
  },

  /**
   * Close a season by setting its status to 'closed'.
   *
   * This is the first half of the season-close flow. The second half
   * (archiveGymRoutes) is called sequentially by the hook to batch-
   * archive all active routes for the gym.
   *
   * @param seasonId - The season UUID to close
   */
  closeSeason(seasonId: string) {
    return supabase
      .from('seasons')
      .update({ status: 'closed' })
      .eq('id', seasonId);
  },

  /**
   * Batch-archive all active and retiring_soon routes for a gym.
   *
   * Called as the second step when closing a season. Sets status to
   * 'archived' for all routes that are currently climbable (active or
   * retiring_soon). This naturally freezes the leaderboard because
   * archived routes can't receive new ascents.
   *
   * @param gymId - The gym whose active routes to archive
   */
  archiveGymRoutes(gymId: string) {
    return supabase
      .from('routes')
      .update({ status: 'archived' })
      .eq('gym_id', gymId)
      .in('status', ['active', 'retiring_soon']);
  },

  /**
   * Delete a season by ID.
   *
   * Only gym admins can delete seasons per the RLS DELETE policy.
   * Used for cleanup of incorrectly created seasons.
   *
   * @param seasonId - The season UUID to delete
   */
  deleteSeason(seasonId: string) {
    return supabase
      .from('seasons')
      .delete()
      .eq('id', seasonId);
  },
};
