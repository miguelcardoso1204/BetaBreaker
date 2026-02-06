// app/(auth)/__tests__/forgot-password.test.tsx
//
// Tests for the Forgot Password screen.
//
// We mock authService.resetPassword (not useAuth) because this screen
// calls the service layer directly — it doesn't need the full auth hook
// since password reset doesn't change the current session state.
//
// We also mock expo-router (Link + useRouter) and lucide-react-native
// icons, since these rely on native modules or SVG transforms that
// aren't available in the Jest test environment.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ForgotPasswordScreen from "../forgot-password";

// Mock lucide-react-native — Jest can't process the native SVG transforms
// that lucide uses. We replace each icon with a simple Text element so
// the test environment doesn't crash on import.
jest.mock("lucide-react-native", () => ({
  Mail: (props: any) => {
    const { Text } = require("react-native");
    return <Text>MailIcon</Text>;
  },
  ArrowLeft: (props: any) => {
    const { Text } = require("react-native");
    return <Text>ArrowLeftIcon</Text>;
  },
}));

// Mock authService.resetPassword — define the mock function INSIDE the
// factory to avoid the temporal dead zone issue (jest.mock is hoisted
// above all const/let declarations by Babel, so variables declared
// outside the factory would be undefined when the factory runs).
jest.mock("@/services/auth.service", () => ({
  authService: {
    resetPassword: jest.fn(),
  },
}));

// Mock expo-router — Link needs to render children as tappable text,
// and useRouter provides navigation methods. We don't test actual
// navigation here (that's an integration/E2E concern), just that
// the screen renders and interacts correctly.
jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
  }),
  Link: ({ children, ...props }: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>{children}</Text>;
  },
}));

describe("ForgotPasswordScreen", () => {
  beforeEach(() => {
    // Clear all mock call counts and return values between tests
    // so each test starts fresh with no leftover state.
    jest.clearAllMocks();
  });

  // -- Rendering tests --
  // Verify that all expected UI elements are present on initial render.

  it("renders the heading", () => {
    render(<ForgotPasswordScreen />);
    expect(screen.getByText(/reset password/i)).toBeOnTheScreen();
  });

  it("renders email input", () => {
    render(<ForgotPasswordScreen />);
    expect(screen.getByPlaceholderText(/email/i)).toBeOnTheScreen();
  });

  it("renders submit button", () => {
    render(<ForgotPasswordScreen />);
    // getByRole("button") uses the accessibilityRole set on our Button
    // component's Pressable. The { name } option matches the
    // accessibilityLabel (which is the button's `label` prop).
    expect(screen.getByRole("button", { name: /send/i })).toBeOnTheScreen();
  });

  // -- Validation tests --
  // The screen uses Zod via react-hook-form's zodResolver. When the
  // user enters an invalid email and presses submit, Zod's error
  // message should appear on screen.

  it("shows error for invalid email", async () => {
    render(<ForgotPasswordScreen />);
    // Type an invalid email (missing @ and domain)
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "bademail");
    // Press submit — triggers Zod validation via react-hook-form
    fireEvent.press(screen.getByRole("button", { name: /send/i }));

    // waitFor retries the assertion until it passes or times out.
    // This is needed because react-hook-form validation is async —
    // it runs the zodResolver in a microtask after the press event.
    await waitFor(() => {
      // Our Zod schema uses z.email("Please enter a valid email address"),
      // so the error message contains "valid email" rather than "invalid".
      expect(screen.getByText(/valid email/i)).toBeOnTheScreen();
    });
  });

  // -- Successful submission tests --

  it("calls resetPassword with email", async () => {
    // Access the mock through require (not import) because the mock
    // was defined inside the jest.mock factory. This is the standard
    // pattern when using hoisted mocks with jest-expo.
    const { authService } = require("@/services/auth.service");
    authService.resetPassword.mockResolvedValue({ data: {}, error: null });

    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.press(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(authService.resetPassword).toHaveBeenCalledWith("test@example.com");
    });
  });

  it("shows success message after sending", async () => {
    const { authService } = require("@/services/auth.service");
    authService.resetPassword.mockResolvedValue({ data: {}, error: null });

    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.press(screen.getByRole("button", { name: /send/i }));

    // After a successful reset, the form should be replaced with a
    // success message telling the user to check their email.
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeOnTheScreen();
    });
  });
});
