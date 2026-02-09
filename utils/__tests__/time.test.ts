/**
 * Time Utility Tests — utils/__tests__/time.test.ts
 *
 * Tests for the formatElapsedTime function that converts milliseconds
 * into "HH:MM:SS" display format. This is a pure function with no
 * dependencies, so tests are straightforward input → output checks.
 *
 * Test coverage:
 *   - Zero milliseconds (base case)
 *   - Seconds only (< 1 minute)
 *   - Minutes and seconds (< 1 hour)
 *   - Hours, minutes, and seconds (full format)
 *   - Exact hour boundary (no leftover minutes/seconds)
 *   - 24+ hours (no day rollover)
 *   - Negative values (clamped to "00:00:00")
 *   - Sub-second values (floor, not round — 999ms → "00:00:00")
 */

import { formatElapsedTime } from "../time";

describe("formatElapsedTime", () => {
  it("formats zero milliseconds as 00:00:00", () => {
    // Base case: no time has elapsed. The timer should display all zeros.
    expect(formatElapsedTime(0)).toBe("00:00:00");
  });

  it("formats seconds only (< 1 minute)", () => {
    // 5000ms = 5 seconds. Hours and minutes should be zero-padded.
    expect(formatElapsedTime(5000)).toBe("00:00:05");
  });

  it("formats minutes and seconds (< 1 hour)", () => {
    // 90 seconds = 1 minute 30 seconds. Hours should still be "00".
    expect(formatElapsedTime(90_000)).toBe("00:01:30");
  });

  it("formats hours, minutes, and seconds", () => {
    // 1 hour + 1 minute + 1 second = 3661 seconds = 3,661,000ms.
    // Tests that all three segments display correctly.
    expect(formatElapsedTime(3_661_000)).toBe("01:01:01");
  });

  it("handles exact hour boundary with no remainder", () => {
    // Exactly 2 hours (7200 seconds). Minutes and seconds should be "00".
    expect(formatElapsedTime(7_200_000)).toBe("02:00:00");
  });

  it("handles 24+ hours without day rollover", () => {
    // 25 hours = 90,000 seconds = 90,000,000ms. The hour counter
    // should display "25", not wrap around to "01". Marathon sessions!
    expect(formatElapsedTime(90_000_000)).toBe("25:00:00");
  });

  it("clamps negative values to 00:00:00", () => {
    // Negative ms can occur if system clock adjusts backward between
    // startTime capture and Date.now(). Should display zeros, not NaN.
    expect(formatElapsedTime(-5000)).toBe("00:00:00");
  });

  it("truncates sub-second values (floor, not round)", () => {
    // 999ms is less than 1 full second — should still show "00:00:00".
    // This verifies we use Math.floor, not Math.round (which would
    // round 999ms up to 1 second and display "00:00:01").
    expect(formatElapsedTime(999)).toBe("00:00:00");

    // 1999ms = 1 full second + 999ms remainder → "00:00:01" (not "00:00:02")
    expect(formatElapsedTime(1999)).toBe("00:00:01");
  });
});
