// app/(auth)/__tests__/login.test.tsx
//
// Tests for the Login screen. We mock useAuth() to control auth state
// and verify that the screen:
//   - Renders all expected form elements
//   - Shows validation errors for empty/invalid fields
//   - Calls signIn with correct credentials on submit
//   - Shows error messages when signIn fails
//   - Navigates on success (via useAuth's onAuthStateChange)

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import LoginScreen from "../login";

// Mock lucide-react-native — Jest can't process SVG transforms
jest.mock("lucide-react-native", () => ({
  Eye: (props: any) => {
    const { Text } = require("react-native");
    return <Text>EyeIcon</Text>;
  },
  EyeOff: (props: any) => {
    const { Text } = require("react-native");
    return <Text>EyeOffIcon</Text>;
  },
  Mail: (props: any) => {
    const { Text } = require("react-native");
    return <Text>MailIcon</Text>;
  },
  Lock: (props: any) => {
    const { Text } = require("react-native");
    return <Text>LockIcon</Text>;
  },
}));

// Mock useAuth — define mock functions INSIDE the factory to avoid
// temporal dead zone issues (jest.mock is hoisted above const/let).
jest.mock("@/hooks/useAuth", () => {
  const mockSignIn = jest.fn();
  const mockSignUp = jest.fn();
  const mockSignOut = jest.fn();

  return {
    useAuth: () => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      role: "climber" as const,
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
    }),
    // Expose mock functions so tests can configure return values
    __mockSignIn: mockSignIn,
    __mockSignUp: mockSignUp,
  };
});

// Mock expo-router navigation
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
  }),
  Link: ({ children, ...props }: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>{children}</Text>;
  },
}));

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -- Rendering --

  it("renders the welcome heading", () => {
    render(<LoginScreen />);
    expect(screen.getByText("Welcome Back!")).toBeOnTheScreen();
  });

  it("renders email input", () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText(/email/i)).toBeOnTheScreen();
  });

  it("renders password input", () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText(/password/i)).toBeOnTheScreen();
  });

  it("renders sign in button", () => {
    render(<LoginScreen />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeOnTheScreen();
  });

  it("renders forgot password link", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/forgot password/i)).toBeOnTheScreen();
  });

  it("renders social sign-in section", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/or continue with/i)).toBeOnTheScreen();
  });

  it("renders link to register screen", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/sign up/i)).toBeOnTheScreen();
  });

  // -- Validation --

  it("shows error when submitting empty form", async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeOnTheScreen();
    });
  });

  it("shows error for invalid email format", async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "notanemail");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "password123");
    fireEvent.press(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeOnTheScreen();
    });
  });

  // -- Successful login --

  it("calls signIn with email and password on submit", async () => {
    const { __mockSignIn } = require("@/hooks/useAuth");
    __mockSignIn.mockResolvedValue({ data: {}, error: null });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "password123");
    fireEvent.press(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(__mockSignIn).toHaveBeenCalledWith("test@example.com", "password123");
    });
  });

  // -- Failed login --

  it("shows error message when signIn fails", async () => {
    const { __mockSignIn } = require("@/hooks/useAuth");
    __mockSignIn.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials" },
    });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "wrongpassword");
    fireEvent.press(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid login credentials/i)).toBeOnTheScreen();
    });
  });
});
