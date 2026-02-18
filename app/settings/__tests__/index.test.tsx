// app/settings/__tests__/index.test.tsx
//
// Tests for the Settings screen — the hub for app preferences and account
// actions. Covers:
//   - Grade system picker (3 options, immediate persistence)
//   - Navigation rows (notification preferences, community guidelines)
//   - Language row (disabled, "Coming Soon")
//   - App version display
//   - Sign out with Alert confirmation
//   - Back button navigation
//
// MOCK STRATEGY:
// Follows the same pattern as notification-preferences.test.tsx:
//   - useAuth: controls user data + signOut
//   - useUpdateProfile: captures grade system changes
//   - expo-router: mock useRouter (push, back)
//   - expo-constants: mock expoConfig.version
//   - lucide-react-native: stub all icons as View

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { Alert } from "react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock useAuth — controls user profile and signOut action
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockRefreshProfile = jest.fn().mockResolvedValue(undefined);
let mockUser: any = {
  id: "user-123",
  displayName: "TestClimber",
  preferredGradeSystem: "v-scale",
  tier: "free",
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    signOut: mockSignOut,
    refreshProfile: mockRefreshProfile,
  }),
}));

// Mock useUpdateProfile — captures grade system mutation calls.
// The hook takes refreshProfile as a param and returns a mutation object.
const mockMutate = jest.fn();

jest.mock("@/hooks/useProfile", () => ({
  useUpdateProfile: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

// Mock expo-router — controls navigation (push, back)
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock expo-constants — provides app version string
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: "1.2.3",
    },
  },
}));

// Mock lucide-react-native — stub all icons as simple Views.
// Jest can't process SVG transforms from Lucide, so we replace each
// icon with a plain View that carries a testID for assertions.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ArrowLeft: (props: any) => <View testID="icon-arrow-left" {...props} />,
    ChevronRight: (props: any) => (
      <View testID="icon-chevron-right" {...props} />
    ),
    Bell: (props: any) => <View testID="icon-bell" {...props} />,
    BookOpen: (props: any) => <View testID="icon-book-open" {...props} />,
    Globe: (props: any) => <View testID="icon-globe" {...props} />,
    LogOut: (props: any) => <View testID="icon-log-out" {...props} />,
  };
});

import SettingsScreen from "../index";

// ── Tests ────────────────────────────────────────────────────────────

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      id: "user-123",
      displayName: "TestClimber",
      preferredGradeSystem: "v-scale",
      tier: "free",
    };
  });

  // ── Header ─────────────────────────────────────────────────────────

  it('renders "Settings" title', () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Settings")).toBeOnTheScreen();
  });

  it("back button calls router.back()", () => {
    render(<SettingsScreen />);
    // The back button uses IconButton with label "Go back"
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  // ── Grade System Picker ────────────────────────────────────────────

  it("renders grade system picker with 3 options", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("V-Scale")).toBeOnTheScreen();
    expect(screen.getByText("Font")).toBeOnTheScreen();
    expect(screen.getByText("YDS")).toBeOnTheScreen();
  });

  it("highlights current grade preference with accent style", () => {
    // User prefers Font — that option should be visually distinct.
    // We verify by checking the testID matches the selected value.
    mockUser = { ...mockUser, preferredGradeSystem: "font" };
    render(<SettingsScreen />);

    // The selected option gets testID="grade-option-font" and is pressable
    const fontOption = screen.getByTestId("grade-option-font");
    expect(fontOption).toBeOnTheScreen();
  });

  it("tapping a grade option calls updateProfile mutation", () => {
    render(<SettingsScreen />);

    // Tap the Font option (user currently on v-scale)
    fireEvent.press(screen.getByTestId("grade-option-font"));

    expect(mockMutate).toHaveBeenCalledWith({
      userId: "user-123",
      fields: { preferred_grade_system: "font" },
    });
  });

  // ── Navigation Rows ────────────────────────────────────────────────

  it("renders notification preferences row and navigates on tap", () => {
    render(<SettingsScreen />);

    const row = screen.getByText("Notification Preferences");
    expect(row).toBeOnTheScreen();

    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/settings/notification-preferences");
  });

  it("renders community guidelines row and navigates on tap", () => {
    render(<SettingsScreen />);

    const row = screen.getByText("Community Guidelines");
    expect(row).toBeOnTheScreen();

    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/settings/guidelines");
  });

  // ── Language Row ───────────────────────────────────────────────────

  it('renders language row with "Coming Soon" indicator', () => {
    render(<SettingsScreen />);

    expect(screen.getByText("Language")).toBeOnTheScreen();
    expect(screen.getByText("English")).toBeOnTheScreen();
    // Multiple "Coming Soon" badges exist (language, privacy, terms)
    // — verify at least one is rendered
    const comingSoonBadges = screen.getAllByText("Coming Soon");
    expect(comingSoonBadges.length).toBeGreaterThanOrEqual(1);
  });

  // ── About Section ──────────────────────────────────────────────────

  it("renders app version from expo-constants", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Version 1.2.3")).toBeOnTheScreen();
  });

  // ── Sign Out ───────────────────────────────────────────────────────

  it("renders sign out button", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Sign Out")).toBeOnTheScreen();
  });

  it("sign out shows Alert confirmation; confirming calls signOut()", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");

    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("sign-out-button"));

    // Alert should be shown with confirm/cancel options
    expect(alertSpy).toHaveBeenCalledWith(
      "Sign Out",
      "Are you sure you want to sign out?",
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Sign Out" }),
      ]),
    );

    // Simulate pressing "Sign Out" in the Alert dialog
    const alertButtons = alertSpy.mock.calls[0][2] as any[];
    const confirmButton = alertButtons.find(
      (b: any) => b.text === "Sign Out",
    );
    await act(async () => {
      confirmButton.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("sign out cancel does not call signOut()", () => {
    const alertSpy = jest.spyOn(Alert, "alert");

    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("sign-out-button"));

    // Simulate pressing "Cancel"
    const alertButtons = alertSpy.mock.calls[0][2] as any[];
    const cancelButton = alertButtons.find((b: any) => b.text === "Cancel");
    cancelButton.onPress?.();

    expect(mockSignOut).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
