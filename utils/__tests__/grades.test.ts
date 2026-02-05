/**
 * Grade Conversion System — Test Suite
 *
 * Tests for the grade conversion utility that maps between the app's internal
 * "canonical" grade integers (0–30) and human-readable grade strings in three
 * widely-used climbing grade systems:
 *
 *   - V-scale   — Used in North American bouldering (V0, V1, ... V12)
 *   - Font      — Used in European bouldering (4a, 4b, ... 9a)
 *   - YDS       — Yosemite Decimal System for route climbing (5.5, 5.6, ... 5.15d)
 *
 * Why canonical integers?
 * Different grading systems have different granularities and don't map 1-to-1.
 * By storing a single integer in the database, we can display any system the
 * user prefers without needing conversion at the DB level. The integer also
 * makes sorting and comparison trivial (just use < or >).
 *
 * TDD approach: These tests are written FIRST (Red phase). All should fail
 * until we implement utils/grades.ts (Green phase).
 */

import {
  GRADE_TABLE,
  canonicalToDisplay,
  displayToCanonical,
  compareGrades,
  getGradeRange,
} from '../grades';
import type { GradeSystem } from '../grades';

/* ── GRADE_TABLE structure ─────────────────────────────────────────────── */

describe('GRADE_TABLE', () => {
  /**
   * The canonical scale runs from 0 to 30, giving us 31 entries.
   * This finer granularity than any single system lets us represent
   * in-between grades and future-proof against grade inflation.
   */
  it('has exactly 31 entries (canonical grades 0–30)', () => {
    expect(GRADE_TABLE).toHaveLength(31);
  });

  /**
   * Every entry must have all three grade system strings defined.
   * This guarantees that canonicalToDisplay will never return undefined
   * for a valid canonical value, regardless of which system is requested.
   */
  it('every entry has v, font, and yds string properties', () => {
    GRADE_TABLE.forEach((entry, index) => {
      expect(typeof entry.v).toBe('string');
      expect(typeof entry.font).toBe('string');
      expect(typeof entry.yds).toBe('string');
      // Also verify they're non-empty — an empty string would be a bug
      expect(entry.v.length).toBeGreaterThan(0);
      expect(entry.font.length).toBeGreaterThan(0);
      expect(entry.yds.length).toBeGreaterThan(0);
    });
  });

  /**
   * Anchor points are the known-correct mappings from SystemArchitecture.md.
   * These specific canonical values MUST map to these exact strings, because
   * the rest of the table is interpolated around them. If these are wrong,
   * the entire grade system is miscalibrated.
   */
  it('matches required anchor points at canonical 0, 10, and 20', () => {
    // Canonical 0: easiest grade in each system
    expect(GRADE_TABLE[0]).toEqual({ v: 'V0', font: '4a', yds: '5.5' });
    // Canonical 10: mid-range anchor
    expect(GRADE_TABLE[10]).toEqual({ v: 'V4', font: '6a+', yds: '5.10b' });
    // Canonical 20: upper-intermediate anchor
    expect(GRADE_TABLE[20]).toEqual({ v: 'V8', font: '7b', yds: '5.13b' });
  });
});

/* ── canonicalToDisplay ────────────────────────────────────────────────── */

describe('canonicalToDisplay', () => {
  /**
   * Core conversion test: canonical 10 is one of our anchor points.
   * It should map to exactly V4 / 6a+ / 5.10b across the three systems.
   */
  it('converts canonical 10 to correct display strings', () => {
    expect(canonicalToDisplay(10, 'v-scale')).toBe('V4');
    expect(canonicalToDisplay(10, 'font')).toBe('6a+');
    expect(canonicalToDisplay(10, 'yds')).toBe('5.10b');
  });

  /**
   * Boundary test: canonical 0 is the lowest valid grade.
   * Edge cases at boundaries are where off-by-one bugs hide.
   */
  it('converts canonical 0 (minimum) correctly', () => {
    expect(canonicalToDisplay(0, 'v-scale')).toBe('V0');
    expect(canonicalToDisplay(0, 'font')).toBe('4a');
    expect(canonicalToDisplay(0, 'yds')).toBe('5.5');
  });

  /**
   * Boundary test: canonical 30 is the highest valid grade.
   * Must not throw or return undefined for the max value.
   */
  it('converts canonical 30 (maximum) correctly', () => {
    expect(canonicalToDisplay(30, 'v-scale')).toBe('V12');
    expect(canonicalToDisplay(30, 'font')).toBe('9a');
    expect(canonicalToDisplay(30, 'yds')).toBe('5.15d');
  });

  /**
   * Exhaustive check: every canonical value (0–30) for every system
   * must return a non-empty string. This catches any gaps in GRADE_TABLE.
   */
  it('returns non-empty strings for all 31 canonical values in all systems', () => {
    const systems: GradeSystem[] = ['v-scale', 'font', 'yds'];
    for (let canonical = 0; canonical <= 30; canonical++) {
      for (const system of systems) {
        const result = canonicalToDisplay(canonical, system);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Error handling: canonical values below 0 are invalid.
   * We use RangeError (not generic Error) so callers can catch specifically.
   */
  it('throws RangeError for negative canonical value (-1)', () => {
    expect(() => canonicalToDisplay(-1, 'v-scale')).toThrow(RangeError);
  });

  /**
   * Error handling: canonical values above 30 are invalid.
   * 31 is one past the end of our table.
   */
  it('throws RangeError for canonical value above max (31)', () => {
    expect(() => canonicalToDisplay(31, 'v-scale')).toThrow(RangeError);
  });

  /**
   * Error handling: fractional numbers don't correspond to valid grades.
   * Grades are discrete — 3.5 is not "halfway between V1 and V2".
   * We enforce integers to prevent subtle bugs in grade arithmetic.
   */
  it('throws RangeError for non-integer canonical value (3.5)', () => {
    expect(() => canonicalToDisplay(3.5, 'v-scale')).toThrow(RangeError);
  });

  /**
   * NaN check: NaN could slip through if user input isn't validated.
   * Number.isInteger(NaN) returns false, so this should throw RangeError.
   */
  it('throws RangeError for NaN', () => {
    expect(() => canonicalToDisplay(NaN, 'v-scale')).toThrow(RangeError);
  });
});

/* ── displayToCanonical ────────────────────────────────────────────────── */

describe('displayToCanonical', () => {
  /**
   * Core reverse lookup: "V4" in V-scale should map back to canonical 10.
   * This is the inverse of canonicalToDisplay and powers features like
   * "search by grade" where the user types a grade string.
   */
  it('converts "V4" to canonical 10', () => {
    expect(displayToCanonical('V4', 'v-scale')).toBe(10);
  });

  it('converts "6a+" to canonical 10', () => {
    expect(displayToCanonical('6a+', 'font')).toBe(10);
  });

  it('converts "5.10b" to canonical 10', () => {
    expect(displayToCanonical('5.10b', 'yds')).toBe(10);
  });

  /**
   * Graceful failure: unrecognized grade strings return null instead of
   * throwing. This is intentional — UI code can use null to show
   * "invalid grade" feedback without try/catch boilerplate.
   */
  it('returns null for unrecognized grade string "VX"', () => {
    expect(displayToCanonical('VX', 'v-scale')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(displayToCanonical('', 'v-scale')).toBeNull();
  });
});

/* ── Round-trip consistency ─────────────────────────────────────────────── */

describe('round-trip consistency', () => {
  /**
   * Round-trip test: canonical → display → canonical should return the
   * same value — BUT only for the "first occurrence" of each display string.
   *
   * Because our canonical scale (31 values) is finer than V-scale (13 values),
   * multiple canonical values map to the same V-grade. For example, both
   * canonical 2 and 3 display as "V1". When we reverse-lookup "V1", we get
   * the FIRST canonical that maps to it (2), not the second (3).
   *
   * This test verifies:
   * 1. First-occurrence canonicals round-trip exactly (e.g., 2 → "V1" → 2)
   * 2. Non-first canonicals collapse to the first (e.g., 3 → "V1" → 2)
   */
  it('first-occurrence canonicals round-trip exactly; non-first collapse to first', () => {
    const systems: GradeSystem[] = ['v-scale', 'font', 'yds'];

    for (const system of systems) {
      // Track which display string we've seen first for each system
      const firstSeen = new Map<string, number>();

      for (let canonical = 0; canonical <= 30; canonical++) {
        const display = canonicalToDisplay(canonical, system);
        const reversed = displayToCanonical(display, system);

        if (!firstSeen.has(display)) {
          // This is the first canonical value that maps to this display string.
          // Round-trip should be exact.
          firstSeen.set(display, canonical);
          expect(reversed).toBe(canonical);
        } else {
          // This canonical shares a display string with an earlier one.
          // Reverse lookup should return the first (earlier) canonical.
          expect(reversed).toBe(firstSeen.get(display));
        }
      }
    }
  });
});

/* ── compareGrades ─────────────────────────────────────────────────────── */

describe('compareGrades', () => {
  /**
   * compareGrades is designed as an Array.sort() comparator.
   * The convention for sort comparators:
   *   - Negative return → a comes before b (a < b)
   *   - Positive return → a comes after b (a > b)
   *   - Zero return → a and b are equal
   */
  it('returns negative when a < b', () => {
    expect(compareGrades(5, 10)).toBeLessThan(0);
  });

  it('returns positive when a > b', () => {
    expect(compareGrades(10, 5)).toBeGreaterThan(0);
  });

  it('returns zero when a === b', () => {
    expect(compareGrades(7, 7)).toBe(0);
  });

  /**
   * Integration with Array.sort: verify that compareGrades actually
   * produces correctly sorted output when passed as a comparator.
   * This catches edge cases in the comparator contract.
   */
  it('works as an Array.sort comparator to sort grades ascending', () => {
    const unsorted = [20, 5, 30, 0, 10, 15];
    const sorted = [...unsorted].sort(compareGrades);
    expect(sorted).toEqual([0, 5, 10, 15, 20, 30]);
  });
});

/* ── getGradeRange ─────────────────────────────────────────────────────── */

describe('getGradeRange', () => {
  /**
   * V-scale has 13 unique grades (V0 through V12).
   * Even though our canonical scale has 31 entries, many canonical values
   * share the same V-grade, so the unique labels are fewer.
   */
  it('returns 13 unique V-scale labels from V0 to V12', () => {
    const range = getGradeRange('v-scale');
    expect(range).toHaveLength(13);
    expect(range[0]).toBe('V0');
    expect(range[range.length - 1]).toBe('V12');
  });

  /**
   * Font scale has 25 unique grades (4a through 9a).
   * More granular than V-scale because it uses letter+modifier notation.
   */
  it('returns 25 unique Font labels from 4a to 9a', () => {
    const range = getGradeRange('font');
    expect(range).toHaveLength(25);
    expect(range[0]).toBe('4a');
    expect(range[range.length - 1]).toBe('9a');
  });

  /**
   * YDS has 27 unique grades (5.5 through 5.15d).
   * Some YDS sub-grades are skipped to fit 31 canonical slots against
   * the anchor points (e.g., 5.11c, 5.12c are omitted), while others
   * share canonical values (5.5 and 5.9 each appear twice in the table
   * but only count once as unique labels).
   */
  it('returns 27 unique YDS labels from 5.5 to 5.15d', () => {
    const range = getGradeRange('yds');
    expect(range).toHaveLength(27);
    expect(range[0]).toBe('5.5');
    expect(range[range.length - 1]).toBe('5.15d');
  });

  /**
   * Every label returned by getGradeRange must be resolvable back to a
   * canonical value. This ensures the range doesn't contain phantom grades
   * that don't exist in GRADE_TABLE.
   */
  it('every label in every range resolves via displayToCanonical', () => {
    const systems: GradeSystem[] = ['v-scale', 'font', 'yds'];
    for (const system of systems) {
      const range = getGradeRange(system);
      for (const label of range) {
        const canonical = displayToCanonical(label, system);
        expect(canonical).not.toBeNull();
      }
    }
  });
});
