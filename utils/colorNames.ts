/**
 * Color Name Utility — Maps Hex Colors to Human-Readable Names
 *
 * Climbing routes are identified by hold color (e.g., "the red route").
 * This module maps hex color values to i18n translation keys so that
 * color-blind users (and screen readers) can identify routes by name
 * instead of relying on visual color alone.
 *
 * HOW IT WORKS:
 * We define ~12 predefined climbing hold colors with their RGB values.
 * Given an arbitrary hex string, we compute the Euclidean distance in
 * RGB space to each predefined color and return the closest match's
 * i18n key. This handles slight variations in hex values that gyms
 * might use (e.g., "#E53935" and "#FF0000" both map to "colors.red").
 *
 * WHY EUCLIDEAN DISTANCE IN RGB?
 * More perceptually accurate models exist (CIELAB, etc.), but they
 * require complex conversion math. For ~12 well-separated climbing
 * colors, RGB distance works well enough — the colors are distinct
 * enough that the nearest neighbor is always correct.
 */

// ── Predefined Color Map ──────────────────────────────────────────

/**
 * Each entry maps an i18n key to its canonical RGB values.
 * These represent the most common hold colors used in climbing gyms.
 */
const COLOR_MAP: { key: string; r: number; g: number; b: number }[] = [
  { key: "colors.red", r: 255, g: 0, b: 0 },
  { key: "colors.blue", r: 0, g: 0, b: 255 },
  { key: "colors.green", r: 0, g: 128, b: 0 },
  { key: "colors.yellow", r: 255, g: 255, b: 0 },
  { key: "colors.orange", r: 255, g: 165, b: 0 },
  { key: "colors.pink", r: 255, g: 105, b: 180 },
  { key: "colors.purple", r: 128, g: 0, b: 128 },
  { key: "colors.white", r: 255, g: 255, b: 255 },
  { key: "colors.black", r: 0, g: 0, b: 0 },
  { key: "colors.gray", r: 128, g: 128, b: 128 },
  { key: "colors.brown", r: 139, g: 69, b: 19 },
  { key: "colors.teal", r: 0, g: 128, b: 128 },
];

// ── Hex Parsing ───────────────────────────────────────────────────

/**
 * Parses a hex color string into its RGB components.
 * Supports 3-char (#RGB) and 6-char (#RRGGBB) formats, with or
 * without the leading "#". Returns null for invalid input.
 */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  // Strip the leading "#" if present
  let cleaned = hex.replace(/^#/, "");

  // Expand 3-char shorthand: "F00" → "FF0000"
  if (cleaned.length === 3) {
    cleaned = cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
  }

  // Must be exactly 6 hex characters
  if (cleaned.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null;
  }

  return {
    r: parseInt(cleaned.substring(0, 2), 16),
    g: parseInt(cleaned.substring(2, 4), 16),
    b: parseInt(cleaned.substring(4, 6), 16),
  };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Maps a hex color string to the closest predefined color's i18n key.
 *
 * @param hex - A CSS hex color string (e.g., "#FF0000", "#f00", "FF0000")
 * @returns An i18n key like "colors.red", or "colors.unknown" for invalid input
 *
 * @example
 * hexToColorName("#FF0000")  // → "colors.red"
 * hexToColorName("#00F")     // → "colors.blue"
 * hexToColorName(null)       // → "colors.unknown"
 * hexToColorName("")         // → "colors.unknown"
 */
export function hexToColorName(hex: string | null | undefined): string {
  // Guard against null, undefined, or empty input
  if (!hex || typeof hex !== "string" || hex.trim() === "") {
    return "colors.unknown";
  }

  const rgb = parseHex(hex.trim());
  if (!rgb) return "colors.unknown";

  // Find the predefined color with the smallest Euclidean distance.
  // Euclidean distance in RGB: sqrt((r1-r2)^2 + (g1-g2)^2 + (b1-b2)^2)
  // We skip the sqrt since we only need relative comparisons — the
  // ordering of squared distances is the same as actual distances.
  let bestKey = "colors.unknown";
  let bestDist = Infinity;

  for (const entry of COLOR_MAP) {
    const dr = rgb.r - entry.r;
    const dg = rgb.g - entry.g;
    const db = rgb.b - entry.b;
    const dist = dr * dr + dg * dg + db * db;

    if (dist < bestDist) {
      bestDist = dist;
      bestKey = entry.key;
    }
  }

  return bestKey;
}
