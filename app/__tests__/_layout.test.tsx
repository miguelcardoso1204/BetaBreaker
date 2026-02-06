// app/__tests__/_layout.test.tsx
//
// Tests for the root layout's AuthGate component.
//
// AuthGate always renders <Slot /> (so child routes have a container)
// and uses useEffect + router.replace for auth-based navigation:
// - Not authenticated + outside (auth) → replace to login
// - Authenticated + inside (auth) → replace to tabs
// - Loading → no navigation (splash screen stays visible)

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Controllable mocks ──────────────────────────────────────────────

// Auth state mock — tests set these before rendering AuthGate
let mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

// Track router.replace calls to verify navigation behavior
const mockReplace = jest.fn();

// Track which route segments AuthGate thinks the user is on.
// Default to empty array (root) — tests override as needed.
let mockSegments: string[] = [];

jest.mock("expo-router", () => ({
  Slot: () => {
    const { Text } = require("react-native");
    return <Text testID="slot">Slot</Text>;
  },
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSegments: () => mockSegments,
}));

// Import after mocks are set up
import { AuthGate } from "../_layout";

describe("AuthGate", () => {
  beforeEach(() => {
    // Reset to default state before each test
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
    };
    mockSegments = [];
    mockReplace.mockClear();
  });

  it("always renders Slot so child routes have a container", () => {
    // Regardless of auth state, <Slot /> should always be in the tree.
    // This prevents the infinite remount loop that happens when the root
    // layout conditionally returns <Redirect> instead of <Slot />.
    mockAuthState = { isAuthenticated: false, isLoading: true };
    render(<AuthGate />);
    expect(screen.getByTestId("slot")).toBeOnTheScreen();
  });

  it("does not navigate while auth is loading", () => {
    // During session restoration from SecureStore, we don't know if the
    // user is logged in yet. Navigating prematurely would flash the login
    // screen before redirecting to tabs.
    mockAuthState = { isAuthenticated: false, isLoading: true };
    render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("navigates to login when not authenticated and outside auth group", () => {
    // User is on a protected screen (e.g. tabs) but has no session →
    // redirect them to the login screen.
    mockAuthState = { isAuthenticated: false, isLoading: false };
    mockSegments = ["(tabs)"];
    render(<AuthGate />);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("does not navigate when already in auth group and not authenticated", () => {
    // User is already on the login screen and not logged in →
    // no redirect needed, they're where they should be.
    mockAuthState = { isAuthenticated: false, isLoading: false };
    mockSegments = ["(auth)"];
    render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("navigates to tabs when authenticated and still in auth group", () => {
    // User just logged in but the URL still shows (auth)/login →
    // redirect them to the main app.
    mockAuthState = { isAuthenticated: true, isLoading: false };
    mockSegments = ["(auth)"];
    render(<AuthGate />);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("does not navigate when authenticated and already in tabs", () => {
    // User is logged in and already viewing the main app →
    // no redirect needed.
    mockAuthState = { isAuthenticated: true, isLoading: false };
    mockSegments = ["(tabs)"];
    render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
