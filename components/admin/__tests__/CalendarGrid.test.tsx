/**
 * CalendarGrid Component Tests (Step 15.3)
 *
 * Tests the monthly calendar grid that admins use to view and select
 * dates for setting sessions. The grid shows:
 *   - Month/year header with navigation arrows
 *   - Day-of-week labels (Sun–Sat)
 *   - Date cells in a 7-column grid layout
 *   - Dot indicators on dates that have sessions
 *   - Selected date highlighting
 *
 * Mock strategy:
 *   - lucide-react-native: SVG icons → simple Text elements
 *   - date-fns: NOT mocked — we use real date math for correctness
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock lucide icons ─────────────────────────────────────────────────
jest.mock("lucide-react-native", () => ({
  ChevronLeft: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-ChevronLeft">ChevronLeft</Text>;
  },
  ChevronRight: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-ChevronRight">ChevronRight</Text>;
  },
}));

import CalendarGrid from "../CalendarGrid";

describe("CalendarGrid", () => {
  // Use a fixed month for deterministic tests — March 2026 starts on Sunday
  const march2026 = new Date(2026, 2, 1); // Month is 0-indexed

  const defaultProps = {
    currentMonth: march2026,
    sessionDates: [] as string[],
    selectedDate: null as string | null,
    onSelectDate: jest.fn(),
    onPrevMonth: jest.fn(),
    onNextMonth: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders month and year in header", () => {
    render(<CalendarGrid {...defaultProps} />);

    // March 2026 should be displayed in the header
    expect(screen.getByText("March 2026")).toBeTruthy();
  });

  it("renders day-of-week labels", () => {
    render(<CalendarGrid {...defaultProps} />);

    // Check that day labels are present
    expect(screen.getByText("Sun")).toBeTruthy();
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByText("Tue")).toBeTruthy();
    expect(screen.getByText("Wed")).toBeTruthy();
    expect(screen.getByText("Thu")).toBeTruthy();
    expect(screen.getByText("Fri")).toBeTruthy();
    expect(screen.getByText("Sat")).toBeTruthy();
  });

  it("renders date numbers for the month", () => {
    render(<CalendarGrid {...defaultProps} />);

    // March has 31 days — check a few key dates.
    // "1" appears twice (March 1st and possibly from adjacent months),
    // so use getAllByText for it; 15 and 31 are unique within the grid.
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("31")).toBeTruthy();
  });

  it("calls onPrevMonth when left arrow is tapped", () => {
    render(<CalendarGrid {...defaultProps} />);

    fireEvent.press(screen.getByTestId("prev-month"));
    expect(defaultProps.onPrevMonth).toHaveBeenCalledTimes(1);
  });

  it("calls onNextMonth when right arrow is tapped", () => {
    render(<CalendarGrid {...defaultProps} />);

    fireEvent.press(screen.getByTestId("next-month"));
    expect(defaultProps.onNextMonth).toHaveBeenCalledTimes(1);
  });

  it("calls onSelectDate when a date cell is tapped", () => {
    render(<CalendarGrid {...defaultProps} />);

    // Tap the "15" date cell
    fireEvent.press(screen.getByTestId("date-cell-2026-03-15"));
    expect(defaultProps.onSelectDate).toHaveBeenCalledWith("2026-03-15");
  });

  it("shows dot indicator for dates with sessions", () => {
    render(
      <CalendarGrid
        {...defaultProps}
        sessionDates={["2026-03-05", "2026-03-12"]}
      />
    );

    // Dates with sessions should have a dot indicator
    expect(screen.getByTestId("dot-2026-03-05")).toBeTruthy();
    expect(screen.getByTestId("dot-2026-03-12")).toBeTruthy();

    // Dates without sessions should NOT have a dot
    expect(screen.queryByTestId("dot-2026-03-15")).toBeNull();
  });

  it("highlights the selected date", () => {
    render(
      <CalendarGrid {...defaultProps} selectedDate="2026-03-10" />
    );

    // The selected cell should have a testID indicating selection
    expect(screen.getByTestId("selected-2026-03-10")).toBeTruthy();
  });
});
