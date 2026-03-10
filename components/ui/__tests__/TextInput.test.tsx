// components/ui/__tests__/TextInput.test.tsx
//
// Unit tests for the AppTextInput component — a styled text input for forms.
//
// These tests use @testing-library/react-native, which encourages testing
// behavior (what the user sees and can do) rather than implementation details.

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { AppTextInput } from "../TextInput";

// Mock lucide-react-native — Jest can't process native SVG transforms.
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

  it("renders with placeholder from label", () => {
    // When no explicit placeholder is given, the label text is used
    // as the placeholder so callers only need to pass one string.
    render(<AppTextInput label="Email" onChangeText={() => {}} value="" />);
    expect(screen.getByPlaceholderText("Email")).toBeOnTheScreen();
  });

  it("renders with explicit placeholder", () => {
    // An explicit placeholder overrides the label for the displayed text,
    // while the label is still used for accessibility.
    render(
      <AppTextInput
        label="Email"
        onChangeText={() => {}}
        value=""
        placeholder="your@email.com"
      />
    );
    expect(screen.getByPlaceholderText("your@email.com")).toBeOnTheScreen();
  });

  // -- Value --

  it("displays the current value", () => {
    render(
      <AppTextInput label="Name" onChangeText={() => {}} value="Alex" />
    );
    expect(screen.getByDisplayValue("Alex")).toBeOnTheScreen();
  });

  // -- Interaction --

  it("calls onChangeText when text changes", () => {
    const onChangeText = jest.fn();
    render(
      <AppTextInput
        label="Email"
        onChangeText={onChangeText}
        value=""
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
    render(
      <AppTextInput label="Password" onChangeText={() => {}} value="" />
    );
    expect(screen.queryByText("Password is required")).not.toBeOnTheScreen();
  });

  // -- Props passthrough --

  it("supports secureTextEntry for passwords", () => {
    render(
      <AppTextInput
        label="Password"
        onChangeText={() => {}}
        value="secret"
        secureTextEntry
      />
    );
    expect(screen.getByPlaceholderText("Password")).toBeOnTheScreen();
  });

  it("supports disabled state", () => {
    render(
      <AppTextInput
        label="Locked"
        onChangeText={() => {}}
        value="read only"
        editable={false}
      />
    );
    expect(screen.getByPlaceholderText("Locked")).toBeOnTheScreen();
  });

  // -- Icons --

  it("renders left icon when leftIcon prop is provided", () => {
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

  it("shows password toggle when secureTextEntry is true", () => {
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
    render(
      <AppTextInput
        label="Password"
        value="secret"
        onChangeText={() => {}}
        secureTextEntry
      />
    );
    const toggle = screen.getByTestId("password-toggle");

    // Initially shows EyeOff — password is hidden
    expect(screen.getByText("EyeOffIcon")).toBeOnTheScreen();

    // Press to show password — icon switches to Eye
    fireEvent.press(toggle);
    expect(screen.getByText("EyeIcon")).toBeOnTheScreen();

    // Press again to hide — icon switches back to EyeOff
    fireEvent.press(toggle);
    expect(screen.getByText("EyeOffIcon")).toBeOnTheScreen();
  });

  // -- Accessibility --

  it("input is findable by its label text via accessibilityLabel", () => {
    render(
      <AppTextInput
        label="Email"
        value=""
        onChangeText={() => {}}
      />
    );
    expect(screen.getByLabelText("Email")).toBeOnTheScreen();
  });

  // -- No regression --

  it("renders without icons when no icon props provided", () => {
    render(
      <AppTextInput
        label="Plain"
        value=""
        onChangeText={() => {}}
      />
    );
    expect(screen.queryByText("MailIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("LockIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("EyeIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("EyeOffIcon")).not.toBeOnTheScreen();
    expect(screen.getByPlaceholderText("Plain")).toBeOnTheScreen();
  });
});
