/**
 * ISO Week Label Tests — utils/isoWeek.ts
 *
 * Tests the pure date math helpers that produce ISO week strings
 * like "2026-W07". These labels are used as the `period` parameter
 * for leaderboard queries — each leaderboard resets weekly.
 *
 * ISO 8601 week rules:
 *   - Weeks start on Monday
 *   - Week 01 is the week containing the first Thursday of the year
 *   - This means Jan 1 can fall in week 52 or 53 of the previous year
 *
 * We test:
 *   1. Correct YYYY-WXX format
 *   2. Year boundary handling (Jan 1 in previous ISO year)
 *   3. Previous week is one less than current
 *   4. Week numbers are zero-padded (W01 not W1)
 */

import {
  getISOWeekLabel,
  getCurrentISOWeekLabel,
  getPreviousISOWeekLabel,
} from "../isoWeek";

describe("isoWeek", () => {
  // ── getISOWeekLabel ─────────────────────────────────────────────

  it("returns correct YYYY-WXX format", () => {
    // Feb 11, 2026 is a Wednesday in ISO week 7.
    // Expected: "2026-W07"
    const date = new Date(2026, 1, 11); // month is 0-indexed
    expect(getISOWeekLabel(date)).toBe("2026-W07");
  });

  it("handles year boundary where Jan 1 belongs to previous ISO year", () => {
    // Jan 1, 2027 is a Friday. Under ISO 8601, that Friday belongs to
    // the last week of 2026 (week 53), because the week containing the
    // first Thursday of 2027 doesn't start until Jan 4.
    const date = new Date(2027, 0, 1); // Friday Jan 1 2027
    expect(getISOWeekLabel(date)).toBe("2026-W53");
  });

  it("zero-pads week numbers (W01 not W1)", () => {
    // Jan 5, 2026 is a Monday — the start of ISO week 2.
    // Wait, let me pick a date in week 1 instead.
    // Jan 1, 2026 is a Thursday → that's ISO week 1 of 2026.
    const date = new Date(2026, 0, 1); // Thursday Jan 1 2026
    expect(getISOWeekLabel(date)).toBe("2026-W01");
  });

  // ── getCurrentISOWeekLabel / getPreviousISOWeekLabel ────────────

  it("getPreviousISOWeekLabel returns one week before getCurrentISOWeekLabel", () => {
    // Use a fixed system time to make this deterministic.
    // Feb 11, 2026 (Wed) → current = "2026-W07", previous = "2026-W06".
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 11));

    expect(getCurrentISOWeekLabel()).toBe("2026-W07");
    expect(getPreviousISOWeekLabel()).toBe("2026-W06");

    jest.useRealTimers();
  });
});
