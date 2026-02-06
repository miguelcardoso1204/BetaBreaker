// components/ui/__tests__/IconButton.test.tsx
//
// Unit tests for the IconButton component — an icon-only action button.
//
// IconButton is used for actions where an icon alone communicates the intent:
// favorite/star toggles, share buttons, close/dismiss buttons, etc.
// The `label` prop provides an accessibility label so screen readers can
// announce the button's purpose even though no text is visible.
//
// WHY MOCK LUCIDE-REACT-NATIVE?
// Lucide icons are SVG-based components. Jest runs in a Node.js environment
// without native SVG support, so importing them directly would crash.
// We replace each icon with a simple <Text> element that renders the icon's
// name — enough to verify the component renders and passes props through,
// without needing a full SVG rendering pipeline.

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { IconButton } from "../IconButton";

// Mock the entire lucide-react-native module.
// jest.mock() is "hoisted" — it runs before any imports — so the mock
// is already in place when IconButton tries to use icon components.
jest.mock("lucide-react-native", () => ({
  Heart: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>HeartIcon</Text>;
  },
  Star: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>StarIcon</Text>;
  },
}));

describe("IconButton", () => {
  // -- Rendering --

  it("renders with an icon", () => {
    // Verify the component renders as a button with the correct accessibility label.
    // The `name` option checks that accessibilityLabel matches "Like".
    const { Heart } = require("lucide-react-native");
    render(<IconButton icon={Heart} label="Like" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Like" })).toBeOnTheScreen();
  });

  // -- Interaction --

  it("calls onPress when pressed", () => {
    // jest.fn() creates a mock function that tracks calls.
    // After pressing the button, we assert the mock was called exactly once.
    const { Heart } = require("lucide-react-native");
    const onPress = jest.fn();
    render(<IconButton icon={Heart} label="Like" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    // A disabled IconButton should ignore presses entirely.
    // This prevents accidental double-taps or actions on stale UI.
    const { Heart } = require("lucide-react-native");
    const onPress = jest.fn();
    render(
      <IconButton icon={Heart} label="Like" onPress={onPress} disabled />
    );
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  // -- Different icons --

  it("accepts different icons", () => {
    // IconButton should work with any Lucide icon component.
    // Here we pass Star instead of Heart to verify the `icon` prop
    // is generic — it renders whatever icon you give it.
    const { Star } = require("lucide-react-native");
    render(<IconButton icon={Star} label="Favorite" onPress={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Favorite" })
    ).toBeOnTheScreen();
  });
});
