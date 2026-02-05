/**
 * Streak Calculation System — utils/streaks.ts
 *
 * Tracks how consistently a climber visits the gym, measured in ISO weeks.
 * A "streak" is a run of consecutive weeks (Mon–Sun) with at least one
 * logged session. This is a core gamification mechanic (FR-F2) that
 * motivates regular attendance.
 *
 * Why weekly (not daily)?
 * Daily streaks punish rest days and travel. Weekly streaks reward
 * consistent attendance patterns — climb any day(s) during the week
 * and the streak continues. This aligns with how most gym climbers
 * actually train (2–4 sessions per week, not every single day).
 *
 * Recovery mechanic:
 * Missing ONE full week doesn't break a streak — it "freezes" it.
 * The streak value is preserved and continues growing when the climber
 * returns. Missing TWO or more full weeks breaks it entirely (resets
 * to 0). This forgiveness keeps users engaged through vacations, minor
 * injuries, or just busy weeks. The `decayedFrom` field in the result
 * tells the UI about the freeze, enabling messages like "Your streak
 * was frozen at 5 — climb this week to keep it going!"
 *
 * Why canonical period-start Dates instead of week numbers?
 * ISO week numbers (1–53) reset at year boundaries, so "week 53 → week 1"
 * looks like a gap of 52 when it's actually consecutive. By normalizing
 * each session date to its Monday start (via date-fns `startOfISOWeek`),
 * we can use `differenceInCalendarISOWeeks` which handles year boundaries
 * correctly. No special-casing needed for December → January transitions.
 *
 * Architecture note:
 * This module is pure TypeScript — no UI, no network, no database.
 * It takes an array of Dates (from the service layer) and returns a
 * plain result object. This makes it trivially testable and reusable
 * across screens (profile, leaderboard, session summary).
 */

import { startOfISOWeek, differenceInCalendarISOWeeks } from 'date-fns';

/* ── Types ────────────────────────────────────────────────────────────── */

/**
 * The four possible streak states:
 *   - 'active'  — climber has a session in the current period (streak growing)
 *   - 'at_risk' — no session yet this period, but streak hasn't expired (1–2 week gap)
 *   - 'broken'  — streak has expired (3+ week gap)
 *   - 'none'    — no sessions at all (brand new user)
 */
export type StreakStatus = 'active' | 'at_risk' | 'broken' | 'none';

/**
 * The result of computing a streak. Designed to give the UI everything
 * it needs in a single object — no follow-up queries required.
 *
 * @property current      - Length of the most recent streak (0 if broken/none)
 * @property longest      - All-time longest streak for this user
 * @property status       - Current streak state (see StreakStatus)
 * @property decayedFrom  - If a freeze occurred, the streak value at freeze time.
 *                          Enables UI hints like "Frozen at 5!". Only present
 *                          when a freeze actually happened.
 */
export interface StreakResult {
  current: number;
  longest: number;
  status: StreakStatus;
  decayedFrom?: number;
}

/**
 * Optional configuration for streak computation.
 *
 * @property referenceDate - The "now" date for computing the gap from the
 *                           last active period. Defaults to `new Date()`.
 *                           Pass a fixed date in tests for deterministic results.
 *
 * Why an options object instead of a plain second parameter?
 * This follows date-fns v4's convention and makes it easy to add future
 * options (e.g., `gracePeriod`, `timezone`) without breaking the API.
 */
export interface StreakOptions {
  referenceDate?: Date;
}

/* ── Internal helpers ─────────────────────────────────────────────────── */

/**
 * Deduplicates and sorts an array of period-start Dates.
 *
 * Because multiple sessions can fall in the same ISO week (e.g., climbing
 * Monday and Wednesday), we need to collapse them to unique weeks before
 * counting. We use the Date's timestamp as a map key for O(1) dedup.
 *
 * @param periodStarts - Array of Monday-start dates (from groupByWeek)
 * @returns Sorted (ascending) array of unique period-start dates
 */
function deduplicateAndSort(periodStarts: Date[]): Date[] {
  // Use a Map keyed by timestamp to deduplicate.
  // Map preserves insertion order, but we sort explicitly afterward
  // because input order is not guaranteed.
  const unique = new Map<number, Date>();
  for (const date of periodStarts) {
    const key = date.getTime();
    if (!unique.has(key)) {
      unique.set(key, date);
    }
  }

  // Sort ascending by timestamp — earliest sessions first.
  // This is critical for the walk algorithm which processes oldest→newest.
  return Array.from(unique.values()).sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Core streak analysis algorithm.
 *
 * Walks through sorted, deduplicated period-start dates from oldest to
 * newest, building "runs" of consecutive (or freeze-eligible) periods.
 * Then evaluates the gap from the last active period to the reference
 * period to determine the current streak status.
 *
 * This is an internal helper that operates generically on any period
 * granularity (weekly, monthly, etc.) via the `periodDiff` callback.
 * Currently only used for weekly streaks, but designed to support monthly
 * if that feature is added later.
 *
 * @param sortedPeriodStarts  - Unique period-start dates, sorted ascending
 * @param referencePeriodStart - The start of the "current" period (e.g., this Monday)
 * @param periodDiff          - Function that returns the number of periods
 *                              between two dates (e.g., differenceInCalendarISOWeeks)
 * @returns StreakResult with current, longest, status, and optional decayedFrom
 */
function analyzeStreak(
  sortedPeriodStarts: Date[],
  referencePeriodStart: Date,
  periodDiff: (later: Date, earlier: Date) => number,
): StreakResult {
  // Base case: no sessions at all → no streak
  if (sortedPeriodStarts.length === 0) {
    return { current: 0, longest: 0, status: 'none' };
  }

  // ── Walk periods oldest → newest, building runs ──────────────────
  //
  // A "run" is a sequence of periods where consecutive gaps are either
  // 1 (truly consecutive) or 2 (one missed period → freeze).
  // A gap of 3+ breaks the run entirely.

  let runLength = 1;           // Current run starts at 1 (the first session)
  let longest = 1;             // Track the all-time longest run
  let decayedFrom: number | undefined; // Set when a freeze occurs

  for (let i = 1; i < sortedPeriodStarts.length; i++) {
    const gap = periodDiff(sortedPeriodStarts[i], sortedPeriodStarts[i - 1]);

    if (gap === 1) {
      // Consecutive period — streak grows normally
      runLength++;
    } else if (gap === 2) {
      // One missed period — freeze mechanic: streak continues but we
      // record the "frozen at" value for UI hints.
      // The idea: the missed week is forgiven, so the streak keeps growing.
      decayedFrom = runLength;
      runLength++;
    } else if (gap >= 3) {
      // Two or more missed periods — streak is irreparably broken.
      // Finalize the current run (update longest) and start fresh.
      longest = Math.max(longest, runLength);
      runLength = 1;
      decayedFrom = undefined; // Reset decay marker for the new run
    }
    // gap === 0 shouldn't happen after deduplication, but if it does,
    // we just skip it (same period, no change to streak).
  }

  // After the walk, `runLength` holds the length of the most recent run.
  // Update longest to account for this final run.
  longest = Math.max(longest, runLength);

  // ── Evaluate gap from last session period to reference period ─────
  //
  // This determines the streak STATUS (active, at_risk, or broken).
  // The walk above determined the streak LENGTH; now we check if it's
  // still "alive" relative to the current date.

  const lastPeriod = sortedPeriodStarts[sortedPeriodStarts.length - 1];
  const gapToNow = periodDiff(referencePeriodStart, lastPeriod);

  if (gapToNow === 0) {
    // Session exists in the current period — streak is alive and growing
    const result: StreakResult = {
      current: runLength,
      longest,
      status: 'active',
    };
    if (decayedFrom !== undefined) result.decayedFrom = decayedFrom;
    return result;
  }

  if (gapToNow === 1) {
    // No session this period, but last period was active.
    // Streak is at risk — climber needs to log a session this period.
    const result: StreakResult = {
      current: runLength,
      longest,
      status: 'at_risk',
    };
    if (decayedFrom !== undefined) result.decayedFrom = decayedFrom;
    return result;
  }

  if (gapToNow === 2) {
    // No session this period AND last period was empty.
    // Freeze mechanic applies: streak is preserved but "at risk".
    // decayedFrom records the frozen value for UI display.
    return {
      current: runLength,
      longest,
      status: 'at_risk',
      decayedFrom: runLength,
    };
  }

  // gapToNow >= 3: Two or more full periods missed → streak is broken
  return {
    current: 0,
    longest,
    status: 'broken',
  };
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Maps an array of session dates to their ISO week Monday starts,
 * deduplicates (multiple sessions in the same week → one entry),
 * and returns them sorted ascending.
 *
 * @internal Exported for testability. Not part of the public API contract.
 *
 * Why ISO weeks?
 * ISO 8601 defines weeks as Monday–Sunday. This is important for climbers
 * who often cluster sessions around weekends — Sunday's session belongs
 * to the SAME week as Monday's, not the following week. `startOfISOWeek`
 * from date-fns handles this correctly, including year boundaries where
 * ISO week 1 can start in the previous calendar year (e.g., Mon Dec 29, 2025
 * is the start of ISO week 1 of 2026).
 *
 * @param dates - Raw session dates (any time of day, any order, may have duplicates)
 * @returns Unique ISO week Monday-start dates, sorted ascending
 */
export function groupByWeek(dates: Date[]): Date[] {
  // Step 1: Map each date to its ISO week's Monday start.
  // startOfISOWeek returns midnight (00:00:00) on the Monday of that date's
  // ISO week. Two dates in the same week will produce identical Mondays.
  const mondayStarts = dates.map((d) => startOfISOWeek(d));

  // Step 2: Deduplicate (same week → same Monday) and sort ascending.
  return deduplicateAndSort(mondayStarts);
}

/**
 * Computes the weekly climbing streak from an array of session dates.
 *
 * This is the main entry point for streak calculation. It:
 * 1. Groups all session dates by ISO week (Mon–Sun), deduplicating
 * 2. Analyzes consecutive weeks to find runs (streaks)
 * 3. Applies the recovery mechanic (1 missed week = freeze, 2+ = break)
 * 4. Evaluates the current streak status relative to "today"
 *
 * @param sessionDates - Array of Date objects when sessions were logged.
 *                       Can be in any order, may contain duplicates, any
 *                       time of day. The function handles all normalization.
 * @param options      - Optional config. Use `referenceDate` to override
 *                       "today" for testing.
 * @returns StreakResult with current streak, longest streak, status, and
 *          optional decayedFrom if a freeze occurred.
 *
 * @example
 * // Active 3-week streak
 * computeWeeklyStreak([mon1, mon2, mon3])
 * // → { current: 3, longest: 3, status: 'active' }
 *
 * @example
 * // Streak frozen (missed 1 week)
 * computeWeeklyStreak([mon1, mon2], { referenceDate: fourWeeksLater })
 * // → { current: 2, longest: 2, status: 'at_risk', decayedFrom: 2 }
 */
export function computeWeeklyStreak(
  sessionDates: Date[],
  options?: StreakOptions,
): StreakResult {
  // Use the provided reference date or default to "right now"
  const referenceDate = options?.referenceDate ?? new Date();

  // Normalize: group sessions by ISO week and deduplicate
  const weekStarts = groupByWeek(sessionDates);

  // Normalize the reference date to its week's Monday start
  const referencePeriodStart = startOfISOWeek(referenceDate);

  // Delegate to the generic streak analyzer with the ISO week diff function.
  // differenceInCalendarISOWeeks(later, earlier) returns the number of
  // calendar ISO weeks between two dates — handles year boundaries correctly.
  return analyzeStreak(weekStarts, referencePeriodStart, differenceInCalendarISOWeeks);
}
