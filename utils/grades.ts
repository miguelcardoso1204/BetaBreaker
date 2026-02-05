/**
 * Grade Conversion System — utils/grades.ts
 *
 * Indoor climbing uses several grading systems worldwide:
 *
 *   - V-scale (Hueco scale)  — North American bouldering. "V0" is beginner,
 *     "V17" is the current world record. We cover V0–V12 for gym relevance.
 *
 *   - Font (Fontainebleau)   — European bouldering. Uses number + letter
 *     combos like "6a+", "7c". More granular than V-scale.
 *
 *   - YDS (Yosemite Decimal) — Route climbing in North America. Format is
 *     "5.X" where X ranges from 0 to 15d. We cover 5.5–5.15d.
 *
 * Why canonical integers (0–30)?
 * These three systems don't map 1-to-1. V-scale has 13 distinct grades in
 * our range, Font has 25, and YDS has 24. By storing a single integer in
 * Postgres, we get:
 *   1. Simple comparison and sorting (just use < or >)
 *   2. System-agnostic storage (display in whatever the user prefers)
 *   3. No string-parsing bugs in the database layer
 *
 * Each gym has a `default_grade_system` setting, and each user can override
 * it in their profile. The conversion happens client-side, keeping the DB
 * layer simple and the UI flexible.
 */

/* ── Types ─────────────────────────────────────────────────────────────── */

/**
 * The three grade systems supported by the app.
 * - 'v-scale': Used by most US gyms for bouldering
 * - 'font': Common in European gyms and outdoor areas
 * - 'yds': Used for roped climbing routes
 *
 * Gyms pick a default; users can override in profile settings.
 */
export type GradeSystem = 'v-scale' | 'font' | 'yds';

/**
 * One row in the grade lookup table: the human-readable string for each
 * system at a given canonical grade. The index in GRADE_TABLE is the
 * canonical value itself (e.g., GRADE_TABLE[10].v === 'V4').
 */
export interface GradeEntry {
  readonly v: string;    // V-scale display string
  readonly font: string; // Fontainebleau display string
  readonly yds: string;  // Yosemite Decimal System display string
}

/* ── Grade Table ───────────────────────────────────────────────────────── */

/**
 * The master grade lookup table. 31 entries (canonical 0–30).
 *
 * Adjacent canonical values may share the same display string in coarser
 * systems (e.g., canonical 2 and 3 both display as "V1" in V-scale).
 * This is expected — our canonical scale is finer-grained than any single
 * grading system so we can represent in-between difficulties.
 *
 * Anchor points (from SystemArchitecture.md) are marked with comments.
 * These MUST be exactly correct; the rest is interpolated.
 *
 * Marked `as const` so TypeScript treats the array as a readonly tuple,
 * preventing accidental mutation at runtime.
 */
export const GRADE_TABLE: readonly GradeEntry[] = [
  /* 0  */ { v: 'V0',  font: '4a',  yds: '5.5'   }, // ← Anchor: easiest grade
  /* 1  */ { v: 'V0',  font: '4b',  yds: '5.5'   },
  /* 2  */ { v: 'V1',  font: '4b',  yds: '5.6'   },
  /* 3  */ { v: 'V1',  font: '4c',  yds: '5.6'   },
  /* 4  */ { v: 'V1',  font: '5a',  yds: '5.7'   },
  /* 5  */ { v: 'V2',  font: '5a',  yds: '5.7'   },
  /* 6  */ { v: 'V2',  font: '5b',  yds: '5.8'   },
  /* 7  */ { v: 'V2',  font: '5c',  yds: '5.9'   },
  /* 8  */ { v: 'V3',  font: '5c',  yds: '5.9'   },
  /* 9  */ { v: 'V3',  font: '6a',  yds: '5.10a' },
  /* 10 */ { v: 'V4',  font: '6a+', yds: '5.10b' }, // ← Anchor: mid-range
  /* 11 */ { v: 'V4',  font: '6b',  yds: '5.10c' },
  /* 12 */ { v: 'V4',  font: '6b',  yds: '5.10d' },
  /* 13 */ { v: 'V5',  font: '6b+', yds: '5.11a' },
  /* 14 */ { v: 'V5',  font: '6c',  yds: '5.11b' },
  /* 15 */ { v: 'V6',  font: '6c',  yds: '5.11d' },
  /* 16 */ { v: 'V6',  font: '6c+', yds: '5.12a' },
  /* 17 */ { v: 'V6',  font: '7a',  yds: '5.12b' },
  /* 18 */ { v: 'V7',  font: '7a',  yds: '5.12d' },
  /* 19 */ { v: 'V7',  font: '7a+', yds: '5.13a' },
  /* 20 */ { v: 'V8',  font: '7b',  yds: '5.13b' }, // ← Anchor: upper-intermediate
  /* 21 */ { v: 'V8',  font: '7b+', yds: '5.13c' },
  /* 22 */ { v: 'V8',  font: '7c',  yds: '5.13d' },
  /* 23 */ { v: 'V9',  font: '7c+', yds: '5.14a' },
  /* 24 */ { v: 'V9',  font: '8a',  yds: '5.14b' },
  /* 25 */ { v: 'V10', font: '8a+', yds: '5.14c' },
  /* 26 */ { v: 'V10', font: '8b',  yds: '5.14d' },
  /* 27 */ { v: 'V11', font: '8b+', yds: '5.15a' },
  /* 28 */ { v: 'V11', font: '8c',  yds: '5.15b' },
  /* 29 */ { v: 'V12', font: '8c+', yds: '5.15c' },
  /* 30 */ { v: 'V12', font: '9a',  yds: '5.15d' }, // ← Anchor: hardest grade
] as const;

/* ── Helpers ───────────────────────────────────────────────────────────── */

/**
 * Maps each GradeSystem to the corresponding property key on GradeEntry.
 *
 * Why a separate map instead of using the system string directly?
 * The GradeSystem value 'v-scale' doesn't match the property name 'v'.
 * This lookup keeps the rest of the code clean — we resolve the key once
 * and then use it for direct property access.
 */
const SYSTEM_KEY_MAP: Record<GradeSystem, keyof GradeEntry> = {
  'v-scale': 'v',
  'font': 'font',
  'yds': 'yds',
};

/**
 * Lazily-built reverse lookup maps: display string → first canonical index.
 *
 * Why lazy? We only build these maps the first time someone calls
 * displayToCanonical. Most app sessions may never need reverse lookup
 * (e.g., if the user only browses routes by canonical grade).
 *
 * Why Map<string, number>? O(1) lookup vs. scanning the table each time.
 * We store the FIRST canonical index for each display string, so
 * "V1" → 2 (not 3 or 4, which also display as "V1").
 */
const reverseMaps = new Map<GradeSystem, Map<string, number>>();

/**
 * Builds (or retrieves from cache) the reverse lookup map for a given system.
 * Iterates GRADE_TABLE once, storing only the first occurrence of each
 * display string. Subsequent calls return the cached map instantly.
 */
function getReverseMap(system: GradeSystem): Map<string, number> {
  // Check if we already built this map (cache hit)
  const cached = reverseMaps.get(system);
  if (cached) return cached;

  // Build the map: scan from canonical 0 to 30, only store first occurrence
  const key = SYSTEM_KEY_MAP[system];
  const map = new Map<string, number>();

  for (let i = 0; i < GRADE_TABLE.length; i++) {
    const display = GRADE_TABLE[i][key];
    // Only store the first canonical index for each display string
    if (!map.has(display)) {
      map.set(display, i);
    }
  }

  // Cache for future calls
  reverseMaps.set(system, map);
  return map;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Converts a canonical grade integer to a human-readable display string.
 *
 * @param canonical - Integer from 0 to 30 (inclusive)
 * @param system    - Which grading system to display in
 * @returns The display string (e.g., "V4", "6a+", "5.10b")
 * @throws {RangeError} If canonical is out of range, not an integer, or NaN
 *
 * @example
 * canonicalToDisplay(10, 'v-scale')  // → "V4"
 * canonicalToDisplay(10, 'font')     // → "6a+"
 * canonicalToDisplay(10, 'yds')      // → "5.10b"
 */
export function canonicalToDisplay(canonical: number, system: GradeSystem): string {
  // Guard: reject non-integers, NaN, and out-of-range values.
  // Number.isInteger() returns false for NaN, Infinity, and floats,
  // so this single check covers multiple invalid cases.
  if (!Number.isInteger(canonical) || canonical < 0 || canonical > 30) {
    throw new RangeError(
      `Canonical grade must be an integer between 0 and 30, got: ${canonical}`
    );
  }

  // Look up the property key for this system, then index into the table
  const key = SYSTEM_KEY_MAP[system];
  return GRADE_TABLE[canonical][key];
}

/**
 * Converts a display string back to its canonical grade integer.
 *
 * Returns the FIRST canonical value that maps to this display string.
 * Since multiple canonical values can share a display string (e.g.,
 * canonical 2, 3, and 4 all display as "V1"), this always returns the
 * lowest one. This means round-trips may "collapse" to the primary
 * canonical: 3 → "V1" → 2.
 *
 * @param display - A grade string like "V4", "6a+", or "5.10b"
 * @param system  - Which grading system the string belongs to
 * @returns The canonical integer (0–30), or null if unrecognized
 *
 * @example
 * displayToCanonical('V4', 'v-scale')   // → 10
 * displayToCanonical('VX', 'v-scale')   // → null (unknown grade)
 */
export function displayToCanonical(display: string, system: GradeSystem): number | null {
  // Get (or lazily build) the reverse lookup map for this system
  const map = getReverseMap(system);
  // Map.get returns undefined for missing keys; we convert to null
  // because null is more explicit in TypeScript ("intentionally no value")
  return map.get(display) ?? null;
}

/**
 * Compares two canonical grades for use as an Array.sort() comparator.
 *
 * The sort comparator contract:
 *   - Return negative → a sorts before b (a is an easier grade)
 *   - Return positive → a sorts after b (a is a harder grade)
 *   - Return 0        → a and b are the same grade
 *
 * Because canonical grades are already integers, subtraction gives us
 * a correct comparator with no extra logic needed.
 *
 * @example
 * [20, 5, 10].sort(compareGrades)  // → [5, 10, 20]
 */
export function compareGrades(a: number, b: number): number {
  return a - b;
}

/**
 * Returns an array of unique display labels for a given grade system,
 * ordered from easiest to hardest.
 *
 * Useful for populating grade picker dropdowns and filter UIs.
 * Because our canonical scale is finer than most display systems,
 * this deduplicates: V-scale returns 13 labels (V0–V12) from 31
 * canonical entries.
 *
 * Uses a Set for O(1) deduplication — each label is checked against
 * the Set before being added to the result array. This preserves
 * insertion order (easiest to hardest) while skipping duplicates.
 *
 * @param system - Which grading system's labels to return
 * @returns Array of unique grade strings, ordered easiest → hardest
 *
 * @example
 * getGradeRange('v-scale')  // → ['V0', 'V1', 'V2', ..., 'V12']
 */
export function getGradeRange(system: GradeSystem): string[] {
  const key = SYSTEM_KEY_MAP[system];
  const seen = new Set<string>();   // O(1) lookup for deduplication
  const result: string[] = [];

  for (const entry of GRADE_TABLE) {
    const label = entry[key];
    // Only add each unique label once (first occurrence wins)
    if (!seen.has(label)) {
      seen.add(label);
      result.push(label);
    }
  }

  return result;
}
