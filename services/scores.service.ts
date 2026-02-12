/**
 * Scores Service — Thin Wrapper for Competition Score CRUD
 *
 * Manages the competition_scores table which tracks athlete performance
 * during climbing events. Each row represents one athlete's score on one
 * route in one event.
 *
 * SCORE LIFECYCLE:
 *   1. Athlete scans a route QR or browses the event → submits a score
 *   2. Score is self-reported (verified_by = NULL)
 *   3. Judge can verify (sets verified_by) or update the score
 *   4. Admin can delete erroneous entries
 *
 * RLS POLICIES (from 20260206060000_competitions.sql):
 *   - SELECT: any authenticated user
 *   - INSERT: user_id = auth.uid() OR judge+ role
 *   - UPDATE: judge+ role only
 *   - DELETE: gym_admin+ only
 *
 * IMPORTANT DESIGN DECISIONS:
 *   - No upsert: INSERT allows athletes (user_id = auth.uid()), but UPDATE
 *     requires judge+ role. A .upsert() from an athlete would INSERT fine
 *     but the conflict-triggered UPDATE gets rejected by RLS. We use plain
 *     .insert() — UNIQUE violation shows "Score already submitted".
 *   - No RETURNING on INSERT: consistent with the project-wide pattern
 *     to avoid the RLS + INSERT RETURNING gotcha.
 *   - getActiveEventsForRoute uses !inner join so only events containing
 *     the scanned route are returned (PostgREST INNER JOIN modifier).
 */

import { supabase } from "@/lib/supabase";

/** Shape for creating a new score. Matches competition_scores.Insert minus auto-fields. */
export interface CreateScoreData {
  event_id: string;
  user_id: string;
  route_id: string;
  score: number;
  category_id?: string;
}

/** Shape for updating an existing score (judge action). */
export interface UpdateScoreData {
  score?: number;
  verified_by?: string;
}

export const scoresService = {
  /**
   * Fetch all scores for an event with embedded user and route info.
   *
   * Embeds profiles (display_name, avatar_url) and routes (name, grade)
   * so the admin/judge scoreboard can display meaningful data without
   * extra queries. The !user_id hint tells PostgREST which FK to use
   * for the profiles join (since competition_scores has two profile FKs:
   * user_id and verified_by).
   */
  getEventScores(eventId: string) {
    return supabase
      .from("competition_scores")
      .select(
        "*, user:profiles!user_id(display_name, avatar_url), route:routes(name, canonical_grade)"
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
  },

  /**
   * Fetch one athlete's scores in an event.
   *
   * Used by the athlete event screen to show which routes they've already
   * scored and whether those scores have been verified. Embeds route info
   * for display names and grades.
   */
  getUserEventScores(eventId: string, userId: string) {
    return supabase
      .from("competition_scores")
      .select("*, route:routes(name, canonical_grade)")
      .eq("event_id", eventId)
      .eq("user_id", userId);
  },

  /**
   * Fetch a single score by the composite key (event + user + route).
   *
   * Used to check if an athlete already submitted a score for a specific
   * route before allowing another submission. Returns null if no score
   * exists (maybeSingle vs single — doesn't throw on 0 rows).
   */
  getScore(eventId: string, userId: string, routeId: string) {
    return supabase
      .from("competition_scores")
      .select("*")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .eq("route_id", routeId)
      .maybeSingle();
  },

  /**
   * Fetch ongoing events that contain a specific route.
   *
   * Called after a QR scan to check if the scanned route is part of
   * any active competition. The `!inner` modifier on event_routes
   * performs an INNER JOIN — only events that actually contain the
   * route are returned. Without it, PostgREST would do a LEFT JOIN
   * and return all ongoing events with event_routes as an empty array.
   */
  getActiveEventsForRoute(routeId: string) {
    return supabase
      .from("events")
      .select("id, name, status, event_routes!inner(route_id)")
      .eq("status", "ongoing")
      .eq("event_routes.route_id", routeId);
  },

  /**
   * Submit a new score.
   *
   * Athletes call this to self-report their performance on a comp route.
   * The UNIQUE(event_id, user_id, route_id) constraint prevents duplicate
   * submissions — a unique violation error surfaces as "Score already submitted"
   * in the UI. No RETURNING for consistency with the project-wide pattern.
   */
  createScore(data: CreateScoreData) {
    return supabase.from("competition_scores").insert(data);
  },

  /**
   * Update a score's value and/or verification status.
   *
   * Only judges can call this (RLS UPDATE policy requires judge+ role).
   * Used when a judge observes the actual attempt and records the
   * authoritative score, overriding the athlete's self-report.
   */
  updateScore(scoreId: string, data: UpdateScoreData) {
    return supabase
      .from("competition_scores")
      .update(data)
      .eq("id", scoreId);
  },

  /**
   * Mark a score as verified by a judge.
   *
   * Convenience method — sets only verified_by without changing the score.
   * Used when the judge confirms the athlete's self-reported score is accurate.
   */
  verifyScore(scoreId: string, verifiedBy: string) {
    return supabase
      .from("competition_scores")
      .update({ verified_by: verifiedBy })
      .eq("id", scoreId);
  },

  /**
   * Delete a score.
   *
   * Only gym_admin+ can call this (RLS DELETE policy). Used for removing
   * erroneous or disputed entries from the competition.
   */
  deleteScore(scoreId: string) {
    return supabase.from("competition_scores").delete().eq("id", scoreId);
  },
};
