/**
 * GradePyramid Component Tests
 *
 * Tests the presentational horizontal bar chart component that visualizes
 * a user's send distribution by grade.
 *
 * TESTING APPROACH:
 * These tests verify behavior, not styling. We check:
 *   1. Grade labels render using the correct grade system
 *   2. Send counts appear next to each bar
 *   3. Empty state shows a placeholder message
 *   4. Bars have accessibility labels for screen readers
 *   5. Different grade systems produce correct display strings
 *
 * No mocking needed — the component is purely presentational. It receives
 * data as props and renders it. The only dependency is `canonicalToDisplay()`
 * from utils/grades.ts, which is a pure function (no I/O, no side effects).
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { GradePyramid } from "../GradePyramid";
import type { GradePyramidEntry } from "@/services/sessions.service";

// ── Fixtures ─────────────────────────────────────────────────────

/** Typical pyramid data: 3 grades with varying counts. */
const sampleData: GradePyramidEntry[] = [
  { grade: 0, count: 2 },  // V0 / 4a  / 5.5
  { grade: 6, count: 5 },  // V2 / 5b  / 5.8
  { grade: 10, count: 3 }, // V4 / 6a+ / 5.10b
];

// ── Tests ────────────────────────────────────────────────────────

describe("GradePyramid", () => {
  it("renders grade labels in V-scale", () => {
    // Each grade entry should show its V-scale display string.
    // canonicalToDisplay(0, 'v-scale') → 'V0', etc.
    render(<GradePyramid data={sampleData} gradeSystem="v-scale" />);

    expect(screen.getByText("V0")).toBeOnTheScreen();
    expect(screen.getByText("V2")).toBeOnTheScreen();
    expect(screen.getByText("V4")).toBeOnTheScreen();
  });

  it("renders grade labels in Font system", () => {
    // Same data but displayed with Fontainebleau grades.
    render(<GradePyramid data={sampleData} gradeSystem="font" />);

    expect(screen.getByText("4a")).toBeOnTheScreen();
    expect(screen.getByText("5b")).toBeOnTheScreen();
    expect(screen.getByText("6a+")).toBeOnTheScreen();
  });

  it("renders grade labels in YDS system", () => {
    // Same data displayed with Yosemite Decimal System grades.
    render(<GradePyramid data={sampleData} gradeSystem="yds" />);

    expect(screen.getByText("5.5")).toBeOnTheScreen();
    expect(screen.getByText("5.8")).toBeOnTheScreen();
    expect(screen.getByText("5.10b")).toBeOnTheScreen();
  });

  it("shows send counts next to each bar", () => {
    // Each row should display the count of sends at that grade.
    render(<GradePyramid data={sampleData} gradeSystem="v-scale" />);

    expect(screen.getByText("2")).toBeOnTheScreen();
    expect(screen.getByText("5")).toBeOnTheScreen();
    expect(screen.getByText("3")).toBeOnTheScreen();
  });

  it("renders accessibility labels on bars", () => {
    // Each bar should have an accessibility label combining the grade
    // label and count, so screen readers announce "V2: 5 sends".
    render(<GradePyramid data={sampleData} gradeSystem="v-scale" />);

    expect(screen.getByLabelText("V0: 2 sends")).toBeOnTheScreen();
    expect(screen.getByLabelText("V2: 5 sends")).toBeOnTheScreen();
    expect(screen.getByLabelText("V4: 3 sends")).toBeOnTheScreen();
  });

  it("renders empty state when data is empty", () => {
    // When the user has no sends in the selected period, the chart
    // should show a helpful placeholder instead of an empty container.
    render(<GradePyramid data={[]} gradeSystem="v-scale" />);

    expect(
      screen.getByText("No sends yet for this period")
    ).toBeOnTheScreen();
  });

  it("renders a single grade entry correctly", () => {
    // Edge case: only one grade in the pyramid. The bar should
    // render at 100% width (it's the max by definition).
    const singleEntry: GradePyramidEntry[] = [{ grade: 15, count: 7 }];

    render(<GradePyramid data={singleEntry} gradeSystem="v-scale" />);

    expect(screen.getByText("V6")).toBeOnTheScreen();
    expect(screen.getByText("7")).toBeOnTheScreen();
    expect(screen.getByLabelText("V6: 7 sends")).toBeOnTheScreen();
  });

  it("renders testID on the outer container", () => {
    // The testID prop allows screens to target the component in tests.
    render(
      <GradePyramid
        data={sampleData}
        gradeSystem="v-scale"
        testID="grade-pyramid"
      />
    );

    expect(screen.getByTestId("grade-pyramid")).toBeOnTheScreen();
  });
});
