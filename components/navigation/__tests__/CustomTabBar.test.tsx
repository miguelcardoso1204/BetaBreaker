// components/navigation/__tests__/CustomTabBar.test.tsx
//
// Unit tests for the CustomTabBar component — a custom bottom tab bar
// with 4 route tabs and a raised center FAB (Floating Action Button).
//
// WHY A CUSTOM TAB BAR?
// React Navigation's default tab bar doesn't support injecting a non-tab
// element (our FAB) into the middle. By providing a custom `tabBar` prop,
// we control the layout: 4 route tabs with a raised FAB between positions
// 2 and 3. The FAB isn't a tab — it triggers a modal push navigation.
//
// MOCK STRATEGY:
// - lucide-react-native: SVGs can't render in Jest's Node environment,
//   so each icon becomes a <Text> element with the icon name as content.
// - expo-haptics: Mock impactAsync to verify the FAB triggers haptic feedback.
// - expo-router: Mock useRouter to verify FAB navigates to "/start-session".
// - We build mock BottomTabBarProps with a helper function, simulating
//   what React Navigation passes to a custom tabBar component.

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock Lucide icons as simple Text elements with a testID based on icon name.
// Each mock passes through all props (including `color`) so we can verify
// the component applies the correct active/inactive colors.
// We use testID="icon-<Name>" to distinguish icons from label text
// (e.g., "Home" appears as both the icon mock text and the label).
jest.mock("lucide-react-native", () => ({
  Home: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-Home">Home</Text>;
  },
  MapPin: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-MapPin">MapPin</Text>;
  },
  Plus: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-Plus">Plus</Text>;
  },
  Timer: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-Timer">Timer</Text>;
  },
  Trophy: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-Trophy">Trophy</Text>;
  },
  User: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-User">User</Text>;
  },
  ScanLine: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props} testID="icon-ScanLine">ScanLine</Text>;
  },
}));

// Mock expo-haptics so we can verify the FAB triggers haptic feedback
// without needing actual device hardware.
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

// Track router.push calls to verify FAB navigation behavior.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock session store — controls whether the FAB shows Timer vs Plus icon.
// The component uses useSessionStore((s) => s.isActive) directly to avoid
// pulling TanStack Query into the tab bar.
const mockSessionState = { isActive: false };
jest.mock("@/stores/sessionStore", () => ({
  useSessionStore: (selector: any) => selector(mockSessionState),
}));

// Import the component under test AFTER mocks are in place.
// jest.mock() is hoisted above imports, but the explicit ordering
// makes the dependency on mocks clear to the reader.
import { CustomTabBar } from "../CustomTabBar";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

// ── Helper ───────────────────────────────────────────────────────────

/**
 * Builds mock BottomTabBarProps that simulate what React Navigation
 * passes to a custom tabBar component.
 *
 * @param activeIndex - Which tab (0-3) should be marked as focused.
 *   This lets us test active/inactive styling and tab press behavior.
 *
 * WHY THIS HELPER?
 * BottomTabBarProps is a complex object with navigation state, methods,
 * and descriptors. Building it by hand in each test would be noisy and
 * error-prone. The helper provides sensible defaults so tests only
 * need to specify what's different (the active tab index).
 */
function createMockTabBarProps(activeIndex: number): BottomTabBarProps {
  // Define the 4 tab routes that match our layout configuration.
  // Each route has a unique key (used by React Navigation internally)
  // and a name (the file-based route name from Expo Router).
  const routes = [
    { key: "index-key", name: "index", params: undefined },
    { key: "map-key", name: "map", params: undefined },
    { key: "leaderboards-key", name: "leaderboards", params: undefined },
    { key: "profile-key", name: "profile", params: undefined },
  ];

  return {
    state: {
      // `index` is the currently focused tab (0-based).
      index: activeIndex,
      routes,
      // These fields satisfy the NavigationState type but aren't used
      // by our custom tab bar.
      key: "tabs-key",
      routeNames: ["index", "map", "leaderboards", "profile"],
      stale: false,
      type: "tab",
      history: [],
      // preloadedRouteKeys is required by TabNavigationState — it tracks
      // which screens have been pre-rendered for faster tab switching.
      // Empty array for tests since no screens are preloaded.
      preloadedRouteKeys: [],
    },
    // Mock navigation methods — we verify these get called on tab press.
    navigation: {
      emit: jest.fn().mockReturnValue({ defaultPrevented: false }),
      navigate: jest.fn(),
      // Provide other navigation methods as no-ops to satisfy the type.
      dispatch: jest.fn(),
      reset: jest.fn(),
      goBack: jest.fn(),
      isFocused: jest.fn().mockReturnValue(true),
      canGoBack: jest.fn().mockReturnValue(false),
      getParent: jest.fn(),
      getState: jest.fn(),
      setParams: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      getId: jest.fn(),
      setOptions: jest.fn(),
    } as any,
    // Descriptors provide per-screen options (title, icons, etc.).
    // Our custom tab bar uses its own icon/label mapping instead,
    // so we just provide empty option objects.
    descriptors: Object.fromEntries(
      routes.map((r) => [
        r.key,
        {
          options: {},
          navigation: {} as any,
          route: r,
          render: () => null,
        },
      ])
    ) as any,
    // Safe area insets — typically provided by react-native-safe-area-context.
    // Zero insets simplify testing (no bottom padding to account for).
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("CustomTabBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset session state so each test starts with no active session.
    mockSessionState.isActive = false;
  });

  it("renders 4 tab icons and a FAB button", () => {
    // The tab bar should display all 4 navigation icons so users know
    // which tab they're selecting. The FAB should be identifiable by testID
    // for both testing and accessibility purposes.
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    // Verify each tab icon is rendered (using testIDs to avoid
    // ambiguity with label text that has the same content).
    expect(screen.getByTestId("icon-Home")).toBeOnTheScreen();
    expect(screen.getByTestId("icon-MapPin")).toBeOnTheScreen();
    expect(screen.getByTestId("icon-Trophy")).toBeOnTheScreen();
    expect(screen.getByTestId("icon-User")).toBeOnTheScreen();
    expect(screen.getByTestId("fab-button")).toBeOnTheScreen();
  });

  it("FAB has correct accessibility structure", () => {
    // The FAB must have an accessibility label for screen readers —
    // it's a button with no visible text label, so VoiceOver/TalkBack
    // would just say "button" without this. The Plus icon inside
    // visually communicates "create/add" to sighted users.
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    const fab = screen.getByTestId("fab-button");
    expect(fab.props.accessibilityLabel).toBe("Start Session");
    // Verify the Plus icon is rendered inside the FAB
    expect(screen.getByTestId("icon-Plus")).toBeOnTheScreen();
  });

  it("applies accent color to the active tab icon", () => {
    // Active tab should be visually distinct (purple #7C3AED) from
    // inactive tabs (muted gray #6B6B80). This provides clear feedback
    // about which screen the user is currently viewing.
    const props = createMockTabBarProps(0); // Home tab active
    render(<CustomTabBar {...props} />);

    // Use testIDs to get icon elements (avoids ambiguity with label text).
    // The Home icon (active) should get the accent color.
    // Inactive icons (MapPin, Trophy, User) should get the muted color.
    const homeIcon = screen.getByTestId("icon-Home");
    const mapIcon = screen.getByTestId("icon-MapPin");

    expect(homeIcon.props.color).toBe("#7C3AED");
    expect(mapIcon.props.color).toBe("#6B6B80");
  });

  it("FAB press triggers haptics and navigates to start-session", () => {
    // Pressing the FAB should: (1) fire haptic feedback for a tactile "click"
    // sensation, and (2) push the start-session modal route. Both happen
    // together — the haptic feedback makes the FAB feel more "physical"
    // compared to regular tab switches.
    const Haptics = require("expo-haptics");
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    fireEvent.press(screen.getByTestId("fab-button"));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Medium
    );
    expect(mockPush).toHaveBeenCalledWith("/start-session");
  });

  it("tab press emits tabPress event and navigates", () => {
    // When a user taps a tab, React Navigation expects the tab bar to:
    // 1. Emit a "tabPress" event (so listeners can prevent default)
    // 2. Navigate to the tab if the event wasn't prevented
    // This two-step process lets screens intercept tab presses
    // (e.g., to scroll-to-top if the tab is already active).
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    // Press the Leaderboards tab (index 2) — its label is unique
    // (no icon mock shares the name "Leaderboards"), so getByRole works.
    // We target the tab role with the "Leaderboards" accessible name.
    const leaderboardsTab = screen.getByRole("tab", { name: "Leaderboards" });
    fireEvent.press(leaderboardsTab);

    // Verify the tabPress event was emitted with the Leaderboards route's key
    expect(props.navigation.emit).toHaveBeenCalledWith({
      type: "tabPress",
      target: "leaderboards-key",
      canPreventDefault: true,
    });

    // Since our mock returns { defaultPrevented: false }, navigation proceeds
    expect(props.navigation.navigate).toHaveBeenCalledWith("leaderboards");
  });

  it("FAB long press opens action menu with Scan QR Code option", () => {
    // Long-pressing the FAB should reveal an action menu overlay with a
    // "Scan QR Code" option. This is how climbers access the QR scanner
    // without it taking up a permanent tab bar slot. Short press still
    // opens the session modal — long press is the "power user" gesture.
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    const fab = screen.getByTestId("fab-button");
    fireEvent(fab, "longPress");

    // The action menu should now be visible with the QR scan option
    expect(screen.getByText("Scan QR Code")).toBeOnTheScreen();
  });

  it("menu 'Scan QR Code' navigates to the scan screen", () => {
    // Tapping the "Scan QR Code" menu item should navigate to the hidden
    // scan tab screen and close the menu. The scan screen is registered
    // in the (tabs) group with href: null so it works with tab navigation.
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    // Open the action menu via long press
    const fab = screen.getByTestId("fab-button");
    fireEvent(fab, "longPress");

    // Tap the scan menu item
    fireEvent.press(screen.getByText("Scan QR Code"));

    // Should navigate to the scan screen
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/scan");
  });

  // ── Session-aware FAB behavior ──────────────────────────────────

  it("FAB navigates to /active-session when session is active", () => {
    // When a climbing session is running, the FAB should take the user
    // to the active session hub (not the start-session modal).
    mockSessionState.isActive = true;
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    fireEvent.press(screen.getByTestId("fab-button"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/active-session");
  });

  it("FAB navigates to /start-session when no session is active", () => {
    // When no session is running, the FAB should open the start-session
    // modal to let the user pick a gym and begin climbing.
    mockSessionState.isActive = false;
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    fireEvent.press(screen.getByTestId("fab-button"));
    expect(mockPush).toHaveBeenCalledWith("/start-session");
  });

  it("FAB shows Timer icon when session is active", () => {
    // Visual indicator that a session is running — the Plus icon swaps
    // to a Timer icon so the user knows they can tap to view their session.
    mockSessionState.isActive = true;
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    expect(screen.getByTestId("icon-Timer")).toBeOnTheScreen();
    expect(screen.queryByTestId("icon-Plus")).not.toBeOnTheScreen();
  });

  it("FAB shows Plus icon when no session is active", () => {
    // Default state — Plus icon invites the user to start a new session.
    mockSessionState.isActive = false;
    const props = createMockTabBarProps(0);
    render(<CustomTabBar {...props} />);

    expect(screen.getByTestId("icon-Plus")).toBeOnTheScreen();
    expect(screen.queryByTestId("icon-Timer")).not.toBeOnTheScreen();
  });
});
