// components/ui/__tests__/Button.test.tsx
//
// Unit tests for the Button component — the primary action button in Beta Breaker.
//
// These tests use @testing-library/react-native, which encourages testing
// behavior (what the user sees and can do) rather than implementation details
// (internal state, class names). This means we query by accessibility role,
// text content, and testID — not by component internals.
//
// Test categories:
//   1. Rendering — does the button show the correct label text?
//   2. Accessibility — does it have the right role and states?
//   3. Variants — can we render primary, outline, and ghost styles?
//   4. Sizes — can we render sm, md, and lg sizes?
//   5. Interaction — does onPress fire? Is it blocked when disabled/loading?
//   6. Loading — does the spinner appear and block interaction?

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Button } from "../Button";

describe("Button", () => {
  // -- Rendering --

  it("renders with label text", () => {
    render(<Button label="Sign in" onPress={() => {}} />);
    // The button should display the label text so users know what it does
    expect(screen.getByText("Sign in")).toBeOnTheScreen();
  });

  it("has button accessibility role", () => {
    render(<Button label="Submit" onPress={() => {}} />);
    // Accessibility role "button" tells screen readers this is an interactive element.
    // The { name: "Submit" } option checks the accessibilityLabel matches.
    expect(screen.getByRole("button", { name: "Submit" })).toBeOnTheScreen();
  });

  // -- Variants --
  // Variants change the visual style but not the behavior.
  // We just verify each variant renders without crashing and has the button role.

  it("renders primary variant by default", () => {
    render(<Button label="Primary" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  it("renders outline variant", () => {
    render(<Button label="Outline" variant="outline" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  it("renders ghost variant", () => {
    render(<Button label="Ghost" variant="ghost" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  // -- Sizes --
  // Size presets control padding and text size. Again, we verify they render.

  it("renders small size", () => {
    render(<Button label="Small" size="sm" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  it("renders large size", () => {
    render(<Button label="Large" size="lg" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  // -- Interaction --

  it("calls onPress when pressed", () => {
    // jest.fn() creates a mock function that records calls.
    // We use it to verify the callback fires exactly once on press.
    const onPress = jest.fn();
    render(<Button label="Tap me" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    // A disabled button should be visually dimmed AND non-interactive.
    // This test ensures the onPress callback is never invoked.
    const onPress = jest.fn();
    render(<Button label="Disabled" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("is marked as disabled for accessibility", () => {
    // Screen readers need to know the button is disabled so they can
    // announce it properly. We check accessibilityState.disabled is true.
    render(<Button label="Nope" onPress={() => {}} disabled />);
    expect(
      screen.getByRole("button", { name: "Nope", disabled: true })
    ).toBeOnTheScreen();
  });

  // -- Loading --

  it("shows loading indicator when loading", () => {
    // When a network request is in flight, we show a spinner instead of
    // the label text. The testID lets us find the loading indicator.
    render(<Button label="Save" onPress={() => {}} loading />);
    expect(screen.getByTestId("button-loading")).toBeOnTheScreen();
  });

  it("does not call onPress when loading", () => {
    // Just like disabled, a loading button should ignore presses
    // to prevent duplicate submissions.
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} loading />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
