/**
 * Tests for hexToColorName — hex color to i18n key mapping.
 *
 * Verifies that common climbing hold colors are correctly identified
 * and that edge cases (null, empty, invalid hex) return "colors.unknown".
 */

import { hexToColorName } from "../colorNames";

describe("hexToColorName", () => {
  // ── Exact matches ────────────────────────────────────────────────

  it("maps pure red (#FF0000) to colors.red", () => {
    expect(hexToColorName("#FF0000")).toBe("colors.red");
  });

  it("maps pure blue (#0000FF) to colors.blue", () => {
    expect(hexToColorName("#0000FF")).toBe("colors.blue");
  });

  it("maps black (#000000) to colors.black", () => {
    expect(hexToColorName("#000000")).toBe("colors.black");
  });

  it("maps white (#FFFFFF) to colors.white", () => {
    expect(hexToColorName("#FFFFFF")).toBe("colors.white");
  });

  // ── Case insensitivity ───────────────────────────────────────────

  it("handles lowercase hex input", () => {
    expect(hexToColorName("#ff0000")).toBe("colors.red");
  });

  it("handles mixed-case hex input", () => {
    expect(hexToColorName("#Ff00fF")).toBe("colors.pink");
  });

  // ── Shorthand hex ────────────────────────────────────────────────

  it("handles 3-char shorthand (#00F → blue)", () => {
    expect(hexToColorName("#00F")).toBe("colors.blue");
  });

  // ── Without hash prefix ──────────────────────────────────────────

  it("handles hex without leading #", () => {
    expect(hexToColorName("FF0000")).toBe("colors.red");
  });

  // ── Closest match for ambiguous colors ───────────────────────────

  it("maps a dark red (#CC1100) to colors.red (closest match)", () => {
    expect(hexToColorName("#CC1100")).toBe("colors.red");
  });

  it("maps a warm orange (#FF8C00) to colors.orange (closest match)", () => {
    expect(hexToColorName("#FF8C00")).toBe("colors.orange");
  });

  // ── Invalid / edge-case inputs ───────────────────────────────────

  it('returns "colors.unknown" for null', () => {
    expect(hexToColorName(null)).toBe("colors.unknown");
  });

  it('returns "colors.unknown" for undefined', () => {
    expect(hexToColorName(undefined)).toBe("colors.unknown");
  });

  it('returns "colors.unknown" for empty string', () => {
    expect(hexToColorName("")).toBe("colors.unknown");
  });

  it('returns "colors.unknown" for invalid hex', () => {
    expect(hexToColorName("#ZZZZZZ")).toBe("colors.unknown");
  });

  it('returns "colors.unknown" for whitespace-only string', () => {
    expect(hexToColorName("   ")).toBe("colors.unknown");
  });
});
