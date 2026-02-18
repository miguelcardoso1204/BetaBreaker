// app/__tests__/_layout.test.tsx
//
// Tests for the root layout's AuthGate component.
//
// AuthGate always renders <Stack /> (so child routes have a container
// with push/pop navigation between route groups like tabs → gym).
// It uses useEffect + router.replace for auth-based navigation:
// - Not authenticated + outside (auth) → replace to login
// - Authenticated + inside (auth) → replace to tabs
// - Loading → no navigation (splash screen stays visible)

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Controllable mocks ──────────────────────────────────────────────

// Auth state mock — tests set these before rendering AuthGate.
// `user` is included because AuthGate checks `user.onboardingCompleted`
// to decide whether to route to the onboarding wizard or the main app.
let mockAuthState: {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { onboardingCompleted: boolean } | null;
} = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

// usePushTokenRegistration runs push token registration on mount.
// Mock it as a no-op so AuthGate tests don't trigger real notification
// permission requests or Expo push token fetches.
jest.mock("@/hooks/usePushTokenRegistration", () => ({
  usePushTokenRegistration: () => ({
    permissionStatus: null,
    token: null,
    error: null,
  }),
}));

// Track router.replace calls to verify navigation behavior
const mockReplace = jest.fn();

// Track which route segments AuthGate thinks the user is on.
// Default to empty array (root) — tests override as needed.
let mockSegments: string[] = [];

jest.mock("expo-router", () => {
  const { View } = require("react-native");
  // Stack renders children (Stack.Screen entries) inside a View.
  // Stack.Screen is a no-op in tests — it just declares screen config,
  // which Expo Router uses at runtime but isn't needed for auth logic tests.
  const Stack = (props: any) => (
    <View testID="stack">{props.children}</View>
  );
  // Named function so ESLint's react/display-name rule doesn't flag it
  Stack.Screen = function MockScreen(_props: any) { return null; };
  return {
    Stack,
    useRouter: () => ({
      replace: mockReplace,
    }),
    useSegments: () => mockSegments,
  };
});

// Import after mocks are set up
import { AuthGate } from "../_layout";

describe("AuthGate", () => {
  beforeEach(() => {
    // Reset to default state before each test
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
    };
    mockSegments = [];
    mockReplace.mockClear();
  });

  it("always renders Stack so child routes have a navigation container", () => {
    // Regardless of auth state, <Stack /> should always be in the tree.
    // This prevents the infinite remount loop that happens when the root
    // layout conditionally returns <Redirect> instead of a navigator.
    // Stack (vs Slot) also enables push/pop navigation between groups.
    mockAuthState = { isAuthenticated: false, isLoading: true, user: null };
    render(<AuthGate />);
    expect(screen.getByTestId("stack")).toBeOnTheScreen();
  });

  it("does not navigate while auth is loading", () => {
    // During session restoration from SecureStore, we don't know if the
    // user is logged in yet. Navigating prematurely would flash the login
    // screen before redirecting to tabs.
    mockAuthState = { isAuthenticated: false, isLoading: true, user: null };
    render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("navigates to login when not authenticated and outside auth group", () => {
    // User is on a protected screen (e.g. tabs) but has no session →
    // redirect them to the login screen.
    mockAuthState = { isAuthenticated: false, isLoading: false, user: null };
    mockSegments = ["(tabs)"];
    render(<AuthGate />);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("does not navigate when already in auth group and not authenticated", () => {
    // User is already on the login screen and not logged in →
    // no redirect needed, they're where they should be.
    mockAuthState = { isAuthenticated: false, isLoading: false, user: null };
    mockSegments = ["(auth)"];
    render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("navigates to tabs when authenticated with completed onboarding and still in auth group", () => {
    // User just logged in, has completed onboarding, but URL still shows
    // (auth)/login → send them to the main app.
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { onboardingCompleted: true },
    };
    mockSegments = ["(auth)"];
    render(<AuthGate />);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("does not navigate when authenticated with completed onboarding and already in tabs", () => {
    // User is logged in, has completed onboarding, and is viewing tabs →
    // no redirect needed — they're exactly where they should be.
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { onboardingCompleted: true },
    };
    mockSegments = ["(tabs)"];
    render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── Onboarding routing tests ────────────────────────────────────────
  // These verify that new users (onboardingCompleted: false) are sent to
  // the onboarding wizard before they can access the main app.

  it("navigates to onboarding when authenticated with incomplete onboarding and in auth group", () => {
    // New user just signed up → still in (auth) group, hasn't done
    // onboarding yet. Send them to the wizard, not straight to tabs.
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { onboardingCompleted: false },
    };
    mockSegments = ["(auth)"];
    render(<AuthGate />);
    expect(mockReplace).toHaveBeenCalledWith("/onboarding");
  });

  it("navigates to onboarding when authenticated with incomplete onboarding and in tabs", () => {
    // Edge case: new user somehow landed in tabs (e.g., deep link)
    // but hasn't completed onboarding → redirect to wizard.
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { onboardingCompleted: false },
    };
    mockSegments = ["(tabs)"];
    render(<AuthGate />);
    expect(mockReplace).toHaveBeenCalledWith("/onboarding");
  });

  it("navigates to tabs when authenticated with completed onboarding and on onboarding screen", () => {
    // User just finished onboarding (refreshProfile updated the flag) →
    // still on /onboarding screen. Redirect to the main app.
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { onboardingCompleted: true },
    };
    mockSegments = ["onboarding"];
    render(<AuthGate />);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("does not navigate when authenticated with incomplete onboarding and already on onboarding", () => {
    // User is on the onboarding screen and hasn't finished yet →
    // let them stay. No redirect needed.
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { onboardingCompleted: false },
    };
    mockSegments = ["onboarding"];
    render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not navigate when authenticated but user profile is still loading", () => {
    // After session restore, useAuth returns isAuthenticated=true but
    // user=null while the profile fetch is in flight. We must wait for
    // the profile before deciding where to route.
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: null,
    };
    mockSegments = ["(auth)"];
    render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
