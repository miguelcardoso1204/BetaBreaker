/**
 * Leaderboard Scoring Logic — Test Suite
 *
 * Tests for the scoring utilities that power gym leaderboards. Three scoring
 * models are supported:
 *
 *   - hardest_grade  — Highest successfully climbed grade (max of sends + flashes)
 *   - flash_rate     — Ratio of flashes to total successful ascents (0.0–1.0)
 *   - volume         — Total number of successful ascents (sends + flashes)
 *
 * Key design decisions tested here:
 *   - Ascent status uses a three-way enum ('flash' | 'send' | 'attempt').
 *     Only flashes and sends count as "successful" — attempts are filtered out.
 *   - Flash rate is a decimal (0.0–1.0), not a percentage. UI formats it.
 *   - Ranking uses the "1224" standard competition system: tied entries share
 *     a rank, and the next rank after a tie skips positions. Two users tied
 *     for 1st → next user is 3rd (not 2nd).
 *   - Tiebreaker is an optional numeric field on LeaderboardEntry. Lower
 *     tiebreaker = better (e.g., earlier timestamp wins).
 *   - filterByPeriod is inclusive on both boundaries (start <= loggedAt <= end).
 *
 * All date constructors use `new Date(year, monthIndex, day)` to avoid UTC
 * parsing issues. monthIndex is 0-based (0 = January, 1 = February).
 *
 * TDD approach: These tests are written FIRST (Red phase). All should fail
 * until we implement utils/scoring.ts (Green phase).
 */

import {
  computeScore,
  rankLeaderboard,
  filterByPeriod,
  getSuccessfulAscents,
} from '../scoring';
import type { Ascent, LeaderboardEntry } from '../scoring';

/* ── computeScore ────────────────────────────────────────────────────── */

describe('computeScore', () => {
  /* ── hardest_grade model ──────────────────────────────────────────── */

  describe('hardest_grade model', () => {
    /**
     * Mixed ascents: the function should return the highest grade among
     * all SUCCESSFUL ascents (flashes + sends), ignoring the type distinction
     * between flash and send. Grade is an opaque integer — higher = harder.
     */
    it('returns the highest grade among successful ascents', () => {
      const ascents: Ascent[] = [
        { grade: 10, status: 'send', loggedAt: new Date(2026, 0, 15) },  // V4
        { grade: 15, status: 'flash', loggedAt: new Date(2026, 0, 16) }, // V6
        { grade: 10, status: 'send', loggedAt: new Date(2026, 0, 17) },  // V4
      ];
      expect(computeScore(ascents, 'hardest_grade')).toBe(15);
    });

    /**
     * Attempts should be completely ignored. Even if the hardest grade is
     * an attempt, it doesn't count — only the hardest SENT grade matters.
     * Here V8 (grade 20) is only an attempt, so the score should be V4 (10).
     */
    it('ignores attempts — only counts flashes and sends', () => {
      const ascents: Ascent[] = [
        { grade: 10, status: 'send', loggedAt: new Date(2026, 0, 15) },    // V4 send ✓
        { grade: 20, status: 'attempt', loggedAt: new Date(2026, 0, 16) }, // V8 attempt ✗
      ];
      expect(computeScore(ascents, 'hardest_grade')).toBe(10);
    });

    /**
     * Empty input → score of 0. No ascents means nothing to score.
     */
    it('returns 0 for empty ascent array', () => {
      expect(computeScore([], 'hardest_grade')).toBe(0);
    });

    /**
     * All attempts, no successful ascents → 0. Even though there are
     * ascent records, none were completed successfully.
     */
    it('returns 0 when all ascents are attempts', () => {
      const ascents: Ascent[] = [
        { grade: 15, status: 'attempt', loggedAt: new Date(2026, 0, 15) },
        { grade: 20, status: 'attempt', loggedAt: new Date(2026, 0, 16) },
      ];
      expect(computeScore(ascents, 'hardest_grade')).toBe(0);
    });
  });

  /* ── flash_rate model ─────────────────────────────────────────────── */

  describe('flash_rate model', () => {
    /**
     * Flash rate = flashes / (flashes + sends). Attempts are excluded
     * entirely from both numerator and denominator.
     * Here: 2 flashes, 1 send, 1 attempt → 2 / (2 + 1) ≈ 0.667
     *
     * We use toBeCloseTo for floating-point comparison (avoids flaky
     * failures from IEEE 754 rounding, e.g., 0.6666666666666666 vs 0.667).
     */
    it('computes flash rate excluding attempts', () => {
      const ascents: Ascent[] = [
        { grade: 10, status: 'flash', loggedAt: new Date(2026, 0, 15) },
        { grade: 8, status: 'flash', loggedAt: new Date(2026, 0, 16) },
        { grade: 12, status: 'send', loggedAt: new Date(2026, 0, 17) },
        { grade: 15, status: 'attempt', loggedAt: new Date(2026, 0, 18) }, // ignored
      ];
      // 2 flashes / 3 successful = 0.6667
      expect(computeScore(ascents, 'flash_rate')).toBeCloseTo(0.667, 2);
    });

    /**
     * All successful ascents are flashes → flash rate = 1.0 (100%).
     * This is the "perfect flash" scenario.
     */
    it('returns 1.0 when all successful ascents are flashes', () => {
      const ascents: Ascent[] = [
        { grade: 10, status: 'flash', loggedAt: new Date(2026, 0, 15) },
        { grade: 12, status: 'flash', loggedAt: new Date(2026, 0, 16) },
      ];
      expect(computeScore(ascents, 'flash_rate')).toBe(1.0);
    });

    /**
     * No flashes at all (all sends) → flash rate = 0.0.
     * The climber successfully completed routes but none on the first try.
     */
    it('returns 0.0 when no flashes exist (all sends)', () => {
      const ascents: Ascent[] = [
        { grade: 10, status: 'send', loggedAt: new Date(2026, 0, 15) },
        { grade: 12, status: 'send', loggedAt: new Date(2026, 0, 16) },
      ];
      expect(computeScore(ascents, 'flash_rate')).toBe(0.0);
    });

    /**
     * Empty input → 0. No ascents, no flash rate to compute.
     */
    it('returns 0 for empty ascent array', () => {
      expect(computeScore([], 'flash_rate')).toBe(0);
    });
  });

  /* ── volume model ─────────────────────────────────────────────────── */

  describe('volume model', () => {
    /**
     * Volume = total count of successful ascents (flashes + sends).
     * Attempts don't count — they represent failed climbs.
     * Here: 1 flash + 2 sends + 1 attempt = 3 successful.
     */
    it('counts successful ascents (flashes + sends), ignores attempts', () => {
      const ascents: Ascent[] = [
        { grade: 10, status: 'flash', loggedAt: new Date(2026, 0, 15) },
        { grade: 8, status: 'send', loggedAt: new Date(2026, 0, 16) },
        { grade: 12, status: 'send', loggedAt: new Date(2026, 0, 17) },
        { grade: 15, status: 'attempt', loggedAt: new Date(2026, 0, 18) }, // ignored
      ];
      expect(computeScore(ascents, 'volume')).toBe(3);
    });

    /**
     * Attempts are excluded from the count.
     * 1 send + 2 attempts → volume of 1.
     */
    it('ignores attempts — 1 send + 2 attempts = volume 1', () => {
      const ascents: Ascent[] = [
        { grade: 10, status: 'send', loggedAt: new Date(2026, 0, 15) },
        { grade: 12, status: 'attempt', loggedAt: new Date(2026, 0, 16) },
        { grade: 15, status: 'attempt', loggedAt: new Date(2026, 0, 17) },
      ];
      expect(computeScore(ascents, 'volume')).toBe(1);
    });

    /**
     * Empty input → volume of 0.
     */
    it('returns 0 for empty ascent array', () => {
      expect(computeScore([], 'volume')).toBe(0);
    });
  });
});

/* ── filterByPeriod ──────────────────────────────────────────────────── */

describe('filterByPeriod', () => {
  /**
   * January 2026 period: all three ascents fall within → all returned.
   * Using inclusive boundaries: Jan 1 00:00:00 through Jan 31 23:59:59.
   */
  it('returns all ascents within the date range', () => {
    const start = new Date(2026, 0, 1);   // Jan 1
    const end = new Date(2026, 0, 31, 23, 59, 59); // Jan 31 end of day
    const ascents: Ascent[] = [
      { grade: 10, status: 'send', loggedAt: new Date(2026, 0, 5) },
      { grade: 12, status: 'flash', loggedAt: new Date(2026, 0, 15) },
      { grade: 8, status: 'send', loggedAt: new Date(2026, 0, 25) },
    ];
    const result = filterByPeriod(ascents, start, end);
    expect(result).toHaveLength(3);
  });

  /**
   * Ascent before the start date should be excluded.
   * Dec 31, 2025 is before the Jan 1–31 range.
   */
  it('excludes ascents before the start date', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 31, 23, 59, 59);
    const ascents: Ascent[] = [
      { grade: 10, status: 'send', loggedAt: new Date(2025, 11, 31) },  // Dec 31 — excluded
      { grade: 12, status: 'flash', loggedAt: new Date(2026, 0, 15) },  // Jan 15 — included
    ];
    const result = filterByPeriod(ascents, start, end);
    expect(result).toHaveLength(1);
    expect(result[0].grade).toBe(12);
  });

  /**
   * Ascent after the end date should be excluded.
   * Feb 1 is after the Jan 1–31 range.
   */
  it('excludes ascents after the end date', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 31, 23, 59, 59);
    const ascents: Ascent[] = [
      { grade: 10, status: 'send', loggedAt: new Date(2026, 0, 20) },  // Jan 20 — included
      { grade: 15, status: 'flash', loggedAt: new Date(2026, 1, 1) },  // Feb 1 — excluded
    ];
    const result = filterByPeriod(ascents, start, end);
    expect(result).toHaveLength(1);
    expect(result[0].grade).toBe(10);
  });

  /**
   * No ascents fall within the range → empty array returned.
   */
  it('returns empty array when no ascents are in range', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 31, 23, 59, 59);
    const ascents: Ascent[] = [
      { grade: 10, status: 'send', loggedAt: new Date(2025, 11, 15) }, // Dec 2025
      { grade: 12, status: 'flash', loggedAt: new Date(2026, 1, 5) },  // Feb 2026
    ];
    const result = filterByPeriod(ascents, start, end);
    expect(result).toHaveLength(0);
  });
});

/* ── rankLeaderboard ─────────────────────────────────────────────────── */

describe('rankLeaderboard', () => {
  /**
   * Single entry → rank 1. The simplest possible leaderboard.
   */
  it('assigns rank 1 to a single entry', () => {
    const entries: LeaderboardEntry[] = [
      { userId: 'user-a', score: 15 },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toEqual({ userId: 'user-a', score: 15, rank: 1 });
  });

  /**
   * Three entries with distinct scores → sorted descending, ranks 1, 2, 3.
   * Score 20 > 15 > 10. The input order shouldn't matter.
   */
  it('sorts by score descending and assigns sequential ranks', () => {
    const entries: LeaderboardEntry[] = [
      { userId: 'user-a', score: 15 },
      { userId: 'user-b', score: 10 },
      { userId: 'user-c', score: 20 },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked).toEqual([
      { userId: 'user-c', score: 20, rank: 1 },
      { userId: 'user-a', score: 15, rank: 2 },
      { userId: 'user-b', score: 10, rank: 3 },
    ]);
  });

  /**
   * Standard competition ranking (1224 system): two users tied for 1st
   * → both get rank 1, next user gets rank 3 (not 2). This is the
   * Olympic/competition standard used in climbing comps.
   */
  it('ties share rank and next rank skips (1224 system)', () => {
    const entries: LeaderboardEntry[] = [
      { userId: 'user-a', score: 20 },
      { userId: 'user-b', score: 20 },
      { userId: 'user-c', score: 15 },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3); // Skips rank 2
  });

  /**
   * Tiebreaker: when two entries have the same score, the one with the
   * lower tiebreaker value wins (e.g., earlier timestamp = lower number).
   * User-b has tiebreaker 1000 (earlier), user-a has 2000 (later).
   * User-b should get rank 1, user-a rank 2.
   */
  it('uses tiebreaker to break ties (lower tiebreaker = better rank)', () => {
    const entries: LeaderboardEntry[] = [
      { userId: 'user-a', score: 20, tiebreaker: 2000 },
      { userId: 'user-b', score: 20, tiebreaker: 1000 },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked[0]).toEqual({ userId: 'user-b', score: 20, tiebreaker: 1000, rank: 1 });
    expect(ranked[1]).toEqual({ userId: 'user-a', score: 20, tiebreaker: 2000, rank: 2 });
  });

  /**
   * Empty input → empty output. No entries, no ranks to assign.
   */
  it('returns empty array for empty input', () => {
    expect(rankLeaderboard([])).toEqual([]);
  });
});

/* ── getSuccessfulAscents (internal helper) ──────────────────────────── */

describe('getSuccessfulAscents', () => {
  /**
   * @internal helper — exported for testability.
   * Filters to only flash + send, excluding attempts.
   */
  it('filters out attempts, keeps flashes and sends', () => {
    const ascents: Ascent[] = [
      { grade: 10, status: 'flash', loggedAt: new Date(2026, 0, 15) },
      { grade: 12, status: 'send', loggedAt: new Date(2026, 0, 16) },
      { grade: 15, status: 'attempt', loggedAt: new Date(2026, 0, 17) },
    ];
    const result = getSuccessfulAscents(ascents);
    expect(result).toHaveLength(2);
    expect(result.every(a => a.status !== 'attempt')).toBe(true);
  });
});

/* ── Integration: full leaderboard pipeline ──────────────────────────── */

describe('integration: full leaderboard pipeline', () => {
  /**
   * End-to-end test exercising the full scoring flow:
   * 1. Three users with ascents across Jan–Feb 2026
   * 2. Filter to January only (filterByPeriod)
   * 3. Compute hardest_grade scores for each user
   * 4. User1 and User2 both score 15 (grade V6), but User2 climbed
   *    grade 15 earlier (Jan 10 vs Jan 20) → User2 wins the tiebreak
   * 5. User3 scores 13 → rank 3
   *
   * This exercises: filterByPeriod → computeScore → tiebreaker assembly
   * → rankLeaderboard — the complete pipeline a real leaderboard would use.
   */
  it('filters, scores, and ranks 3 users with tiebreaker on hardest_grade', () => {
    const jan1 = new Date(2026, 0, 1);
    const jan31 = new Date(2026, 0, 31, 23, 59, 59);

    // User1: hardest grade in January is 15 (V6), climbed on Jan 20
    const user1Ascents: Ascent[] = [
      { grade: 10, status: 'send', loggedAt: new Date(2026, 0, 5) },
      { grade: 15, status: 'flash', loggedAt: new Date(2026, 0, 20) },
      { grade: 20, status: 'send', loggedAt: new Date(2026, 1, 5) },  // Feb — excluded
    ];

    // User2: hardest grade in January is 15 (V6), climbed on Jan 10 (earlier!)
    const user2Ascents: Ascent[] = [
      { grade: 15, status: 'send', loggedAt: new Date(2026, 0, 10) },
      { grade: 8, status: 'attempt', loggedAt: new Date(2026, 0, 12) }, // attempt — ignored
    ];

    // User3: hardest grade in January is 13 (V5)
    const user3Ascents: Ascent[] = [
      { grade: 13, status: 'send', loggedAt: new Date(2026, 0, 8) },
      { grade: 10, status: 'flash', loggedAt: new Date(2026, 0, 18) },
    ];

    // Step 1: Filter each user's ascents to January
    const u1Jan = filterByPeriod(user1Ascents, jan1, jan31);
    const u2Jan = filterByPeriod(user2Ascents, jan1, jan31);
    const u3Jan = filterByPeriod(user3Ascents, jan1, jan31);

    // Step 2: Compute scores
    const u1Score = computeScore(u1Jan, 'hardest_grade');
    const u2Score = computeScore(u2Jan, 'hardest_grade');
    const u3Score = computeScore(u3Jan, 'hardest_grade');

    expect(u1Score).toBe(15);
    expect(u2Score).toBe(15);
    expect(u3Score).toBe(13);

    // Step 3: Build leaderboard entries with tiebreakers.
    // For hardest_grade, tiebreaker is the timestamp of the earliest ascent
    // at the top grade. Lower timestamp = climbed it earlier = wins.
    const entries: LeaderboardEntry[] = [
      { userId: 'user-1', score: u1Score, tiebreaker: new Date(2026, 0, 20).getTime() },
      { userId: 'user-2', score: u2Score, tiebreaker: new Date(2026, 0, 10).getTime() },
      { userId: 'user-3', score: u3Score },
    ];

    // Step 4: Rank the leaderboard
    const ranked = rankLeaderboard(entries);

    // User2 wins tiebreak (earlier climb at grade 15) → rank 1
    // User1 loses tiebreak → rank 2
    // User3 has lower score → rank 3
    expect(ranked[0].userId).toBe('user-2');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].userId).toBe('user-1');
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].userId).toBe('user-3');
    expect(ranked[2].rank).toBe(3);
  });
});
