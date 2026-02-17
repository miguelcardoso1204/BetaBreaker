/**
 * Suggestion Scoring — Personalized Route Recommendation Engine
 *
 * Pure functions that power the "Suggested for You" feature (FR-E3).
 * Given a user's climbing profile (style distribution, sent routes)
 * and a pool of candidate routes, these functions score and rank routes
 * that would best help the user grow.
 *
 * Scoring philosophy:
 * - **Novel styles** (tags the user has NEVER tried) score highest (+2).
 *   These represent blind spots in the user's climbing repertoire.
 * - **Weak styles** (tags below the user's average) score medium (+1).
 *   These are areas where the user has experience but is under-practiced.
 * - **Strong styles** (at or above average) score zero.
 *   The user doesn't need more practice here — they already excel.
 *
 * Why client-side scoring instead of a Postgres function?
 * - PostgREST can't do `NOT IN (subquery)` for filtering out sent routes.
 * - The scoring logic depends on user-specific style analysis that's already
 *   computed client-side by useStyleInsights.
 * - The candidate set is bounded (one gym's active routes, ~50-200 routes)
 *   so client-side filtering is fast and avoids a complex SQL function.
 */

import type { StyleInsightEntry } from "@/services/sessions.service";

// ── Constants ──────────────────────────────────────────────────────

/** How many suggestions to show per page in the horizontal scroll. */
export const DEFAULT_SUGGESTION_PAGE_SIZE = 8;

/**
 * How far above/below the user's max grade to look for candidates.
 * A range of ±2 canonical grades covers about one V-grade in each
 * direction, keeping suggestions challenging but achievable.
 */
export const SUGGESTION_GRADE_RANGE = 2;

// ── Types ──────────────────────────────────────────────────────────

/**
 * A route fetched from the DB with its crowd-sourced style tags flattened.
 * The service layer (getCandidateRoutes) transforms the nested PostgREST
 * response into this flat shape for scoring.
 */
export interface CandidateRoute {
  id: string;
  name: string;
  canonical_grade: number;
  color: string | null;
  status: string;
  /** Flattened tag names from route_style_tags → style_tags join. */
  tags: string[];
}

/**
 * A candidate route after scoring — includes the computed relevance score.
 * Higher score = better match for the user's growth areas.
 */
export interface ScoredRoute extends CandidateRoute {
  score: number;
}

/** Input parameters for the scoreSuggestions pipeline. */
export interface SuggestionParams {
  /** All routes in the gym within the grade range (pre-fetched). */
  candidates: CandidateRoute[];
  /** Route IDs the user has already sent/flashed — these are excluded. */
  sentRouteIds: Set<string>;
  /** Tags where the user is below their own average (from computeWeakStyles). */
  weakStyles: Set<string>;
  /** All tags the user has ever sent a route with — used to detect novel tags. */
  knownStyles: Set<string>;
  /** Zero-indexed page number for pagination. */
  page: number;
  /** Optional override for page size (defaults to DEFAULT_SUGGESTION_PAGE_SIZE). */
  pageSize?: number;
}

/** Output of the scoreSuggestions pipeline. */
export interface SuggestionResult {
  /** The scored and sorted routes for the requested page. */
  suggestions: ScoredRoute[];
  /** Whether there are more pages after this one. */
  hasMore: boolean;
}

// ── Functions ──────────────────────────────────────────────────────

/**
 * Identify the user's weak climbing styles from their style distribution.
 *
 * A "weak" style is any tag where the user's send count is strictly below
 * the mean across all tags. This highlights under-practiced areas where
 * targeted route suggestions would be most valuable.
 *
 * @param distribution - The user's style tag counts from getStyleInsights()
 * @returns Set of tag names that are below the user's average
 */
export function computeWeakStyles(
  distribution: StyleInsightEntry[]
): Set<string> {
  if (distribution.length === 0) return new Set();

  // Calculate the mean count across all tags. Tags at or above the mean
  // are "strong" — the user climbs these regularly. Tags below are "weak".
  const total = distribution.reduce((sum, entry) => sum + entry.count, 0);
  const mean = total / distribution.length;

  const weak = new Set<string>();
  for (const entry of distribution) {
    if (entry.count < mean) {
      weak.add(entry.tagName);
    }
  }

  return weak;
}

/**
 * Score a single route based on how well its tags match the user's growth areas.
 *
 * Scoring per tag:
 * - Novel (not in knownStyles): +2 — the user has never tried this style
 * - Weak (in weakStyles): +1 — the user has tried it but is below average
 * - Strong (known but not weak): +0 — no growth benefit
 *
 * @param route - The candidate route with its style tags
 * @param weakStyles - Tags the user is below average on
 * @param knownStyles - All tags the user has ever encountered on sent routes
 * @returns Numeric score (higher = better recommendation)
 */
export function scoreRoute(
  route: CandidateRoute,
  weakStyles: Set<string>,
  knownStyles: Set<string>
): number {
  let score = 0;

  for (const tag of route.tags) {
    if (!knownStyles.has(tag)) {
      // Novel: the user has never sent a route with this tag.
      // Highest priority — exposes them to new climbing styles.
      score += 2;
    } else if (weakStyles.has(tag)) {
      // Weak: the user has tried it but is below their own average.
      // Medium priority — helps shore up existing weaknesses.
      score += 1;
    }
    // Strong tags (known + not weak) add nothing — no growth benefit.
  }

  return score;
}

/**
 * The full suggestion pipeline: filter → score → sort → paginate.
 *
 * 1. Filter out routes the user has already sent (no point re-suggesting)
 * 2. Score each remaining route against the user's weak/novel styles
 * 3. Sort by score descending, then by grade descending as tiebreaker
 *    (prefer harder routes when scores are equal — more aspirational)
 * 4. Paginate to the requested page
 *
 * @param params - Candidates, sent IDs, style analysis, and pagination
 * @returns Scored suggestions for the requested page + hasMore flag
 */
export function scoreSuggestions(params: SuggestionParams): SuggestionResult {
  const {
    candidates,
    sentRouteIds,
    weakStyles,
    knownStyles,
    page,
    pageSize = DEFAULT_SUGGESTION_PAGE_SIZE,
  } = params;

  // Step 1: Filter out already-sent routes. The user wants NEW challenges.
  const unsent = candidates.filter((r) => !sentRouteIds.has(r.id));

  // Step 2: Score each candidate based on tag overlap with weak/novel styles.
  const scored: ScoredRoute[] = unsent.map((route) => ({
    ...route,
    score: scoreRoute(route, weakStyles, knownStyles),
  }));

  // Step 3: Sort by score descending (best matches first).
  // Tiebreaker: higher grade first — when two routes score the same,
  // the harder one is more aspirational and interesting.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.canonical_grade - a.canonical_grade;
  });

  // Step 4: Paginate. Slice the sorted array to the requested page.
  const start = page * pageSize;
  const end = start + pageSize;
  const paginated = scored.slice(start, end);

  return {
    suggestions: paginated,
    hasMore: end < scored.length,
  };
}
