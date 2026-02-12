/**
 * Competition Scoring Utils — Aggregation & Ranking for Live Scoreboards
 *
 * These pure functions transform raw competition_scores rows (one per
 * athlete-per-route) into a ranked scoreboard (one row per athlete with
 * their total score and rank).
 *
 * DATA FLOW:
 *   Raw scores from getEventScores()
 *     → aggregateScores()   — group by user, SUM scores, COUNT routes
 *     → rankCompetitionEntries() — sort + assign 1224 ranks
 *     → UI renders the ranked list
 *
 * WHY CLIENT-SIDE AGGREGATION?
 * Competition datasets are small (<2000 scores per event). Aggregating
 * in the client avoids needing a custom Postgres function or view, and
 * lets us apply category filters instantly without a new DB round trip.
 *
 * WHY REUSE rankLeaderboard()?
 * The existing 1224 competition ranking in utils/scoring.ts already
 * handles ties and tiebreakers correctly. Rather than duplicating that
 * logic, we map our aggregated entries to LeaderboardEntry[], call
 * rankLeaderboard(), and merge the rank back onto our richer type.
 *
 * SCORING MODEL NOTE:
 * All four competition models (tops_and_zones, points, thousand_divide_by,
 * redpoint) encode per-route scores as integers in the competition_scores
 * table. The model-specific semantics are baked into the per-route score
 * at submission time. Aggregation is always SUM — the display format is
 * always a plain integer.
 */

import { rankLeaderboard, type LeaderboardEntry } from "./scoring";
import type { ScoringModel } from "@/services/events.service";

// ── Types ────────────────────────────────────────────────────────────

/**
 * Shape of a raw score row from getEventScores() with embedded profile.
 *
 * The `user` field comes from PostgREST resource embedding:
 *   "user:profiles!user_id(display_name, avatar_url)"
 * It's an object (not array) because the FK is a single profile per score.
 */
export interface RawScore {
  id: string;
  event_id: string;
  route_id: string;
  user_id: string;
  score: number;
  category_id: string | null;
  verified_by: string | null;
  created_at: string;
  user: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

/**
 * One athlete's aggregated performance across all routes in an event.
 *
 * This is the intermediate shape between raw scores and the final ranked
 * display. Contains the summed score plus profile info needed for rendering.
 */
export interface AggregatedEntry {
  userId: string;
  totalScore: number;
  routeCount: number;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Final ranked entry for display — aggregated data plus a 1224 rank.
 */
export interface RankedCompetitionEntry extends AggregatedEntry {
  rank: number;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Groups raw competition scores by user and sums their scores.
 *
 * Algorithm:
 * 1. Optionally filter by category (pre-filter before aggregation)
 * 2. Walk through scores, accumulating per-user totals in a Map
 * 3. On first encounter of a user, initialize their entry with profile data
 * 4. On subsequent encounters, add the score and increment route count
 * 5. Return the Map values as an array
 *
 * WHY A MAP?
 * Maps have O(1) lookup by key, making the grouping O(n) overall.
 * A plain object would work too, but Map makes intent clearer when
 * the keys are UUIDs (not valid JS identifiers).
 *
 * @param scores     - Raw score rows from getEventScores()
 * @param categoryId - Optional: only include scores in this category
 * @returns Array of aggregated entries (one per user), unsorted
 */
export function aggregateScores(
  scores: RawScore[],
  categoryId?: string
): AggregatedEntry[] {
  // Step 1: Pre-filter by category if specified.
  // When categoryId is undefined, all scores are included.
  const filtered = categoryId
    ? scores.filter((s) => s.category_id === categoryId)
    : scores;

  // Step 2: Group by user_id, accumulating totals
  const map = new Map<string, AggregatedEntry>();

  for (const score of filtered) {
    const existing = map.get(score.user_id);

    if (existing) {
      // User already seen — add this route's score to their total
      existing.totalScore += score.score;
      existing.routeCount += 1;
    } else {
      // First score for this user — initialize with profile data
      map.set(score.user_id, {
        userId: score.user_id,
        totalScore: score.score,
        routeCount: 1,
        displayName: score.user?.display_name ?? "Unknown",
        avatarUrl: score.user?.avatar_url ?? null,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Ranks aggregated competition entries using 1224 competition ranking.
 *
 * Maps our AggregatedEntry[] to the LeaderboardEntry[] shape that
 * rankLeaderboard() expects (userId + score), calls it for the ranking
 * logic, then merges the rank back onto our richer AggregatedEntry type.
 *
 * WHY NOT JUST SORT?
 * Sorting gives you order but not rank numbers. The 1224 system needs
 * to assign the same rank to tied entries and skip positions after ties
 * (e.g., two 1st place → next is 3rd, not 2nd). rankLeaderboard()
 * handles this correctly.
 *
 * @param entries - Aggregated entries from aggregateScores()
 * @returns Entries with rank field added, sorted by rank ascending
 */
export function rankCompetitionEntries(
  entries: AggregatedEntry[]
): RankedCompetitionEntry[] {
  if (entries.length === 0) return [];

  // Map to the shape rankLeaderboard() expects
  const leaderboardEntries: LeaderboardEntry[] = entries.map((e) => ({
    userId: e.userId,
    score: e.totalScore,
  }));

  // Delegate to the existing 1224 ranking implementation
  const ranked = rankLeaderboard(leaderboardEntries);

  // Build a lookup from userId → rank for fast merging
  const rankMap = new Map(ranked.map((r) => [r.userId, r.rank]));

  // Merge rank onto the original entries, sorted by rank ascending
  return entries
    .map((e) => ({
      ...e,
      rank: rankMap.get(e.userId)!,
    }))
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Formats a competition score for display.
 *
 * All four competition scoring models store per-route scores as integers,
 * and the aggregated total is always a sum of integers. Unlike the gym
 * leaderboard (which has flash_rate as a decimal and hardest_grade as
 * a canonical grade needing conversion), competition scores display as
 * plain integer strings regardless of the model.
 *
 * @param score - Numeric score to format
 * @param _model - Scoring model (unused — all models display the same way,
 *                 but kept as a parameter for forward compatibility)
 * @returns Score as a plain integer string (e.g., "150", "0")
 */
export function formatCompetitionScore(
  score: number,
  _model: ScoringModel
): string {
  return `${score}`;
}
