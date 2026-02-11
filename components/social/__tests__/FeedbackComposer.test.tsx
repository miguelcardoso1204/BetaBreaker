/**
 * FeedbackComposer Component Tests
 *
 * Tests the simple form for submitting a new beta tip:
 *   - TextInput for the tip body
 *   - Submit button (disabled when empty)
 *   - Clears input after successful submission
 *
 * The composer is a controlled presentational component — the parent
 * provides onSubmit and isSubmitting, while the component manages
 * the text input state internally (the parent doesn't need to know
 * the draft text until submission).
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// Mock lucide-react-native — some icons may be used in child components
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Send: (props: any) => <View testID="icon-send" {...props} />,
    Eye: (props: any) => <View testID="icon-eye" {...props} />,
    EyeOff: (props: any) => <View testID="icon-eyeoff" {...props} />,
  };
});

import { FeedbackComposer } from "../FeedbackComposer";

// ── Tests ─────────────────────────────────────────────────────────

describe("FeedbackComposer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders text input and submit button", () => {
    // The composer should show both the input field and the submit button.
    render(<FeedbackComposer onSubmit={jest.fn()} isSubmitting={false} />);

    expect(
      screen.getByPlaceholderText("Share a tip for this route...")
    ).toBeOnTheScreen();
    expect(screen.getByTestId("submit-feedback-button")).toBeOnTheScreen();
  });

  it("submit button disabled when input is empty", () => {
    // Prevent submitting blank tips — the button should be non-interactive
    // when the text input is empty or whitespace-only.
    render(<FeedbackComposer onSubmit={jest.fn()} isSubmitting={false} />);

    const button = screen.getByTestId("submit-feedback-button");
    // React Native Pressable reports disabled via accessibilityState
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it("calls onSubmit with body text when submitted", () => {
    // When the user types a tip and taps submit, the onSubmit callback
    // should receive the trimmed text.
    const onSubmit = jest.fn();
    render(<FeedbackComposer onSubmit={onSubmit} isSubmitting={false} />);

    const input = screen.getByPlaceholderText("Share a tip for this route...");
    fireEvent.changeText(input, "Try the heel hook on the volume");

    fireEvent.press(screen.getByTestId("submit-feedback-button"));

    expect(onSubmit).toHaveBeenCalledWith("Try the heel hook on the volume");
  });

  it("clears input after successful submission", () => {
    // After the user submits, the input should reset to empty so they
    // can write another tip without manually clearing the field.
    const onSubmit = jest.fn();
    render(<FeedbackComposer onSubmit={onSubmit} isSubmitting={false} />);

    const input = screen.getByPlaceholderText("Share a tip for this route...");
    fireEvent.changeText(input, "Match on the big hold");
    fireEvent.press(screen.getByTestId("submit-feedback-button"));

    // Input should be cleared after submission
    expect(input.props.value).toBe("");
  });
});
