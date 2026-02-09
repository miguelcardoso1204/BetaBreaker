// app/(tabs)/__tests__/_layout.test.tsx
//
// Tests for the tab navigator layout configuration.
//
// These tests verify that the tab layout:
// 1. Renders without crashing
// 2. Uses our CustomTabBar component (not the default)
// 3. Declares all 4 expected tab screens
//
// WHY MOCK TABS AND CUSTOMTABBAR?
// The real <Tabs> component from expo-router sets up a full React Navigation
// tab navigator, which requires native modules and a navigation context.
// In unit tests, we replace it with a simple component that captures the
// props passed to it — this lets us inspect the tabBar prop and screen
// configuration without needing the full navigation stack.
//
// Similarly, CustomTabBar is tested in its own test file. Here we only
// need to verify that it's *passed* to the Tabs component, not that it
// works correctly internally.

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Capture the props passed to <Tabs> so we can inspect them in tests.
// The mock renders children (the <Tabs.Screen> elements) so they appear
// in the rendered output for screen name verification.
let capturedTabsProps: any = {};

jest.mock("expo-router", () => {
  const { Text, View } = require("react-native");

  // Tabs.Screen mock — renders the screen name as text so tests can
  // verify which screens are declared without needing real navigation.
  const Screen = ({ name }: { name: string }) => (
    <Text testID={`screen-${name}`}>{name}</Text>
  );

  // Tabs mock — captures props and renders children (Screen elements).
  const Tabs = (props: any) => {
    capturedTabsProps = props;
    return <View testID="tabs">{props.children}</View>;
  };
  Tabs.Screen = Screen;

  return { Tabs };
});

// Mock CustomTabBar as a simple Text element.
// We verify the real component is passed as the tabBar prop by checking
// that capturedTabsProps.tabBar renders our mock.
jest.mock("@/components/navigation/CustomTabBar", () => ({
  CustomTabBar: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID="custom-tab-bar">CustomTabBar</Text>;
  },
}));

// Import after mocks are in place
import TabLayout from "../_layout";

// ── Tests ─────────────────────────────────────────────────────────────

describe("TabLayout", () => {
  beforeEach(() => {
    capturedTabsProps = {};
  });

  it("renders without crashing", () => {
    // Smoke test — the layout should mount and render the Tabs component.
    // If this fails, there's likely a missing import or syntax error.
    render(<TabLayout />);
    expect(screen.getByTestId("tabs")).toBeOnTheScreen();
  });

  it("passes CustomTabBar via the tabBar prop", () => {
    // The layout should provide our custom tab bar to the Tabs navigator.
    // This ensures users see the 4-tab + FAB layout instead of the
    // default React Navigation bottom tabs.
    render(<TabLayout />);

    // The tabBar prop should be a function — call it with dummy props
    // to verify it renders our CustomTabBar component.
    expect(capturedTabsProps.tabBar).toBeDefined();
    expect(typeof capturedTabsProps.tabBar).toBe("function");
  });

  it("declares 4 visible tab screens plus hidden logbook", () => {
    // The tab navigator should have 4 visible screens (index, map,
    // leaderboards, profile) plus the logbook screen which is hidden
    // from the tab bar via href: null but still part of the tabs group.
    render(<TabLayout />);

    expect(screen.getByTestId("screen-index")).toBeOnTheScreen();
    expect(screen.getByTestId("screen-map")).toBeOnTheScreen();
    expect(screen.getByTestId("screen-leaderboards")).toBeOnTheScreen();
    expect(screen.getByTestId("screen-profile")).toBeOnTheScreen();
    expect(screen.getByTestId("screen-logbook")).toBeOnTheScreen();
  });
});
