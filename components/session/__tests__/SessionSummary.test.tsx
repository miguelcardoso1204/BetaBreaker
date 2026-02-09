/**
 * SessionSummary Component Tests
 *
 * The SessionSummary is a presentational card that displays post-session
 * statistics: date, duration, ascent counts by status, and optional
 * grade distribution bars.
 *
 * Test strategy:
 *   - Since this is a purely presentational component (no hooks, no store),
 *     we just pass props and verify the rendered text content.
 *   - Mock canonicalToDisplay from utils/grades to control grade labels
 *     without depending on the real grade table.
 *   - No need for fake timers or store mocking.
 *
 * Test coverage:
 *   1. All stats display correctly (ascents, sends, flashes, attempts)
 *   2. Date renders in the header
 *   3. Duration < 60 min shows "X min" format
 *   4. Duration >= 60 min shows "Xh Ym" format
 *   5. Grade distribution bars show labels and counts
 *   6. Grade section omitted when no distribution provided
 *   7. Zero ascents render without crash
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock canonicalToDisplay to return predictable grade labels.
// This decouples tests from the real GRADE_TABLE so they won't break
// if grade mappings are adjusted.
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn((canonical: number) => `V${canonical}`),
}));

// ── Import after mocks ───────────────────────────────────────────────

import { SessionSummary } from "../SessionSummary";

// ── Tests ────────────────────────────────────────────────────────────

describe("SessionSummary", () => {
  it("displays all stats correctly", () => {
    // Render with full props and verify each stat appears.
    render(
      <SessionSummary
        date="Feb 9, 2026"
        durationMinutes={45}
        totalAscents={12}
        sends={5}
        flashes={3}
        attempts={4}
        testID="summary"
      />
    );

    // Verify ascent count (text includes the word "ascents")
    expect(screen.getByText("12 ascents")).toBeTruthy();

    // Verify status badge labels include counts
    expect(screen.getByText("3 Flash")).toBeTruthy();
    expect(screen.getByText("5 Send")).toBeTruthy();
    expect(screen.getByText("4 Attempt")).toBeTruthy();
  });

  it("shows the date in the header", () => {
    render(
      <SessionSummary
        date="Feb 9, 2026"
        durationMinutes={30}
        totalAscents={5}
        sends={2}
        flashes={1}
        attempts={2}
      />
    );

    expect(screen.getByText("Feb 9, 2026")).toBeTruthy();
  });

  it('formats duration under 60 minutes as "X min"', () => {
    render(
      <SessionSummary
        date="Feb 9, 2026"
        durationMinutes={45}
        totalAscents={5}
        sends={2}
        flashes={1}
        attempts={2}
      />
    );

    // The duration text includes "Duration: " prefix
    expect(screen.getByText("Duration: 45 min")).toBeTruthy();
  });

  it('formats duration 60+ minutes as "Xh Ym"', () => {
    render(
      <SessionSummary
        date="Feb 9, 2026"
        durationMinutes={90}
        totalAscents={10}
        sends={4}
        flashes={3}
        attempts={3}
      />
    );

    // 90 minutes = 1 hour 30 minutes → "1h 30m"
    expect(screen.getByText("Duration: 1h 30m")).toBeTruthy();
  });

  it("renders grade distribution bars with labels and counts", () => {
    // Grade distribution: canonical 5 → 2 ascents, canonical 10 → 3 ascents.
    // The mock canonicalToDisplay returns "V5" and "V10" respectively.
    render(
      <SessionSummary
        date="Feb 9, 2026"
        durationMinutes={60}
        totalAscents={5}
        sends={2}
        flashes={1}
        attempts={2}
        gradeDistribution={{ 5: 2, 10: 3 }}
        gradeSystem="v-scale"
      />
    );

    // Verify the section title appears
    expect(screen.getByText("Grade Distribution")).toBeTruthy();

    // Verify grade labels from the mock (canonicalToDisplay returns "V{n}")
    expect(screen.getByText("V5")).toBeTruthy();
    expect(screen.getByText("V10")).toBeTruthy();

    // Verify counts appear (as standalone text elements)
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("omits grade section when no distribution provided", () => {
    render(
      <SessionSummary
        date="Feb 9, 2026"
        durationMinutes={30}
        totalAscents={5}
        sends={2}
        flashes={1}
        attempts={2}
      />
    );

    // "Grade Distribution" title should NOT appear
    expect(screen.queryByText("Grade Distribution")).toBeNull();
  });

  it("handles zero ascents without crashing", () => {
    // Edge case: a session where no ascents were logged (user started
    // and immediately ended, or was just hanging out at the gym).
    render(
      <SessionSummary
        date="Feb 9, 2026"
        durationMinutes={5}
        totalAscents={0}
        sends={0}
        flashes={0}
        attempts={0}
        testID="summary"
      />
    );

    // Should render without throwing, showing zero counts
    expect(screen.getByText("0 ascents")).toBeTruthy();
    expect(screen.getByText("0 Flash")).toBeTruthy();
    expect(screen.getByText("0 Send")).toBeTruthy();
    expect(screen.getByText("0 Attempt")).toBeTruthy();
  });
});
