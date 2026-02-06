// app/__tests__/_layout.test.tsx
//
// Tests for the root layout's auth gate behavior.
// The root layout should redirect to (auth) when not authenticated
// and show (tabs) when authenticated.

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

// We'll test the AuthGate component directly since testing the full
// root layout requires the Expo Router context which is complex to mock.
// Instead, we extract the auth gate logic into a testable component.

// Mock useAuth with controllable state
let mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

// Mock expo-router Redirect
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text testID="redirect">Redirect to {href}</Text>;
  },
  Slot: () => {
    const { Text } = require("react-native");
    return <Text testID="slot">Slot</Text>;
  },
  Stack: Object.assign(
    ({ children }: any) => {
      const { View } = require("react-native");
      return <View>{children}</View>;
    },
    {
      Screen: ({ name }: any) => {
        const { Text } = require("react-native");
        return <Text>Screen: {name}</Text>;
      },
    }
  ),
}));

// Import after mocks are set up
import { AuthGate } from "../_layout";

describe("AuthGate", () => {
  beforeEach(() => {
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
    };
  });

  it("shows loading state while auth is initializing", () => {
    mockAuthState = { isAuthenticated: false, isLoading: true };
    render(<AuthGate />);
    // During loading, nothing should render (or a splash screen)
    expect(screen.queryByTestId("redirect")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("slot")).not.toBeOnTheScreen();
  });

  it("redirects to login when not authenticated", () => {
    mockAuthState = { isAuthenticated: false, isLoading: false };
    render(<AuthGate />);
    expect(screen.getByTestId("redirect")).toBeOnTheScreen();
    expect(screen.getByText(/\(auth\)/)).toBeOnTheScreen();
  });

  it("renders main app when authenticated", () => {
    mockAuthState = { isAuthenticated: true, isLoading: false };
    render(<AuthGate />);
    expect(screen.getByTestId("slot")).toBeOnTheScreen();
  });
});
