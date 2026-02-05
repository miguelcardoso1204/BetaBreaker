/**
 * Streak Calculation — Test Suite
 *
 * Tests for the weekly streak computation utility that tracks how consistently
 * a climber has been visiting the gym week over week.
 *
 * Why streaks?
 * Streaks are a core gamification mechanic (FR-F2). They motivate regular
 * attendance by showing climbers their "consistency score" — how many
 * consecutive weeks they've logged at least one climbing session.
 *
 * Key concepts tested here:
 *   - ISO weeks: The streak is based on ISO 8601 weeks (Mon–Sun), not
 *     calendar weeks. This means climbing on Sunday and Monday counts as
 *     two different weeks, even if they're one day apart.
 *   - Recovery mechanic: Missing ONE full week doesn't break a streak — it
 *     "freezes" it. Missing TWO or more full weeks breaks it entirely.
 *     This forgiveness keeps users engaged through occasional off-weeks.
 *   - Deduplication: Multiple sessions in the same ISO week count as one
 *     period. Climbing 5x in a week doesn't boost your streak faster.
 *
 * All tests use a fixed referenceDate to avoid flaky time-dependent tests.
 * referenceDate: Thu Feb 5, 2026 (ISO week 6, Mon Feb 2 – Sun Feb 8).
 *
 * Reference week calendar:
 *   Week 6: Mon Feb 2 – Sun Feb 8  (current / reference week)
 *   Week 5: Mon Jan 26 – Sun Feb 1
 *   Week 4: Mon Jan 19 – Sun Jan 25
 *   Week 3: Mon Jan 12 – Sun Jan 18
 *   Week 2: Mon Jan 5 – Sun Jan 11
 *   Week 1: Mon Dec 29 – Sun Jan 4  (spans year boundary!)
 *
 * TDD approach: These tests are written FIRST (Red phase). All should fail
 * until we implement utils/streaks.ts (Green phase).
 */

import {
  computeWeeklyStreak,
  groupByWeek,
} from '../streaks';
import type { StreakOptions } from '../streaks';

/**
 * Fixed reference date for all tests: Thursday, February 5, 2026.
 * Using `new Date(year, monthIndex, day)` — note monthIndex is 0-based,
 * so 1 = February. This creates the date in local time, which avoids
 * UTC parsing issues that plague `new Date('2026-02-05')`.
 */
const REF_DATE = new Date(2026, 1, 5); // Thu Feb 5, 2026 — ISO week 6

/** Shared options object with the fixed reference date */
const opts: StreakOptions = { referenceDate: REF_DATE };

/* ── Empty / trivial inputs ───────────────────────────────────────────── */

describe('computeWeeklyStreak', () => {
  describe('empty / trivial inputs', () => {
    /**
     * No sessions at all → no streak to compute.
     * This is the base case: a brand new user who hasn't climbed yet.
     */
    it('returns zero streak with status "none" for empty array', () => {
      const result = computeWeeklyStreak([]);
      expect(result).toEqual({
        current: 0,
        longest: 0,
        status: 'none',
      });
    });

    /**
     * Same as above but with an explicit referenceDate.
     * Verifies the options parameter doesn't break the empty-input path.
     */
    it('returns zero streak with status "none" for empty array with referenceDate', () => {
      const result = computeWeeklyStreak([], opts);
      expect(result).toEqual({
        current: 0,
        longest: 0,
        status: 'none',
      });
    });
  });

  /* ── Single session ───────────────────────────────────────────────── */

  describe('single session', () => {
    /**
     * One session in the CURRENT week → streak of 1, status "active".
     * Feb 3 is Monday of week 6 (the reference week), so gapToNow = 0.
     */
    it('session in current week → active streak of 1', () => {
      const result = computeWeeklyStreak(
        [new Date(2026, 1, 3)], // Tue Feb 3, week 6
        opts,
      );
      expect(result).toEqual({
        current: 1,
        longest: 1,
        status: 'active',
      });
    });

    /**
     * One session LAST week (week 5) → streak of 1, status "at_risk".
     * Gap from week 5 to reference week 6 = 1 → user hasn't climbed this
     * week yet but their streak isn't broken.
     */
    it('session last week → at_risk streak of 1', () => {
      const result = computeWeeklyStreak(
        [new Date(2026, 0, 27)], // Tue Jan 27, week 5
        opts,
      );
      expect(result).toEqual({
        current: 1,
        longest: 1,
        status: 'at_risk',
      });
    });

    /**
     * One session two weeks ago (week 4) → gap of 2 from W4 to W6.
     * The recovery mechanic freezes the streak at 1 instead of breaking it.
     * Status is "at_risk" because the streak is frozen, not lost.
     */
    it('session 2 weeks ago → at_risk streak of 1, frozen', () => {
      const result = computeWeeklyStreak(
        [new Date(2026, 0, 19)], // Mon Jan 19, week 4
        opts,
      );
      expect(result).toEqual({
        current: 1,
        longest: 1,
        status: 'at_risk',
        decayedFrom: 1,
      });
    });
  });

  /* ── Consecutive weeks ────────────────────────────────────────────── */

  describe('consecutive weeks', () => {
    /**
     * Three consecutive weeks ending in the current week → streak of 3.
     * Weeks 4, 5, 6 with sessions → each gap is exactly 1 (consecutive).
     */
    it('3 consecutive weeks ending in current week → active streak of 3', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2026, 0, 19), // Mon Jan 19, week 4
          new Date(2026, 0, 26), // Mon Jan 26, week 5
          new Date(2026, 1, 2),  // Mon Feb 2, week 6
        ],
        opts,
      );
      expect(result).toEqual({
        current: 3,
        longest: 3,
        status: 'active',
      });
    });

    /**
     * Five consecutive weeks ending in current week → streak of 5.
     * Covers weeks 2 through 6 (Jan 5 → Feb 2).
     */
    it('5 consecutive weeks ending in current week → active streak of 5', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2026, 0, 5),  // Mon Jan 5, week 2
          new Date(2026, 0, 12), // Mon Jan 12, week 3
          new Date(2026, 0, 19), // Mon Jan 19, week 4
          new Date(2026, 0, 26), // Mon Jan 26, week 5
          new Date(2026, 1, 2),  // Mon Feb 2, week 6
        ],
        opts,
      );
      expect(result).toEqual({
        current: 5,
        longest: 5,
        status: 'active',
      });
    });
  });

  /* ── Gap handling ─────────────────────────────────────────────────── */

  describe('gap handling', () => {
    /**
     * Gap of 3+ weeks between sessions → streak breaks entirely.
     * Session in week 2, then nothing in weeks 3 and 4, then session in
     * week 5 (gap = 3 from W2 to W5). Old streak is gone, new streak of 1
     * starts at week 5, then week 6 makes it 2.
     */
    it('gap of 3+ weeks breaks the streak, new streak starts', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2026, 0, 5),  // Mon Jan 5, week 2
          new Date(2026, 0, 26), // Mon Jan 26, week 5 — gap of 3 from W2
          new Date(2026, 1, 2),  // Mon Feb 2, week 6
        ],
        opts,
      );
      expect(result.current).toBe(2);   // W5 + W6
      expect(result.longest).toBe(2);   // longest is also 2
      expect(result.status).toBe('active');
    });

    /**
     * Gap of 2 weeks (1 missed period) between sessions → streak freezes.
     * Sessions: W1, W2, W3 then skip W4, session W5, session W6.
     * Gap from W3 to W5 = 2 → freeze, streak continues growing.
     * W1→W2 (gap=1, run=2) → W2→W3 (gap=1, run=3) → W3→W5 (gap=2, freeze, run=4) → W5→W6 (gap=1, run=5)
     * Final: streak of 5, active.
     */
    it('gap of 2 weeks freezes streak, continues growing after', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2025, 11, 29), // Mon Dec 29, week 1
          new Date(2026, 0, 5),   // Mon Jan 5, week 2
          new Date(2026, 0, 12),  // Mon Jan 12, week 3
          // (skip week 4)
          new Date(2026, 0, 26),  // Mon Jan 26, week 5
          new Date(2026, 1, 2),   // Mon Feb 2, week 6
        ],
        opts,
      );
      expect(result.current).toBe(5);
      expect(result.longest).toBe(5);
      expect(result.status).toBe('active');
      expect(result.decayedFrom).toBe(3); // frozen at 3 during walk
    });

    /**
     * Gap of 2 to the reference week, no session in current week.
     * Sessions: W2, W3, W4 (streak of 3). Gap from W4 to W6 = 2 → frozen.
     * Status "at_risk" with current = 3 (frozen, not reduced).
     */
    it('gap of 2 to now → at_risk with frozen streak', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2026, 0, 5),  // Mon Jan 5, week 2
          new Date(2026, 0, 12), // Mon Jan 12, week 3
          new Date(2026, 0, 19), // Mon Jan 19, week 4
        ],
        opts,
      );
      expect(result.current).toBe(3);
      expect(result.status).toBe('at_risk');
      expect(result.decayedFrom).toBe(3);
    });
  });

  /* ── Recovery mechanic ────────────────────────────────────────────── */

  describe('recovery mechanic', () => {
    /**
     * 5-week streak, miss 1 week, return → streak continues: 5 + 1 = 6.
     * Sessions: W1–W5 (5-week streak), skip W6 (no session), then W7
     * would be gap=2 from W5 → freeze, continue.
     *
     * But our reference is W6. So let's use a different setup:
     * W1, W2, W3, W4, W5 (streak of 5), skip W5, come back W6?
     * That's W1-W4 + W6. Gap from W4 to W6 = 2 → freeze.
     * Streak: 4 + 1 (freeze) = 5. To get 5→6, we need:
     * W1, W2, W3, W4, W5 then skip... but W5→W7 is gap=2 which needs W7.
     *
     * Let's adjust: sessions in weeks 1-5, gap W5→W7 would need ref W7+.
     * Instead: sessions W1–W5 (= 5 weeks), then skip a week, session in
     * W7. Use referenceDate in week 7 (Feb 9, Mon).
     */
    it('5-week streak, miss 1 week, return → streak continues as 6', () => {
      const refW7 = new Date(2026, 1, 12); // Thu Feb 12, week 7
      const result = computeWeeklyStreak(
        [
          new Date(2025, 11, 29), // Mon Dec 29, week 1
          new Date(2026, 0, 5),   // Mon Jan 5, week 2
          new Date(2026, 0, 12),  // Mon Jan 12, week 3
          new Date(2026, 0, 19),  // Mon Jan 19, week 4
          new Date(2026, 0, 26),  // Mon Jan 26, week 5
          // skip week 6
          new Date(2026, 1, 9),   // Mon Feb 9, week 7
        ],
        { referenceDate: refW7 },
      );
      expect(result.current).toBe(6);
      expect(result.status).toBe('active');
      expect(result.decayedFrom).toBe(5); // frozen at 5 during the gap
    });

    /**
     * Streak of 1, gap=2 to now → frozen at 1, at_risk.
     * Single session in week 4, reference is week 6. Gap = 2.
     */
    it('streak of 1, gap=2 to now → at_risk, current stays 1', () => {
      const result = computeWeeklyStreak(
        [new Date(2026, 0, 19)], // Mon Jan 19, week 4
        opts,
      );
      expect(result).toEqual({
        current: 1,
        longest: 1,
        status: 'at_risk',
        decayedFrom: 1,
      });
    });

    /**
     * Gap of 3+ → no recovery, streak broken entirely.
     * Session in week 2, reference is week 6. Gap = 4 → broken.
     */
    it('gap of 3+ → broken, no recovery', () => {
      const result = computeWeeklyStreak(
        [new Date(2026, 0, 5)], // Mon Jan 5, week 2
        opts,
      );
      expect(result).toEqual({
        current: 0,
        longest: 1,
        status: 'broken',
      });
    });
  });

  /* ── Deduplication ────────────────────────────────────────────────── */

  describe('deduplication', () => {
    /**
     * Multiple sessions on the SAME DAY → only one period counted.
     * Climbing morning and evening on Feb 3 shouldn't double-count.
     */
    it('multiple sessions same day count as one period', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2026, 1, 3),  // Feb 3 morning
          new Date(2026, 1, 3),  // Feb 3 evening (same day)
        ],
        opts,
      );
      expect(result).toEqual({
        current: 1,
        longest: 1,
        status: 'active',
      });
    });

    /**
     * Multiple sessions in the same ISO week (Mon, Wed, Fri) → one period.
     * A climber who goes 3x/week doesn't get a streak of 3 per week.
     */
    it('multiple sessions same week count as one period', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2026, 1, 2),  // Mon Feb 2, week 6
          new Date(2026, 1, 4),  // Wed Feb 4, week 6
          new Date(2026, 1, 6),  // Fri Feb 6, week 6
        ],
        opts,
      );
      expect(result).toEqual({
        current: 1,
        longest: 1,
        status: 'active',
      });
    });
  });

  /* ── Edge cases ───────────────────────────────────────────────────── */

  describe('edge cases', () => {
    /**
     * Midnight boundary: Sunday 23:59 and Monday 00:00 are different ISO weeks.
     * ISO weeks start on Monday, so Sunday is the LAST day of one week
     * and Monday is the FIRST day of the next. Even though these dates are
     * only 1 minute apart, they should count as two separate weeks.
     *
     * Sun Feb 1 = last day of week 5; Mon Feb 2 = first day of week 6.
     */
    it('Sunday 23:59 and Monday 00:00 are different ISO weeks', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2026, 1, 1, 23, 59), // Sun Feb 1 23:59, week 5
          new Date(2026, 1, 2, 0, 0),   // Mon Feb 2 00:00, week 6
        ],
        opts,
      );
      expect(result).toEqual({
        current: 2,
        longest: 2,
        status: 'active',
      });
    });

    /**
     * Year boundary: streak spans from December 2025 into January 2026.
     * ISO week 1 of 2026 starts Mon Dec 29, 2025. This tests that our
     * week calculation handles the year transition correctly — a common
     * source of bugs in date arithmetic.
     */
    it('year boundary: Dec 2025 → Jan 2026 streak spans correctly', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2025, 11, 29), // Mon Dec 29, 2025 — ISO week 1 of 2026
          new Date(2026, 0, 5),   // Mon Jan 5, 2026 — ISO week 2
          new Date(2026, 0, 12),  // Mon Jan 12, 2026 — ISO week 3
          new Date(2026, 0, 19),  // Mon Jan 19, 2026 — ISO week 4
          new Date(2026, 0, 26),  // Mon Jan 26, 2026 — ISO week 5
          new Date(2026, 1, 2),   // Mon Feb 2, 2026 — ISO week 6
        ],
        opts,
      );
      expect(result).toEqual({
        current: 6,
        longest: 6,
        status: 'active',
      });
    });

    /**
     * Longest exceeds current: an old longer streak was broken, then a
     * shorter current streak started. The "longest" field should remember
     * the historical best, not just the current run.
     *
     * W1, W2, W3 (streak of 3) → gap of 3+ → W6 (new streak of 1).
     * Longest = 3, current = 1.
     */
    it('longest exceeds current when old streak was longer', () => {
      const result = computeWeeklyStreak(
        [
          new Date(2025, 11, 29), // Mon Dec 29, week 1
          new Date(2026, 0, 5),   // Mon Jan 5, week 2
          new Date(2026, 0, 12),  // Mon Jan 12, week 3
          // gap of 3 weeks (skip W4, W5) → broken at W6
          new Date(2026, 1, 2),   // Mon Feb 2, week 6
        ],
        opts,
      );
      expect(result.current).toBe(1);
      expect(result.longest).toBe(3);
      expect(result.status).toBe('active');
    });

    /**
     * Unsorted input: dates passed in random order should produce the
     * same result as sorted input. The implementation must sort internally.
     */
    it('unsorted input produces same result as sorted', () => {
      const sorted = computeWeeklyStreak(
        [
          new Date(2026, 0, 5),  // week 2
          new Date(2026, 0, 12), // week 3
          new Date(2026, 0, 19), // week 4
          new Date(2026, 0, 26), // week 5
          new Date(2026, 1, 2),  // week 6
        ],
        opts,
      );

      const unsorted = computeWeeklyStreak(
        [
          new Date(2026, 0, 19), // week 4 (out of order)
          new Date(2026, 1, 2),  // week 6
          new Date(2026, 0, 5),  // week 2
          new Date(2026, 0, 26), // week 5
          new Date(2026, 0, 12), // week 3
        ],
        opts,
      );

      expect(unsorted).toEqual(sorted);
    });
  });
});

/* ── groupByWeek ──────────────────────────────────────────────────────── */

describe('groupByWeek', () => {
  /**
   * groupByWeek should return ISO week Monday-start dates.
   * Given dates on different days of the same week, they should all
   * collapse to the Monday of that week.
   */
  it('groups dates into ISO week Monday starts', () => {
    const result = groupByWeek([
      new Date(2026, 1, 4), // Wed Feb 4 → Mon Feb 2
      new Date(2026, 0, 7), // Wed Jan 7 → Mon Jan 5
    ]);
    // Should return Monday starts, sorted ascending
    expect(result).toEqual([
      new Date(2026, 0, 5),  // Mon Jan 5
      new Date(2026, 1, 2),  // Mon Feb 2
    ]);
  });

  /**
   * Dates in the same ISO week should deduplicate to a single Monday start.
   */
  it('deduplicates dates in the same week', () => {
    const result = groupByWeek([
      new Date(2026, 1, 2), // Mon Feb 2, week 6
      new Date(2026, 1, 4), // Wed Feb 4, week 6
      new Date(2026, 1, 6), // Fri Feb 6, week 6
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(new Date(2026, 1, 2)); // Mon Feb 2
  });

  /**
   * Output should be sorted ascending regardless of input order.
   */
  it('returns sorted ascending output', () => {
    const result = groupByWeek([
      new Date(2026, 1, 4), // week 6 (later)
      new Date(2026, 0, 7), // week 2 (earlier)
      new Date(2026, 0, 14), // week 3
    ]);
    // Verify ascending order: week 2 < week 3 < week 6
    for (let i = 1; i < result.length; i++) {
      expect(result[i].getTime()).toBeGreaterThan(result[i - 1].getTime());
    }
    expect(result).toHaveLength(3);
  });
});
