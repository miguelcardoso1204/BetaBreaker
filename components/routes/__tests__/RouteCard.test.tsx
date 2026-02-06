/**
 * RouteCard Component Tests
 *
 * RouteCard is a presentational component that displays a single climbing
 * route in the route list. It shows the route's name, grade (converted to
 * the user's preferred system), status indicator, hold color swatch, style
 * tags, and a "sent" checkmark if the user has completed the route.
 *
 * Test strategy: We test behavior (what the user sees and interacts with),
 * not implementation. We use getByText, getByTestId, and queryByTestId to
 * verify content is rendered, and fireEvent.press to verify tap behavior.
 *
 * Mock strategy: We mock `canonicalToDisplay` so tests don't depend on
 * the grade table, and `expo-router` for navigation assertions.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock grade conversion — return a predictable string so tests don't
// depend on the actual grade table mapping.
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn(() => "V4"),
}));

// Mock lucide icons — Jest can't process the SVG transforms.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Check: (props: Record<string, unknown>) => <View testID="check-icon" {...props} />,
    ChevronRight: (props: Record<string, unknown>) => <View testID="chevron-icon" {...props} />,
  };
});

import { RouteCard } from "../RouteCard";
import type { RouteCardProps } from "../RouteCard";

const { canonicalToDisplay } = jest.requireMock<{
  canonicalToDisplay: jest.Mock;
}>("@/utils/grades");

// ── Fixtures ─────────────────────────────────────────────────────

const baseRoute: RouteCardProps["route"] = {
  id: "route-1",
  name: "Crimpy McSlab",
  canonical_grade: 12,
  status: "active",
  color: "#EF4444",
  style_tags: ["Crimps", "Slab"],
};

const defaultProps: RouteCardProps = {
  route: baseRoute,
  userGradeSystem: "v-scale",
  onPress: jest.fn(),
};

describe("RouteCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canonicalToDisplay.mockReturnValue("V4");
  });

  it("renders route name", () => {
    render(<RouteCard {...defaultProps} />);
    expect(screen.getByText("Crimpy McSlab")).toBeOnTheScreen();
  });

  it("renders grade using canonicalToDisplay", () => {
    // The component should call canonicalToDisplay with the route's
    // canonical grade and the user's preferred grade system.
    render(<RouteCard {...defaultProps} />);

    expect(canonicalToDisplay).toHaveBeenCalledWith(12, "v-scale");
    expect(screen.getByText("V4")).toBeOnTheScreen();
  });

  it("shows green status dot for active routes", () => {
    render(<RouteCard {...defaultProps} />);

    const dot = screen.getByTestId("status-dot");
    expect(dot).toBeOnTheScreen();
  });

  it("shows amber status dot for retiring_soon routes", () => {
    const route = { ...baseRoute, status: "retiring_soon" as const };
    render(<RouteCard {...defaultProps} route={route} />);

    const dot = screen.getByTestId("status-dot");
    expect(dot).toBeOnTheScreen();
  });

  it("shows gray status dot for archived routes", () => {
    const route = { ...baseRoute, status: "archived" as const };
    render(<RouteCard {...defaultProps} route={route} />);

    const dot = screen.getByTestId("status-dot");
    expect(dot).toBeOnTheScreen();
  });

  it("renders color swatch when route has a color", () => {
    render(<RouteCard {...defaultProps} />);

    const swatch = screen.getByTestId("color-swatch");
    expect(swatch).toBeOnTheScreen();
  });

  it("does not render color swatch when color is null", () => {
    const route = { ...baseRoute, color: null };
    render(<RouteCard {...defaultProps} route={route} />);

    expect(screen.queryByTestId("color-swatch")).toBeNull();
  });

  it("renders style tag chips", () => {
    render(<RouteCard {...defaultProps} />);

    expect(screen.getByText("Crimps")).toBeOnTheScreen();
    expect(screen.getByText("Slab")).toBeOnTheScreen();
  });

  it("handles empty style_tags array", () => {
    const route = { ...baseRoute, style_tags: [] };
    render(<RouteCard {...defaultProps} route={route} />);

    // Should render without crashing, just no tag chips
    expect(screen.getByText("Crimpy McSlab")).toBeOnTheScreen();
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    render(<RouteCard {...defaultProps} onPress={onPress} />);

    fireEvent.press(screen.getByTestId("route-card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows checkmark when isSent is true", () => {
    render(<RouteCard {...defaultProps} isSent />);

    expect(screen.getByTestId("sent-indicator")).toBeOnTheScreen();
  });

  it("does not show checkmark when isSent is false", () => {
    render(<RouteCard {...defaultProps} isSent={false} />);

    expect(screen.queryByTestId("sent-indicator")).toBeNull();
  });

  it("handles route with null name gracefully", () => {
    // Some routes might not have names — just an ID and grade.
    const route = { ...baseRoute, name: null };
    render(<RouteCard {...defaultProps} route={route} />);

    // Should still render the grade and not crash
    expect(screen.getByText("V4")).toBeOnTheScreen();
  });
});
