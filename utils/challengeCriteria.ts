/**
 * Challenge Criteria — Zod Schema & Pure Helper Functions (Step 8.4)
 *
 * This module defines the validation schema for challenge criteria and provides
 * pure utility functions for computing progress, deriving status, and formatting
 * time remaining. These are used by:
 *   - The challenge creation UI (Zod validation)
 *   - ChallengeCard component (progress display, status badge, countdown)
 *   - Profile screen (active challenge list)
 *
 * CRITERIA TYPES:
 * Challenges use a JSONB criteria column in the DB. The Zod schema validates
 * these objects client-side before they're sent to the DB. The DB trigger
 * (`update_challenge_progress`) parses the same JSON server-side.
 *
 *   - send_count:    Total successful ascents (flash + send) during period
 *   - flash_count:   Total flash-only ascents during period
 *   - unique_routes: Count of distinct routes sent during period
 *   - grade_sends:   Sends at or above a minimum canonical grade during period
 *
 * WHY ZOD?
 * Zod provides runtime type validation that TypeScript alone can't. TypeScript
 * checks types at compile time, but JSONB data from the DB arrives as `unknown`.
 * Zod validates the actual values at runtime, catching malformed criteria before
 * they cause errors in the progress computation logic.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants — the four supported criteria types
// ---------------------------------------------------------------------------
// `as const` makes this a readonly tuple of literal string types, which Zod
// uses for the enum validator. Adding a new type here automatically updates
// the TypeScript type and Zod validation.
const CHALLENGE_CRITERIA_TYPES = [
  "send_count",
  "flash_count",
  "unique_routes",
  "grade_sends",
] as const;

// ---------------------------------------------------------------------------
// Zod Schema — validates challenge criteria JSONB objects
// ---------------------------------------------------------------------------
// The .refine() at the end adds a cross-field validation rule: grade_sends
// criteria MUST include min_grade. Without it, the trigger wouldn't know
// which grade threshold to check against.
export const challengeCriteriaSchema = z
  .object({
    type: z.enum(CHALLENGE_CRITERIA_TYPES),
    // target must be a positive integer (at least 1 qualifying action needed)
    target: z.number().int().min(1),
    // min_grade is optional for most types, but required for grade_sends.
    // Uses the 0-30 canonical grade scale (V0 = 0, V16+ = 30).
    min_grade: z.number().int().min(0).max(30).optional(),
  })
  .refine(
    (data) => data.type !== "grade_sends" || data.min_grade !== undefined,
    { message: "min_grade is required for grade_sends criteria" },
  );

/**
 * TypeScript type inferred from the Zod schema.
 *
 * z.infer extracts the TypeScript type from a Zod schema, giving us
 * compile-time type safety that exactly matches the runtime validation.
 * This means we never need to manually keep the type and schema in sync.
 */
export type ChallengeCriteria = z.infer<typeof challengeCriteriaSchema>;

// ---------------------------------------------------------------------------
// computeChallengeProgress — compute progress from ascent data
// ---------------------------------------------------------------------------
/**
 * Pure function that computes how much progress a user has made toward a
 * challenge goal, based on their ascent data during the challenge period.
 *
 * This runs CLIENT-SIDE for display purposes. The authoritative progress
 * is computed server-side by the `update_challenge_progress()` trigger
 * function. Both implementations use the same logic to ensure consistency.
 *
 * @param criteria - The challenge's criteria (type, target, optional min_grade)
 * @param ascents  - Array of ascent data with status, route_id, and route_grade
 * @returns The current progress count (not capped at target)
 */
export function computeChallengeProgress(
  criteria: ChallengeCriteria,
  ascents: { status: string; route_id: string; route_grade: number }[],
): number {
  switch (criteria.type) {
    case "send_count":
      // Count all successful ascents — both flash and send status count.
      // Attempts are excluded because they represent incomplete climbs.
      return ascents.filter(
        (a) => a.status === "flash" || a.status === "send",
      ).length;

    case "flash_count":
      // Only count flash ascents — completing a route on the first attempt.
      // This is stricter than send_count and rewards clean climbing.
      return ascents.filter((a) => a.status === "flash").length;

    case "unique_routes":
      // Count DISTINCT routes with at least one successful ascent.
      // A Set automatically deduplicates route_ids. Multiple sends of
      // the same route only count once toward the challenge.
      return new Set(
        ascents
          .filter((a) => a.status === "flash" || a.status === "send")
          .map((a) => a.route_id),
      ).size;

    case "grade_sends": {
      // Count successful ascents at or above the minimum grade.
      // The non-null assertion is safe because Zod validates that
      // min_grade is present for grade_sends criteria.
      const minGrade = criteria.min_grade!;
      return ascents.filter(
        (a) =>
          (a.status === "flash" || a.status === "send") &&
          a.route_grade >= minGrade,
      ).length;
    }

    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// deriveChallengeStatus — derive display status from dates + completion
// ---------------------------------------------------------------------------
/**
 * Pure function that determines a challenge's display status based on its
 * date range and the user's completion state.
 *
 * Status priority:
 *   1. "completed" — user finished the challenge (highest priority)
 *   2. "upcoming"  — challenge hasn't started yet
 *   3. "expired"   — challenge ended without completion
 *   4. "active"    — challenge is in progress
 *
 * @param challenge     - Object with start_date and end_date ISO strings
 * @param progress      - User's progress record (null if not started)
 * @param referenceDate - "Now" date for testing (defaults to new Date())
 * @returns One of 'active' | 'completed' | 'expired' | 'upcoming'
 */
export function deriveChallengeStatus(
  challenge: { start_date: string; end_date: string },
  progress?: { completed_at: string | null } | null,
  referenceDate?: Date,
): "active" | "completed" | "expired" | "upcoming" {
  // If the user has completed the challenge, that takes priority over dates.
  // A completed challenge stays "completed" even after the period ends.
  if (progress?.completed_at) {
    return "completed";
  }

  const now = referenceDate ?? new Date();
  const start = new Date(challenge.start_date);
  const end = new Date(challenge.end_date);

  // Check if the challenge hasn't started yet
  if (now < start) {
    return "upcoming";
  }

  // Check if the challenge period has ended
  if (now >= end) {
    return "expired";
  }

  // The challenge is currently active (started but not ended, not completed)
  return "active";
}

// ---------------------------------------------------------------------------
// computeTimeRemaining — human-readable countdown string
// ---------------------------------------------------------------------------
/**
 * Pure function that formats the time remaining until a challenge ends
 * into a human-readable string for display in ChallengeCard.
 *
 * Time formatting rules:
 *   - 1+ days remaining → "X days left"
 *   - < 24 hours remaining → "X hours left"
 *   - Challenge ended → "Ended"
 *
 * @param endDate       - ISO string of when the challenge ends
 * @param referenceDate - "Now" date for testing (defaults to new Date())
 * @returns Human-readable time remaining string
 */
export function computeTimeRemaining(
  endDate: string,
  referenceDate?: Date,
): string {
  const now = referenceDate ?? new Date();
  const end = new Date(endDate);
  const diffMs = end.getTime() - now.getTime();

  // If the challenge has already ended, return "Ended"
  if (diffMs <= 0) {
    return "Ended";
  }

  // Convert milliseconds to hours and days
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Show days when 1+ days remain, hours when less than a day
  if (diffDays >= 1) {
    return `${diffDays} days left`;
  }

  return `${diffHours} hours left`;
}
