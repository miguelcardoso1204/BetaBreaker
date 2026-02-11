/**
 * ISO Week Label Helpers — Pure Date Math
 *
 * Produces ISO 8601 week labels like "2026-W07" for leaderboard periods.
 * Each gym leaderboard resets weekly, so these labels serve as the `period`
 * parameter in leaderboard queries.
 *
 * ISO 8601 week rules:
 *   - Weeks start on Monday
 *   - Week 01 is the week containing the first Thursday of the year
 *   - A year has 52 or 53 weeks
 *   - Jan 1 can belong to week 52/53 of the PREVIOUS year
 *
 * No external dependencies — just Date arithmetic.
 */

/**
 * Compute the ISO week number and ISO year for a given date.
 *
 * Algorithm:
 * 1. Find the nearest Thursday to the given date (ISO weeks are anchored
 *    to Thursdays — the year of that Thursday determines the ISO year).
 * 2. Compute the day-of-year for that Thursday.
 * 3. Divide by 7 to get the week number.
 *
 * Why Thursday? ISO 8601 defines week 01 as the week containing Jan 4,
 * which is equivalent to the week containing the year's first Thursday.
 * By shifting to the nearest Thursday, we ensure dates near year
 * boundaries (like Jan 1) get the correct ISO year.
 */
function getISOWeekAndYear(date: Date): { week: number; year: number } {
  // Clone to avoid mutating the input date.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  // Shift to the nearest Thursday: current date + (4 - dayOfWeek).
  // getUTCDay() returns 0 (Sunday) through 6 (Saturday).
  // We need Monday=1..Sunday=7 for ISO, so map Sunday(0) → 7.
  const dayOfWeek = d.getUTCDay() || 7; // Sunday becomes 7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek); // shift to Thursday

  // The ISO year is the year of that Thursday.
  const year = d.getUTCFullYear();

  // Day of year for this Thursday: difference from Jan 1 of the same year.
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.ceil(
    (d.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;

  // Week number: which 7-day block this day falls in.
  const week = Math.ceil(dayOfYear / 7);

  return { week, year };
}

/**
 * Get the ISO week label for a specific date.
 *
 * @param date - Any JS Date object
 * @returns A string like "2026-W07" (zero-padded week number)
 *
 * @example
 * getISOWeekLabel(new Date(2026, 1, 11)) // → "2026-W07"
 * getISOWeekLabel(new Date(2027, 0, 1))  // → "2026-W53" (year boundary!)
 */
export function getISOWeekLabel(date: Date): string {
  const { week, year } = getISOWeekAndYear(date);
  // Pad the week number to 2 digits: 1 → "01", 12 → "12"
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Get the ISO week label for the current date.
 * Convenience wrapper used as the default period in leaderboard screens.
 */
export function getCurrentISOWeekLabel(): string {
  return getISOWeekLabel(new Date());
}

/**
 * Get the ISO week label for the previous week.
 * Used for the "Last Week" chip in the leaderboard UI.
 */
export function getPreviousISOWeekLabel(): string {
  const now = new Date();
  // Subtract 7 days to land in the previous ISO week.
  const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  return getISOWeekLabel(lastWeek);
}
