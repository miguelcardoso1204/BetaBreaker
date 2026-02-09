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
//   6. Icons — do leftIcon and rightIcon render correctly?
//   7. Password toggle — does tapping the eye icon toggle visibility?

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { AppTextInput } from "../TextInput";

// Mock the entire lucide-react-native module.
// jest.mock() is "hoisted" — it runs before any imports — so the mock
// is already in place when AppTextInput tries to render icon components.
//
// WHY MOCK ICONS?
// Lucide icons are SVG-based components that require native rendering.
// Jest runs in Node.js without native SVG support, so importing them
// directly would crash. We replace each icon with a simple <Text> that
// renders the icon's name — enough to verify the icon prop is used
// without needing a full SVG rendering pipeline.
//
// WHY require() INSIDE THE FACTORY?
// jest.mock() factories are hoisted above all imports by Babel. Any
// variables defined outside (including imports) are in the "temporal
// dead zone" when the factory runs. Using require() inside the factory
// ensures React Native's Text component is available at mock creation time.
jest.mock("lucide-react-native", () => ({
  Mail: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>MailIcon</Text>;
  },
  Lock: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>LockIcon</Text>;
  },
  Eye: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>EyeIcon</Text>;
  },
  EyeOff: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>EyeOffIcon</Text>;
  },
}));

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

  // -- Icons --
  // These tests verify leftIcon and rightIcon props, which allow forms
  // to show contextual icons inside the input field (e.g., a mail icon
  // for email, a lock icon for password). Icons improve scannability
  // and help users identify fields at a glance.

  it("renders left icon when leftIcon prop is provided", () => {
    // The leftIcon prop accepts a Lucide icon component and renders it
    // on the left side of the input field. Common use: email field with
    // a mail icon, search field with a magnifying glass.
    const { Mail } = require("lucide-react-native");
    render(
      <AppTextInput
        label="Email"
        value=""
        onChangeText={() => {}}
        leftIcon={Mail}
      />
    );
    expect(screen.getByText("MailIcon")).toBeOnTheScreen();
  });

  it("renders right icon when rightIcon prop is provided", () => {
    // The rightIcon prop renders an icon on the right side of the input.
    // Useful for status indicators or action hints (e.g., a lock icon
    // to indicate a secure field, a clear button, etc.).
    const { Lock } = require("lucide-react-native");
    render(
      <AppTextInput
        label="Code"
        value=""
        onChangeText={() => {}}
        rightIcon={Lock}
      />
    );
    expect(screen.getByText("LockIcon")).toBeOnTheScreen();
  });

  // -- Password toggle --
  // Password fields need a "show/hide" toggle so users can verify what
  // they typed. This is a standard UX pattern — an eye icon that switches
  // between masked (dots) and plain text. The toggle is only shown when
  // secureTextEntry is true, keeping the input clean for non-password fields.

  it("shows password toggle when secureTextEntry is true", () => {
    // When secureTextEntry is passed, the component should render a
    // pressable toggle button (identified by testID="password-toggle").
    // This button lets users reveal their password to check for typos.
    render(
      <AppTextInput
        label="Password"
        value="secret"
        onChangeText={() => {}}
        secureTextEntry
      />
    );
    expect(screen.getByTestId("password-toggle")).toBeOnTheScreen();
  });

  it("toggles password visibility when eye icon is pressed", () => {
    // The toggle should cycle between EyeOff (password hidden, the default)
    // and Eye (password visible). This uses internal component state —
    // one of the few places where local state is appropriate, because
    // the parent doesn't need to know whether the password is currently
    // visible or hidden.
    render(
      <AppTextInput
        label="Password"
        value="secret"
        onChangeText={() => {}}
        secureTextEntry
        placeholder="Enter password"
      />
    );
    const toggle = screen.getByTestId("password-toggle");

    // Initially shows EyeOff — password is hidden (secure mode is on)
    expect(screen.getByText("EyeOffIcon")).toBeOnTheScreen();

    // Press to show password — icon switches to Eye (secure mode is off)
    fireEvent.press(toggle);
    expect(screen.getByText("EyeIcon")).toBeOnTheScreen();

    // Press again to hide — icon switches back to EyeOff (secure mode on)
    fireEvent.press(toggle);
    expect(screen.getByText("EyeOffIcon")).toBeOnTheScreen();
  });

  // -- No regression --

  it("renders without icons when no icon props provided", () => {
    // When no icon props are passed, the input should be a clean text
    // field with no icon elements in the tree. This ensures the icon
    // feature is additive — it doesn't break existing inputs that
    // don't need icons.
    render(
      <AppTextInput
        label="Plain"
        value=""
        onChangeText={() => {}}
        placeholder="No icons"
      />
    );
    expect(screen.queryByText("MailIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("LockIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("EyeIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("EyeOffIcon")).not.toBeOnTheScreen();
    expect(screen.getByPlaceholderText("No icons")).toBeOnTheScreen();
  });
});
