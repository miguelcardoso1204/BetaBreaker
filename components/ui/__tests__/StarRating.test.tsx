/**
 * StarRating Component Tests
 *
 * Tests the 5-star rating input used on the Full Ascent Form.
 * Verifies rendering, tap behavior (select + deselect), and visual state.
 *
 * Mock strategy:
 *   - lucide-react-native: replaced with a simple View that exposes props
 *     via testID so we can verify color/fill values (jest can't render SVGs)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock lucide-react-native — replace the Star SVG component with a View
// that exposes its props as testID attributes for assertion. This lets us
// verify which color/fill values are passed without needing SVG rendering.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Star: (props: any) => (
      <View
        testID={`mock-star-icon`}
        // Expose color and fill as accessible props for test assertions
        accessibilityHint={`color:${props.color},fill:${props.fill}`}
        {...props}
      />
    ),
  };
});

import { StarRating } from "../StarRating";

// ── Tests ────────────────────────────────────────────────────────────

describe("StarRating", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders 5 star buttons", () => {
    // The rating component should always show exactly 5 stars,
    // numbered 1 through 5, regardless of the current value.
    render(<StarRating value={0} onChange={mockOnChange} />);

    expect(screen.getByTestId("star-1")).toBeOnTheScreen();
    expect(screen.getByTestId("star-2")).toBeOnTheScreen();
    expect(screen.getByTestId("star-3")).toBeOnTheScreen();
    expect(screen.getByTestId("star-4")).toBeOnTheScreen();
    expect(screen.getByTestId("star-5")).toBeOnTheScreen();
  });

  it("tapping a star calls onChange with that star's number", () => {
    // When the user taps star 3, onChange should fire with value 3.
    // This lets the parent component update its state to reflect
    // the user's rating choice.
    render(<StarRating value={0} onChange={mockOnChange} />);

    fireEvent.press(screen.getByTestId("star-3"));

    expect(mockOnChange).toHaveBeenCalledWith(3);
    expect(mockOnChange).toHaveBeenCalledTimes(1);
  });

  it("tapping the currently selected star deselects it (onChange with 0)", () => {
    // Toggle behavior: if value is already 3 and the user taps star 3
    // again, it should deselect by calling onChange(0). This lets users
    // clear their rating without needing a separate "clear" button.
    render(<StarRating value={3} onChange={mockOnChange} />);

    fireEvent.press(screen.getByTestId("star-3"));

    expect(mockOnChange).toHaveBeenCalledWith(0);
  });

  it("uses i18n accessibility labels", () => {
    // Each star should have an i18n-resolved label like "Rate 3 of 5 stars"
    // so screen readers announce the purpose in the user's language.
    render(<StarRating value={0} onChange={mockOnChange} />);

    const star3 = screen.getByTestId("star-3");
    expect(star3.props.accessibilityLabel).toBe("Rate 3 of 5 stars");
  });

  it("shows gold fill for selected stars and gray for unselected", () => {
    // When value=3, stars 1-3 should be gold (#F59E0B) and filled,
    // while stars 4-5 should be gray (#6B7280) and not filled.
    // We verify this via the accessibilityHint we set on the mock icon.
    render(<StarRating value={3} onChange={mockOnChange} />);

    const icons = screen.getAllByTestId("mock-star-icon");
    expect(icons).toHaveLength(5);

    // Stars 1-3 should be gold and filled
    expect(icons[0].props.accessibilityHint).toContain("color:#F59E0B");
    expect(icons[0].props.accessibilityHint).toContain("fill:#F59E0B");
    expect(icons[1].props.accessibilityHint).toContain("color:#F59E0B");
    expect(icons[2].props.accessibilityHint).toContain("color:#F59E0B");

    // Stars 4-5 should be gray and not filled
    expect(icons[3].props.accessibilityHint).toContain("color:#6B7280");
    expect(icons[3].props.accessibilityHint).toContain("fill:none");
    expect(icons[4].props.accessibilityHint).toContain("color:#6B7280");
    expect(icons[4].props.accessibilityHint).toContain("fill:none");
  });
});
