// components/ui/__tests__/TextInput.test.tsx
//
// Unit tests for the AppTextInput component — a styled text input for forms.
//
// These tests use @testing-library/react-native, which encourages testing
// behavior (what the user sees and can do) rather than implementation details
// (internal state, class names). We query by text content, placeholder,
// display value, and testID — not by component internals.
//
// Test categories:
//   1. Rendering — does the input show a label and placeholder?
//   2. Value — does the input display the current controlled value?
//   3. Interaction — does onChangeText fire when the user types?
//   4. Validation — does an error message appear when provided?
//   5. Props — do secureTextEntry and editable pass through correctly?

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { AppTextInput } from "../TextInput";

describe("AppTextInput", () => {
  // -- Rendering --

  it("renders with label", () => {
    // The label text above the input should be visible to the user.
    // Labels are essential for accessibility — screen readers announce
    // the label so the user knows what the field is for.
    render(<AppTextInput label="Email" onChangeText={() => {}} value="" />);
    expect(screen.getByText("Email")).toBeOnTheScreen();
  });

  it("renders the text input", () => {
    // The placeholder text should be visible when the input is empty.
    // We use getByPlaceholderText because it's the most semantic way
    // to find an input — it matches what the user actually sees.
    render(
      <AppTextInput
        label="Username"
        onChangeText={() => {}}
        value=""
        placeholder="Enter username"
      />
    );
    expect(screen.getByPlaceholderText("Enter username")).toBeOnTheScreen();
  });

  // -- Value --

  it("displays the current value", () => {
    // React Native inputs are "controlled components" — the parent passes
    // the value prop and handles changes via onChangeText. This test
    // verifies that the displayed value matches what we pass in.
    render(
      <AppTextInput label="Name" onChangeText={() => {}} value="Alex" />
    );
    expect(screen.getByDisplayValue("Alex")).toBeOnTheScreen();
  });

  // -- Interaction --

  it("calls onChangeText when text changes", () => {
    // jest.fn() creates a mock function that records calls.
    // We simulate the user typing and verify the callback is invoked
    // with the new text value — this is how controlled inputs work.
    const onChangeText = jest.fn();
    render(
      <AppTextInput
        label="Email"
        onChangeText={onChangeText}
        value=""
        placeholder="Email"
      />
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Email"),
      "test@example.com"
    );
    expect(onChangeText).toHaveBeenCalledWith("test@example.com");
  });

  // -- Validation --

  it("displays error message", () => {
    // When form validation fails, we show a red error message below the
    // input. This test verifies the error text is rendered when the
    // `error` prop is provided.
    render(
      <AppTextInput
        label="Password"
        onChangeText={() => {}}
        value=""
        error="Password is required"
      />
    );
    expect(screen.getByText("Password is required")).toBeOnTheScreen();
  });

  it("hides error when not provided", () => {
    // When there's no error, the error text should not be in the tree.
    // queryByText returns null instead of throwing (unlike getByText),
    // making it ideal for asserting absence.
    render(
      <AppTextInput label="Password" onChangeText={() => {}} value="" />
    );
    expect(screen.queryByText("Password is required")).not.toBeOnTheScreen();
  });

  // -- Props passthrough --

  it("supports secureTextEntry for passwords", () => {
    // secureTextEntry tells React Native to mask the input text with dots.
    // We can't easily test the visual masking in JSDOM, but we verify
    // the component renders without crashing when the prop is passed.
    render(
      <AppTextInput
        label="Password"
        onChangeText={() => {}}
        value="secret"
        secureTextEntry
        placeholder="Password"
      />
    );
    expect(screen.getByPlaceholderText("Password")).toBeOnTheScreen();
  });

  it("supports disabled state", () => {
    // editable={false} makes the input non-interactive — the user can
    // see the value but can't change it. Useful for read-only fields
    // or locked form states. We verify it renders without crashing.
    render(
      <AppTextInput
        label="Locked"
        onChangeText={() => {}}
        value="read only"
        editable={false}
        placeholder="Locked"
      />
    );
    expect(screen.getByPlaceholderText("Locked")).toBeOnTheScreen();
  });
});
