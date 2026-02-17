/**
 * StyleInsights Component Tests
 *
 * Tests the presentational radar chart component that visualizes a user's
 * climbing style distribution from crowd-sourced route tags.
 *
 * TESTING APPROACH:
 * These tests verify behavior, not SVG geometry. We check:
 *   1. Tag names render as labels
 *   2. Counts appear in the legend
 *   3. Empty state shows a placeholder message
 *   4. Legend entries have accessibility labels
 *   5. The data polygon renders
 *
 * react-native-svg is mocked because it's a native module that requires
 * the RN bridge (unavailable in Jest). We mock each SVG primitive as a
 * simple RN View/Text so the test can query the rendered output.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Mock react-native-svg ────────────────────────────────────────
// SVG components are native modules — Jest can't process them.
// Mock them as simple React Native components that pass through props.
jest.mock("react-native-svg", () => {
  const { View, Text } = require("react-native");

  // Create a minimal mock for each SVG component used by StyleInsights.
  // Each forwards testID and children so RNTL queries work.
  const Svg = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
    <View {...props}>{children}</View>;
  const Polygon = (props: Record<string, unknown>) =>
    <View {...props} />;
  const Line = (props: Record<string, unknown>) =>
    <View {...props} />;
  const Circle = (props: Record<string, unknown>) =>
    <View {...props} />;
  // SVG <Text> maps to RN <Text> so text content is queryable.
  const SvgText = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
    <Text {...props}>{children}</Text>;

  return {
    __esModule: true,
    default: Svg,
    Svg,
    Polygon,
    Line,
    Circle,
    Text: SvgText,
  };
});

import { StyleInsights } from "../StyleInsights";
import type { StyleInsightEntry } from "@/services/sessions.service";

// ── Fixtures ─────────────────────────────────────────────────────

/** Sample data with 4 style tags at various counts. */
const sampleData: StyleInsightEntry[] = [
  { tagName: "slab", category: "angle", count: 8 },
  { tagName: "crimpy", category: "hold_type", count: 5 },
  { tagName: "dyno", category: "movement", count: 3 },
  { tagName: "overhang", category: "angle", count: 6 },
];

// ── Tests ────────────────────────────────────────────────────────

describe("StyleInsights", () => {
  it("renders tag names as labels", () => {
    // Each tag in the data should appear as a label in the chart.
    // The SVG <Text> mock renders as RN <Text>, so we can query by text.
    render(<StyleInsights data={sampleData} />);

    expect(screen.getAllByText("slab").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("crimpy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("dyno").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("overhang").length).toBeGreaterThanOrEqual(1);
  });

  it("renders counts in the legend", () => {
    // The legend below the chart should show the exact count for each tag.
    render(<StyleInsights data={sampleData} />);

    expect(screen.getByText("8")).toBeOnTheScreen();
    expect(screen.getByText("5")).toBeOnTheScreen();
    expect(screen.getByText("3")).toBeOnTheScreen();
    expect(screen.getByText("6")).toBeOnTheScreen();
  });

  it("renders accessibility labels on legend entries", () => {
    // Each legend entry should have an accessibilityLabel combining
    // the tag name and count, so screen readers announce "slab: 8 routes".
    render(<StyleInsights data={sampleData} />);

    expect(screen.getByLabelText("slab: 8 routes")).toBeOnTheScreen();
    expect(screen.getByLabelText("crimpy: 5 routes")).toBeOnTheScreen();
    expect(screen.getByLabelText("dyno: 3 routes")).toBeOnTheScreen();
    expect(screen.getByLabelText("overhang: 6 routes")).toBeOnTheScreen();
  });

  it("renders the data polygon", () => {
    // The filled polygon connecting data points should be present.
    render(<StyleInsights data={sampleData} />);

    expect(screen.getByTestId("style-data-polygon")).toBeOnTheScreen();
  });

  it("renders empty state when data is empty", () => {
    // When the user has no tagged sends, show a helpful placeholder
    // instead of an empty/broken chart.
    render(<StyleInsights data={[]} />);

    expect(
      screen.getByText(
        "No style data yet — send tagged routes to see your climbing profile"
      )
    ).toBeOnTheScreen();
  });

  it("does not render data polygon when empty", () => {
    // Empty state should not render the SVG chart at all.
    render(<StyleInsights data={[]} />);

    expect(screen.queryByTestId("style-data-polygon")).toBeNull();
  });

  it("renders a single tag entry correctly", () => {
    // Edge case: only one tag. The radar should degenerate to a single
    // point, but it should still render without errors.
    const singleEntry: StyleInsightEntry[] = [
      { tagName: "techy", category: "movement", count: 4 },
    ];

    render(<StyleInsights data={singleEntry} />);

    expect(screen.getAllByText("techy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("4")).toBeOnTheScreen();
    expect(screen.getByLabelText("techy: 4 routes")).toBeOnTheScreen();
  });

  it("renders testID on the outer container", () => {
    // The testID prop allows parent screens to target the component.
    render(
      <StyleInsights
        data={sampleData}
        testID="style-insights"
      />
    );

    expect(screen.getByTestId("style-insights")).toBeOnTheScreen();
  });
});
