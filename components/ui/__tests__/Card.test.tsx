// components/ui/__tests__/Card.test.tsx
//
// Unit tests for the Card component — a container for grouping related content.
//
// Cards are used throughout Beta Breaker for route browse cards, gym navigation
// cards, and leaderboard entries. They come in three visual variants:
//   - "default": Dark surface background, no border (most common usage).
//   - "elevated": Lighter surface for emphasis (selected or highlighted items).
//   - "outlined": Transparent with a border (list items, leaderboard entries).
//
// Cards can optionally be pressable — when an `onPress` prop is provided, the
// card wraps its children in a Pressable instead of a plain View. This is how
// route cards become tappable to navigate to route details.
//
// Testing approach:
// We use @testing-library/react-native to test behavior (what the user sees
// and can do), not implementation details (which RN component is used internally).
// We verify:
//   1. Children render correctly inside the card.
//   2. Pressable cards fire onPress when tapped.
//   3. Static cards (no onPress) render without crash.
//   4. Each variant renders without crash.

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { Card } from "../Card";

describe("Card", () => {
  // -- Rendering --

  it("renders children", () => {
    // The most basic test: does the Card pass through and display its children?
    // This verifies the component doesn't swallow or hide child content.
    render(
      <Card>
        <Text>Card content</Text>
      </Card>
    );
    expect(screen.getByText("Card content")).toBeOnTheScreen();
  });

  // -- Interaction --

  it("is pressable when onPress is provided", () => {
    // When a card has an onPress handler, it becomes interactive.
    // This is used for route cards that navigate to the route detail screen.
    // jest.fn() creates a mock function so we can verify it was called.
    const onPress = jest.fn();
    render(
      <Card onPress={onPress} testID="card">
        <Text>Pressable card</Text>
      </Card>
    );
    fireEvent.press(screen.getByTestId("card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is not pressable when onPress is not provided", () => {
    // Without an onPress prop, the Card renders as a static View container.
    // This test just ensures it still renders its children without crashing.
    // There's no press event to test — we just verify the content appears.
    render(
      <Card testID="card">
        <Text>Static card</Text>
      </Card>
    );
    expect(screen.getByText("Static card")).toBeOnTheScreen();
  });

  // -- Variants --
  // Variants change the visual style (background color, border) but not behavior.
  // We verify each variant renders without crashing and displays content.

  it("renders elevated variant", () => {
    // "elevated" uses a lighter surface color (#252536) to make the card
    // stand out from the default surface — used for selected/highlighted items.
    render(
      <Card variant="elevated" testID="card">
        <Text>Elevated</Text>
      </Card>
    );
    expect(screen.getByText("Elevated")).toBeOnTheScreen();
  });

  it("renders outlined variant", () => {
    // "outlined" uses a transparent background with a border — used for
    // leaderboard entries and list items where a subtle boundary is needed.
    render(
      <Card variant="outlined" testID="card">
        <Text>Outlined</Text>
      </Card>
    );
    expect(screen.getByText("Outlined")).toBeOnTheScreen();
  });
});
