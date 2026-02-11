/**
 * Notification Preferences Screen Tests
 *
 * Tests the per-category toggle screen at app/settings/notification-preferences.tsx.
 * Four notification categories, each with a Switch toggle:
 *   - friends: "Friends & Social"
 *   - routes: "Routes & Gyms"
 *   - comps: "Competitions"
 *   - achievements: "Achievements"
 *
 * OPT-OUT MODEL:
 *   Missing preferences default to enabled. If a user has never toggled
 *   a category, it shows as ON. Only explicit opt-outs create DB rows.
 *   The hook returns `preferences[category] ?? true` for this behavior.
 *
 * Mock strategy:
 *   - useNotificationPreferences: controls the preferences map
 *   - useUpdatePreference: mutation mock for toggle actions
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

jest.mock("@/hooks/useNotifications", () => {
  const mockPrefsData = {
    preferences: {} as Record<string, boolean>,
    isLoading: false,
    error: null as Error | null,
  };
  const mockUpdatePref = {
    mutate: jest.fn(),
  };
  return {
    useNotificationPreferences: () => mockPrefsData,
    useUpdatePreference: () => mockUpdatePref,
    __mockPrefsData: mockPrefsData,
    __mockUpdatePref: mockUpdatePref,
  };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: jest.fn(),
  }),
}));

jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ArrowLeft: (props: any) => <View testID="icon-arrow-left" {...props} />,
  };
});

import NotificationPreferencesScreen from "../notification-preferences";

const { __mockPrefsData, __mockUpdatePref } = jest.requireMock<{
  __mockPrefsData: {
    preferences: Record<string, boolean>;
    isLoading: boolean;
    error: Error | null;
  };
  __mockUpdatePref: { mutate: jest.Mock };
}>("@/hooks/useNotifications");

// ── Helpers ──────────────────────────────────────────────────────

function resetMocks() {
  __mockPrefsData.preferences = {};
  __mockPrefsData.isLoading = false;
  __mockPrefsData.error = null;
  __mockUpdatePref.mutate.mockClear();
}

// ── Tests ────────────────────────────────────────────────────────

describe("NotificationPreferencesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  it("renders the screen title", () => {
    render(<NotificationPreferencesScreen />);

    expect(screen.getByText("Notification Preferences")).toBeOnTheScreen();
  });

  it("shows all four category labels", () => {
    render(<NotificationPreferencesScreen />);

    expect(screen.getByText("Friends & Social")).toBeOnTheScreen();
    expect(screen.getByText("Routes & Gyms")).toBeOnTheScreen();
    expect(screen.getByText("Competitions")).toBeOnTheScreen();
    expect(screen.getByText("Achievements")).toBeOnTheScreen();
  });

  it("defaults all categories to enabled when no preferences set", () => {
    // Opt-out model: missing preferences = enabled. All switches
    // should be ON when the preferences map is empty.
    __mockPrefsData.preferences = {};

    render(<NotificationPreferencesScreen />);

    // All 4 switches should be toggled on (value=true)
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(4);
    switches.forEach((sw) => {
      expect(sw.props.value).toBe(true);
    });
  });

  it("reflects explicitly disabled categories", () => {
    // User has explicitly disabled friends notifications
    __mockPrefsData.preferences = { friends: false };

    render(<NotificationPreferencesScreen />);

    const switches = screen.getAllByRole("switch");
    // First switch (friends) should be OFF, rest should be ON
    expect(switches[0].props.value).toBe(false);
    expect(switches[1].props.value).toBe(true);
    expect(switches[2].props.value).toBe(true);
    expect(switches[3].props.value).toBe(true);
  });

  it("calls updatePreference when a switch is toggled", () => {
    __mockPrefsData.preferences = {};

    render(<NotificationPreferencesScreen />);

    const switches = screen.getAllByRole("switch");
    // Toggle the first switch (friends) to OFF
    fireEvent(switches[0], "valueChange", false);

    expect(__mockUpdatePref.mutate).toHaveBeenCalledWith({
      category: "friends",
      enabled: false,
    });
  });

  it("toggles a disabled category back to enabled", () => {
    __mockPrefsData.preferences = { comps: false };

    render(<NotificationPreferencesScreen />);

    const switches = screen.getAllByRole("switch");
    // comps is the 3rd category (index 2), toggle it ON
    fireEvent(switches[2], "valueChange", true);

    expect(__mockUpdatePref.mutate).toHaveBeenCalledWith({
      category: "comps",
      enabled: true,
    });
  });

  it("shows category descriptions", () => {
    // Each category has a subtitle explaining what notifications it covers
    render(<NotificationPreferencesScreen />);

    expect(screen.getByText(/friend requests/i)).toBeOnTheScreen();
    expect(screen.getByText(/route updates/i)).toBeOnTheScreen();
    expect(screen.getByText(/competition invites/i)).toBeOnTheScreen();
    expect(screen.getByText(/badges.*milestones/i)).toBeOnTheScreen();
  });
});
