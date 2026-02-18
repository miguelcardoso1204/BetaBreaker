/**
 * Consensus Service — Supabase RPC Wrappers for Grade Consensus (Step 15.4)
 *
 * Two thin wrappers around the grade consensus RPCs defined in migration
 * 20260218140000_grade_consensus_rpcs.sql. These RPCs aggregate route_ascents
 * data using GROUP BY and computed columns that PostgREST can't express.
 *
 * DATA FLOW:
 *   Screen → useRoutesGradeConsensus hook → consensusService.getRoutesGradeConsensus
 *     → supabase.rpc('get_routes_grade_consensus') → Postgres
 *
 * Both RPCs are SECURITY INVOKER — they run under the caller's RLS context.
 * Since routes and route_ascents have SELECT USING (true) for authenticated,
 * any logged-in user can call these.
 */

import { supabase } from "@/lib/supabase";

export const consensusService = {
  /**
   * Fetches all active/retiring_soon routes at a gym with consensus data.
   * Returns computed fields: submission_count, consensus_grade, divergence.
   * Ordered by divergence DESC NULLS LAST so the most "off" routes appear first.
   */
  getRoutesGradeConsensus(gymId: string) {
    return supabase.rpc("get_routes_grade_consensus", {
      p_gym_id: gymId,
    });
  },

  /**
   * Fetches the perceived_grade distribution for a single route.
   * Each row is a (grade, count) pair, ordered by grade ascending.
   * Powers the drill-down view when an admin taps a route card.
   */
  getGradeSubmissions(routeId: string) {
    return supabase.rpc("get_grade_submissions", {
      p_route_id: routeId,
    });
  },
};
