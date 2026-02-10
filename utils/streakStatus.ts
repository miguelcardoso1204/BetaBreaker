// utils/streakStatus.ts
//
// Client-side streak status derivation from stale DB data.
//
// WHY THIS EXISTS:
// The database's `user_streaks` table stores `current_streak` and
// `last_active_date`, but these values only update when the
// `recompute_streak()` trigger fires (on ascent insert/delete).
// If a user goes inactive for weeks, no trigger fires, so the DB
// still shows the old streak value. This function bridges the gap
// by comparing `last_active_date` against the current date to
// determine the real-time streak status.
//
// This is a pure function — no network, no side effects, no state.
// It takes the DB values + a reference date, and returns a
// DerivedStreak object the UI can render directly.
//
// ARCHITECTURE NOTE:
// This uses the same ISO week gap logic as `utils/streaks.ts`.
// The difference: `streaks.ts` computes streaks from raw session
// dates (used by DB triggers), while this module derives status
// from pre-computed DB values (used by the client UI).

import { parseISO, startOfISOWeek, differenceInCalendarISOWeeks } from "date-fns";
import type { StreakStatus } from "./streaks";

/**
 * The result of deriving real-time streak status from DB data.
 *
 * @property displayStreak - The streak number to show in the UI.
 *   This is 0 when the streak is broken (overriding the stale DB value),
 *   or the DB's current_streak when the streak is still alive.
 * @property status - The four-state streak status (active/at_risk/broken/none).
 * @property decayedFrom - Set when gap = 2 weeks (freeze mechanic).
 *   Tells the UI the streak was frozen at this value, enabling messages
 *   like "Your streak is frozen at 5. Climb this week to keep it going!"
 */
export interface DerivedStreak {
  displayStreak: number;
  status: StreakStatus;
  decayedFrom?: number;
}

/**
 * Derives the real-time streak status by comparing the last active date
 * against the current date using ISO week gaps.
 *
 * Gap logic (same as the DB trigger in utils/streaks.ts):
 *   - 0 weeks → active (climbed this ISO week)
 *   - 1 week  → at_risk (missed this week, still salvageable)
 *   - 2 weeks → at_risk + frozen (freeze mechanic preserves the streak)
 *   - 3+ weeks → broken (streak has expired, display 0)
 *
 * WHY parseISO?
 * The DB stores `last_active_date` as a bare "YYYY-MM-DD" string.
 * Using `new Date("2026-01-26")` would parse it as UTC midnight, which
 * can shift to the previous day in negative UTC offsets (e.g., US timezones).
 * `parseISO` from date-fns handles bare date strings correctly by treating
 * them as local dates, avoiding timezone-shift bugs.
 *
 * @param currentStreak   - The DB's `current_streak` value (may be stale)
 * @param lastActiveDate  - The DB's `last_active_date` as "YYYY-MM-DD" or null
 * @param referenceDate   - Override for "now" (defaults to new Date()). Pass a
 *                          fixed date in tests for deterministic results.
 * @returns DerivedStreak with display-ready values for the UI
 */
export function deriveStreakStatus(
  currentStreak: number,
  lastActiveDate: string | null,
  referenceDate?: Date,
): DerivedStreak {
  // No last active date or zero streak → no streak to display.
  // This covers brand-new users and users whose streak was already
  // reset to 0 in the DB.
  if (!lastActiveDate || currentStreak === 0) {
    return { displayStreak: 0, status: "none" };
  }

  // Parse the date string and compute ISO week gap.
  // Both dates are normalized to their ISO week's Monday start so that
  // "Monday Jan 26" and "Thursday Jan 29" are in the same week.
  const now = referenceDate ?? new Date();
  const lastActive = parseISO(lastActiveDate);
  const gap = differenceInCalendarISOWeeks(
    startOfISOWeek(now),
    startOfISOWeek(lastActive),
  );

  // Gap = 0: climbed this ISO week → streak is alive
  if (gap === 0) {
    return { displayStreak: currentStreak, status: "active" };
  }

  // Gap = 1: missed this week but last week was active → at risk
  if (gap === 1) {
    return { displayStreak: currentStreak, status: "at_risk" };
  }

  // Gap = 2: freeze mechanic — streak is preserved but frozen.
  // The decayedFrom value tells the UI the streak was frozen at
  // this point, enabling a specific recovery message.
  if (gap === 2) {
    return {
      displayStreak: currentStreak,
      status: "at_risk",
      decayedFrom: currentStreak,
    };
  }

  // Gap >= 3: streak has expired. The DB value is stale, so we
  // override displayStreak to 0 to show the truth.
  return { displayStreak: 0, status: "broken" };
}
