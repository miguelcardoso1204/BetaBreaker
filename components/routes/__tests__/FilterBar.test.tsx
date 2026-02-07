/**
 * FilterBar Component Tests
 *
 * Tests the horizontal filter bar that controls grade range and sort order
 * on the gym routes screen. The bar has three pill buttons:
 *   - Min grade picker (opens modal)
 *   - Max grade picker (opens modal)
 *   - Sort toggle (switches between "Newest" and "Grade")
 *
 * Mock strategy:
 *   - `lucide-react-native` — Jest can't process SVG transforms
 *   - Grade utils are NOT mocked — we use real conversion functions
 *     because they're pure and fast, and verifying real label output
 *     gives us more confidence than mocking.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// Mock lucide icons — Jest can't process SVG transforms
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ChevronDown: (props: Record<string, unknown>) => (
      <View testID="chevron-down-icon" {...props} />
    ),
  };
});

import { FilterBar } from "../FilterBar";
import type { FilterBarProps } from "../FilterBar";

// ── Fixtures ─────────────────────────────────────────────────────

const defaultProps: FilterBarProps = {
  gradeMin: undefined,
  gradeMax: undefined,
  sortBy: "newest",
  gradeSystem: "v-scale",
  onGradeMinChange: jest.fn(),
  onGradeMaxChange: jest.fn(),
  onSortByChange: jest.fn(),
};

describe("FilterBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders grade min, grade max, and sort buttons", () => {
    render(<FilterBar {...defaultProps} />);

    // When no grade filters are set, pills should show "Any"
    expect(screen.getByText("Min: Any")).toBeOnTheScreen();
    expect(screen.getByText("Max: Any")).toBeOnTheScreen();
    expect(screen.getByText("Newest ↓")).toBeOnTheScreen();
  });

  it("toggles sort between Newest and Grade on press", () => {
    const onSortByChange = jest.fn();
    render(
      <FilterBar {...defaultProps} onSortByChange={onSortByChange} />
    );

    // Tap the sort pill — should toggle from "newest" to "grade"
    fireEvent.press(screen.getByTestId("filter-sort"));
    expect(onSortByChange).toHaveBeenCalledWith("grade");

    // Re-render with sortBy="grade" to verify the other direction
    const { unmount } = render(
      <FilterBar
        {...defaultProps}
        sortBy="grade"
        onSortByChange={onSortByChange}
      />
    );

    // The label should now show "Grade ↑"
    expect(screen.getByText("Grade ↑")).toBeOnTheScreen();

    // Tap again — should toggle back to "newest"
    fireEvent.press(screen.getByTestId("filter-sort"));
    expect(onSortByChange).toHaveBeenCalledWith("newest");
  });

  it("opens grade picker modal when min grade pill is pressed", () => {
    render(<FilterBar {...defaultProps} />);

    // Before pressing, the modal content shouldn't be visible
    expect(screen.queryByText("Min Grade")).toBeNull();

    // Press the min grade pill to open the picker
    fireEvent.press(screen.getByTestId("filter-grade-min"));

    // Modal should show title and grade options
    expect(screen.getByText("Min Grade")).toBeOnTheScreen();
    expect(screen.getByText("Any")).toBeOnTheScreen();
    // V-scale grades should be listed
    expect(screen.getByText("V0")).toBeOnTheScreen();
    expect(screen.getByText("V12")).toBeOnTheScreen();
  });

  it("calls onGradeMinChange with canonical value when grade is selected", () => {
    const onGradeMinChange = jest.fn();
    render(
      <FilterBar {...defaultProps} onGradeMinChange={onGradeMinChange} />
    );

    // Open the min grade picker
    fireEvent.press(screen.getByTestId("filter-grade-min"));

    // Select "V4" — should convert to canonical value 10
    // (V4 maps to canonical 10 in the grade table)
    fireEvent.press(screen.getByTestId("grade-option-V4"));

    expect(onGradeMinChange).toHaveBeenCalledWith(10);
  });
});
