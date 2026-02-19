/**
 * SuggestionsCard Component Tests
 *
 * Tests the presentational component for personalized route suggestions.
 * This component is purely presentational — it receives scored routes as
 * props and renders them in a horizontal FlatList.
 *
 * Mock strategy:
 *   - lucide-react-native icons (SVG processing unsupported in Jest)
 *   - canonicalToDisplay for controlled grade strings
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    RefreshCw: (props: any) => <View testID="icon-refresh" {...props} />,
  };
});

// Mock color name utility — return fixed color name keys
jest.mock("@/utils/colorNames", () => ({
  hexToColorName: (hex: string | null) =>
    hex ? `colors.${hex === "#EF4444" ? "red" : hex === "#3B82F6" ? "blue" : "green"}` : "colors.unknown",
}));

// Mock accessibility store — mutable so tests can toggle color-aware mode
const mockAccessibilityState = {
  colorAwareMode: false,
  setColorAwareMode: jest.fn(),
};

jest.mock("@/stores", () => ({
  useAccessibilityStore: (selector: (s: any) => any) =>
    selector(mockAccessibilityState),
}));

jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: (grade: number, system: string) => {
    // Simplified mapping for tests
    const grades: Record<number, Record<string, string>> = {
      8: { "v-scale": "V3" },
      10: { "v-scale": "V4" },
      12: { "v-scale": "V5" },
    };
    return grades[grade]?.[system] ?? `G${grade}`;
  },
}));

import { SuggestionsCard } from "../SuggestionsCard";
import type { ScoredRoute } from "@/utils/suggestions";

// ── Fixtures ────────────────────────────────────────────────────

const sampleSuggestions: ScoredRoute[] = [
  {
    id: "r1",
    name: "Overhang Blitz",
    canonical_grade: 12,
    color: "#EF4444",
    status: "active",
    tags: ["overhang", "crimpy"],
    score: 3,
  },
  {
    id: "r2",
    name: "Dyno King",
    canonical_grade: 10,
    color: "#3B82F6",
    status: "active",
    tags: ["dyno"],
    score: 2,
  },
  {
    id: "r3",
    name: "Slab Waltz",
    canonical_grade: 8,
    color: "#22C55E",
    status: "active",
    tags: [],
    score: 0,
  },
];

// ── Tests ───────────────────────────────────────────────────────

describe("SuggestionsCard", () => {
  beforeEach(() => {
    mockAccessibilityState.colorAwareMode = false;
  });

  it("renders route names", () => {
    render(
      <SuggestionsCard
        suggestions={sampleSuggestions}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={false}
      />
    );

    expect(screen.getByText("Overhang Blitz")).toBeOnTheScreen();
    expect(screen.getByText("Dyno King")).toBeOnTheScreen();
    expect(screen.getByText("Slab Waltz")).toBeOnTheScreen();
  });

  it("renders grade labels using the provided grade system", () => {
    render(
      <SuggestionsCard
        suggestions={sampleSuggestions}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={false}
      />
    );

    expect(screen.getByText("V5")).toBeOnTheScreen();
    expect(screen.getByText("V4")).toBeOnTheScreen();
    expect(screen.getByText("V3")).toBeOnTheScreen();
  });

  it("renders up to 2 style tag chips per route", () => {
    render(
      <SuggestionsCard
        suggestions={sampleSuggestions}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={false}
      />
    );

    // r1 has "overhang" and "crimpy" tags — both should render
    expect(screen.getByText("overhang")).toBeOnTheScreen();
    expect(screen.getByText("crimpy")).toBeOnTheScreen();
    // r2 has "dyno"
    expect(screen.getByText("dyno")).toBeOnTheScreen();
  });

  it("calls onRoutePress with the route ID when a card is pressed", () => {
    const onRoutePress = jest.fn();

    render(
      <SuggestionsCard
        suggestions={sampleSuggestions}
        gradeSystem="v-scale"
        onRoutePress={onRoutePress}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={false}
      />
    );

    fireEvent.press(screen.getByText("Overhang Blitz"));
    expect(onRoutePress).toHaveBeenCalledWith("r1");
  });

  it("calls onRefresh when the refresh button is pressed", () => {
    const onRefresh = jest.fn();

    render(
      <SuggestionsCard
        suggestions={sampleSuggestions}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={onRefresh}
        hasMore={true}
        isLoading={false}
      />
    );

    fireEvent.press(screen.getByRole("button", { name: "Refresh suggestions" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when suggestions is empty", () => {
    render(
      <SuggestionsCard
        suggestions={[]}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={false}
      />
    );

    expect(
      screen.getByText("Log some sends to get personalized suggestions")
    ).toBeOnTheScreen();
  });

  it("shows loading indicator when isLoading is true", () => {
    render(
      <SuggestionsCard
        suggestions={[]}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={true}
      />
    );

    expect(screen.getByTestId("suggestions-loading")).toBeOnTheScreen();
  });

  it("renders testID on the outer container", () => {
    render(
      <SuggestionsCard
        suggestions={sampleSuggestions}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={false}
        testID="suggestions-card"
      />
    );

    expect(screen.getByTestId("suggestions-card")).toBeOnTheScreen();
  });

  // ── Color-Aware Mode ──────────────────────────────────────────────

  it("shows color name text when colorAwareMode is enabled", () => {
    // When the accessibility store has color-aware mode on, each route
    // card should display the color name as text next to the swatch.
    mockAccessibilityState.colorAwareMode = true;

    render(
      <SuggestionsCard
        suggestions={sampleSuggestions}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={false}
      />
    );

    // r1 has color #EF4444 → hexToColorName returns "colors.red" → i18n resolves to "Red"
    // The color name appears as both accessibilityLabel and visible text, so multiple matches
    expect(screen.getAllByText("Red").length).toBeGreaterThanOrEqual(1);
  });

  it("hides color name text when colorAwareMode is disabled", () => {
    mockAccessibilityState.colorAwareMode = false;

    render(
      <SuggestionsCard
        suggestions={sampleSuggestions}
        gradeSystem="v-scale"
        onRoutePress={jest.fn()}
        onRefresh={jest.fn()}
        hasMore={false}
        isLoading={false}
      />
    );

    // Without color-aware mode, there should be no visible "Red" text
    // (the accessibilityLabel on the swatch View doesn't render as text)
    expect(screen.queryByText("Red")).toBeNull();
  });
});
