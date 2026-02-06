// app/(auth)/__tests__/register.test.tsx
//
// Tests for the Register screen. Similar mock setup to login tests.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import RegisterScreen from "../register";

// Mock lucide-react-native
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
  User: (props: any) => {
    const { Text } = require("react-native");
    return <Text>UserIcon</Text>;
  },
  Lock: (props: any) => {
    const { Text } = require("react-native");
    return <Text>LockIcon</Text>;
  },
}));

// Mock useAuth
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
    __mockSignUp: mockSignUp,
  };
});

// Mock expo-router
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

describe("RegisterScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -- Rendering --

  it("renders the sign up heading", () => {
    render(<RegisterScreen />);
    expect(screen.getByText("Sign up!")).toBeOnTheScreen();
  });

  it("renders email input", () => {
    render(<RegisterScreen />);
    expect(screen.getByPlaceholderText(/email/i)).toBeOnTheScreen();
  });

  it("renders display name input", () => {
    render(<RegisterScreen />);
    expect(screen.getByPlaceholderText(/name/i)).toBeOnTheScreen();
  });

  it("renders password input", () => {
    render(<RegisterScreen />);
    expect(screen.getByPlaceholderText(/password/i)).toBeOnTheScreen();
  });

  it("renders sign up button", () => {
    render(<RegisterScreen />);
    expect(screen.getByRole("button", { name: /sign up/i })).toBeOnTheScreen();
  });

  it("renders link to login screen", () => {
    render(<RegisterScreen />);
    expect(screen.getByText(/sign in/i)).toBeOnTheScreen();
  });

  // -- Validation --

  it("shows error when submitting empty form", async () => {
    render(<RegisterScreen />);
    fireEvent.press(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeOnTheScreen();
    });
  });

  it("shows error for short password", async () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "short");
    fireEvent.press(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      // registrationSchema requires min 8 chars
      expect(screen.getByText(/8/i)).toBeOnTheScreen();
    });
  });

  // -- Successful registration --

  it("calls signUp with email and password on submit", async () => {
    const { __mockSignUp } = require("@/hooks/useAuth");
    __mockSignUp.mockResolvedValue({ data: {}, error: null });

    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "new@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "securepass123");
    fireEvent.press(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(__mockSignUp).toHaveBeenCalledWith("new@example.com", "securepass123");
    });
  });

  // -- Failed registration --

  it("shows error message when signUp fails", async () => {
    const { __mockSignUp } = require("@/hooks/useAuth");
    __mockSignUp.mockResolvedValue({
      data: null,
      error: { message: "User already registered" },
    });

    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "existing@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "securepass123");
    fireEvent.press(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/user already registered/i)).toBeOnTheScreen();
    });
  });
});
