/**
 * Feedback Service — Thin Wrapper for Beta Tips & Voting
 *
 * This service manages the route_feedback and route_feedback_votes tables.
 * "Beta" is climbing slang for information about how to climb a route —
 * sequences, holds to use, body positioning tips. Users can post text-based
 * tips and upvote/downvote other users' tips so the best advice rises to
 * the top.
 *
 * DATA MODEL:
 *   route_feedback: { id, route_id, user_id, body, score, created_at }
 *   route_feedback_votes: { feedback_id, user_id, vote ('up'|'down'), created_at }
 *
 * The `score` column on route_feedback is app-maintained (not a trigger).
 * Every vote/unvote operation must recalculate and update the score to
 * keep it consistent. Score = count(up votes) - count(down votes).
 *
 * VOTING PATTERN:
 * Instead of upsert with ON CONFLICT, we use a delete-then-insert approach:
 *   1. DELETE any existing vote by this user on this feedback
 *   2. INSERT the new vote (if voting, not unvoting)
 *   3. UPDATE the feedback's score column
 * This avoids complex ON CONFLICT handling and works cleanly with RLS.
 *
 * WHY NOT A TRIGGER FOR SCORE?
 * A trigger on route_feedback_votes could auto-update score, but:
 *   - It adds hidden complexity that's hard to test from the client
 *   - The service is the single source of write operations anyway
 *   - We can keep the score update explicit and auditable
 * The trade-off is the score could theoretically drift if votes are
 * modified outside this service, but RLS prevents direct table access.
 */

import { supabase } from "@/lib/supabase";

export const feedbackService = {
  /**
   * Fetch all beta tips for a route, with author profile info.
   *
   * The PostgREST resource-embedding join `profile:profiles(...)` fetches
   * the author's display_name and avatar_url in a single query — no N+1.
   * Results are ordered by score descending so the highest-rated tips
   * appear first.
   *
   * @param routeId - The route to fetch feedback for
   */
  getRouteFeedback(routeId: string) {
    return supabase
      .from("route_feedback")
      .select("*, profile:profiles!route_feedback_user_id_fkey(display_name, avatar_url)")
      .eq("route_id", routeId)
      .order("score", { ascending: false });
  },

  /**
   * Fetch the current user's votes for a set of feedback IDs.
   *
   * Used to determine which vote buttons should be highlighted (active).
   * Returns only the user's own votes, filtered to the given feedback IDs.
   *
   * @param feedbackIds - Array of feedback IDs to check votes for
   * @param userId - The authenticated user's ID
   */
  getUserVotes(feedbackIds: string[], userId: string) {
    return supabase
      .from("route_feedback_votes")
      .select("*")
      .eq("user_id", userId)
      .in("feedback_id", feedbackIds);
  },

  /**
   * Create a new beta tip on a route.
   *
   * Score starts at 0 (DB default). The `.select().single()` chain
   * returns the newly created row so the UI can immediately display it.
   *
   * @param routeId - The route this tip is about
   * @param userId - The authenticated user's ID (author)
   * @param body - The tip text content
   */
  createFeedback(routeId: string, userId: string, body: string) {
    return supabase
      .from("route_feedback")
      .insert({ route_id: routeId, user_id: userId, body })
      .select()
      .single();
  },

  /**
   * Delete a beta tip by its ID.
   *
   * RLS ensures only the tip's author can delete it (user_id = auth.uid()).
   * Cascade in the DB will also remove associated votes.
   *
   * @param feedbackId - The feedback row to delete
   */
  deleteFeedback(feedbackId: string) {
    return supabase.from("route_feedback").delete().eq("id", feedbackId);
  },

  /**
   * Cast a vote on a beta tip (upvote or downvote).
   *
   * Uses a three-step pattern:
   *   1. Delete any existing vote by this user on this feedback
   *   2. Insert the new vote
   *   3. Recalculate and update the feedback's score
   *
   * Step 1 handles the case where the user is switching their vote
   * (e.g., changing from downvote to upvote). Without the delete first,
   * the insert would fail on the UNIQUE constraint.
   *
   * @param feedbackId - The feedback to vote on
   * @param userId - The authenticated user's ID
   * @param direction - 'up' or 'down'
   */
  async vote(feedbackId: string, userId: string, direction: "up" | "down") {
    // Step 1: Remove any existing vote by this user on this tip
    await supabase
      .from("route_feedback_votes")
      .delete()
      .eq("feedback_id", feedbackId)
      .eq("user_id", userId);

    // Step 2: Insert the new vote
    await supabase.from("route_feedback_votes").insert({
      feedback_id: feedbackId,
      user_id: userId,
      vote: direction,
    });

    // Step 3: Count likes and update the denormalized score
    await this._recalculateScore(feedbackId);
  },

  /**
   * Remove a vote from a beta tip (toggle off).
   *
   * @param feedbackId - The feedback to unvote
   * @param userId - The authenticated user's ID
   */
  async unvote(feedbackId: string, userId: string) {
    await supabase
      .from("route_feedback_votes")
      .delete()
      .eq("feedback_id", feedbackId)
      .eq("user_id", userId);

    await this._recalculateScore(feedbackId);
  },

  /**
   * Recalculate and persist the denormalized score on a feedback row.
   *
   * Counts all 'up' votes and subtracts 'down' votes to produce the
   * net score. This keeps route_feedback.score in sync with the actual
   * votes in route_feedback_votes.
   */
  async _recalculateScore(feedbackId: string) {
    const { count: upCount } = await supabase
      .from("route_feedback_votes")
      .select("*", { count: "exact", head: true })
      .eq("feedback_id", feedbackId)
      .eq("vote", "up");

    const { count: downCount } = await supabase
      .from("route_feedback_votes")
      .select("*", { count: "exact", head: true })
      .eq("feedback_id", feedbackId)
      .eq("vote", "down");

    await supabase
      .from("route_feedback")
      .update({ score: (upCount ?? 0) - (downCount ?? 0) })
      .eq("id", feedbackId);
  },
};
