/**
 * GradeConsensusCard Tests (Step 15.4)
 *
 * Tests the admin card component that displays:
 *   - Route name with color dot
 *   - Side-by-side setter grade vs community grade
 *   - Divergence badge (green/amber/red/gray)
 *   - Submission count
 *   - Expandable grade distribution (via useGradeSubmissions)
 *
 * Mock strategy:
 *   - useGradeSubmissions: mutable __mockData pattern for controlling expansion state
 *   - canonicalToDisplay: returns "V{grade}" for any input (avoids grade table dependency)
 *   - lucide-react-native: mocked to avoid SVG processing
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock useGradeSubmissions ───────────────────────────────────────
jest.mock("@/hooks/useGradeConsensus", () => {
  const mockSubmissionsData = {
    submissions: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useGradeSubmissions: () => mockSubmissionsData,
    __mockSubmissionsData: mockSubmissionsData,
  };
});

// ── Mock grade utils ───────────────────────────────────────────────
// Return "V{grade}" so tests can assert grade display without
// depending on the full 0-30 grade table mapping.
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: (grade: number) => `V${grade}`,
}));

// ── Mock lucide ────────────────────────────────────────────────────
jest.mock("lucide-react-native", () => ({
  ChevronDown: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>ChevronDown</Text>;
  },
  ChevronUp: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>ChevronUp</Text>;
  },
}));

import GradeConsensusCard from "../GradeConsensusCard";

const { __mockSubmissionsData } = jest.requireMock<{
  __mockSubmissionsData: {
    submissions: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useGradeConsensus");

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockSubmissionsData.submissions = [];
  __mockSubmissionsData.isLoading = false;
  __mockSubmissionsData.error = null;
}

const defaultProps = {
  routeId: "route-1",
  name: "Boulder Alpha",
  color: "red",
  canonicalGrade: 14,
  consensusGrade: 16,
  submissionCount: 7,
  divergence: 2,
};

describe("GradeConsensusCard", () => {
  beforeEach(resetMockData);

  it("renders route name", () => {
    render(<GradeConsensusCard {...defaultProps} />);
    expect(screen.getByText("Boulder Alpha")).toBeTruthy();
  });

  it("displays setter grade and community grade side by side", () => {
    render(<GradeConsensusCard {...defaultProps} />);
    // canonicalToDisplay mock returns "V{grade}"
    expect(screen.getByText("V14")).toBeTruthy();
    expect(screen.getByText("V16")).toBeTruthy();
  });

  it("shows submission count", () => {
    render(<GradeConsensusCard {...defaultProps} />);
    expect(screen.getByText("7 submissions")).toBeTruthy();
  });

  it("shows green badge for divergence 0-1", () => {
    render(
      <GradeConsensusCard {...defaultProps} divergence={1} />
    );
    expect(screen.getByTestId("divergence-badge-green")).toBeTruthy();
  });

  it("shows amber badge for divergence 2", () => {
    render(
      <GradeConsensusCard {...defaultProps} divergence={2} />
    );
    expect(screen.getByTestId("divergence-badge-amber")).toBeTruthy();
  });

  it("shows red badge for divergence ≥3", () => {
    render(
      <GradeConsensusCard {...defaultProps} divergence={5} />
    );
    expect(screen.getByTestId("divergence-badge-red")).toBeTruthy();
  });

  it("shows gray badge when no consensus (divergence null)", () => {
    render(
      <GradeConsensusCard
        {...defaultProps}
        consensusGrade={null}
        divergence={null}
      />
    );
    expect(screen.getByTestId("divergence-badge-gray")).toBeTruthy();
  });

  it("shows 'No consensus' when consensusGrade is null", () => {
    render(
      <GradeConsensusCard
        {...defaultProps}
        consensusGrade={null}
        divergence={null}
      />
    );
    expect(screen.getByText("No consensus")).toBeTruthy();
  });

  it("expands to show grade distribution on press", () => {
    __mockSubmissionsData.submissions = [
      { perceived_grade: 14, submission_count: 3 },
      { perceived_grade: 16, submission_count: 4 },
    ];

    render(<GradeConsensusCard {...defaultProps} />);

    // Tap to expand
    fireEvent.press(screen.getByTestId("consensus-card-route-1"));

    // Distribution section should be visible
    expect(screen.getByTestId("grade-distribution")).toBeTruthy();
    // "V14" appears twice: once as setter grade, once in distribution
    expect(screen.getAllByText("V14")).toHaveLength(2);
    expect(screen.getByText("3")).toBeTruthy();
    // "V16" appears twice: once as community grade, once in distribution
    expect(screen.getAllByText("V16")).toHaveLength(2);
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("collapses distribution on second press", () => {
    __mockSubmissionsData.submissions = [
      { perceived_grade: 14, submission_count: 3 },
    ];

    render(<GradeConsensusCard {...defaultProps} />);

    const card = screen.getByTestId("consensus-card-route-1");

    // Expand
    fireEvent.press(card);
    expect(screen.getByTestId("grade-distribution")).toBeTruthy();

    // Collapse
    fireEvent.press(card);
    expect(screen.queryByTestId("grade-distribution")).toBeNull();
  });
});
