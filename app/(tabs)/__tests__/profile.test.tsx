// app/(tabs)/__tests__/profile.test.tsx
//
// Tests for the Profile screen — the user's personal dashboard showing
// their avatar, name, streak stats, tier badge, pinned achievements,
// profile stats, edit mode, and account actions (export/delete).
//
// MOCK STRATEGY:
// - useAuth: Mocked to control user data (name, avatar, tier, pinned IDs)
// - useUserBadges: Mocked to provide earned badge data
// - useUserStreak: Mocked to provide streak data
// - usePinnedBadges: Mocked to provide resolved pinned badge IDs
// - useSetPinnedBadges: Mocked to verify save interactions
// - useProfileStats: Mocked to provide stats data (total sends, max grade)
// - useUpdateProfile: Mocked to verify edit save
// - useExportData: Mocked to verify export mutation
// - useDeleteAccount: Mocked to verify delete mutation
// - useGyms / useSetHomeGym: Mocked for gym picker
// - expo-image: Mocked as View (no native image runtime in Jest)
//
// Each test configures these mocks to simulate different user states.

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Default mock values — tests override these as needed
const mockUser = {
  id: "user-123",
  displayName: "TestClimber",
  avatarUrl: "https://example.com/avatar.png",
  tier: "free",
  pinnedBadgeIds: ["b1"],
  preferredGradeSystem: "v-scale",
  homeGymId: null,
  onboardingCompleted: true,
  createdAt: "2026-01-01T00:00:00Z",
};

const mockUserBadges = [
  {
    user_id: "user-123",
    badge_id: "b1",
    awarded_at: "2026-01-10T00:00:00Z",
    badge: { id: "b1", name: "First V0", icon_key: "badge-v0" },
  },
  {
    user_id: "user-123",
    badge_id: "b2",
    awarded_at: "2026-01-15T00:00:00Z",
    badge: { id: "b2", name: "First Flash", icon_key: "badge-flash" },
  },
];

const mockStreak = {
  user_id: "user-123",
  streak_type: "weekly",
  current_streak: 5,
  longest_streak: 8,
  last_active_date: "2026-02-02",
};

// Mock useAuth — controls whether the user is authenticated and their profile
const mockRefreshProfile = jest.fn().mockResolvedValue(undefined);
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
let mockUseAuthReturn: any = {
  user: mockUser,
  session: { access_token: "test" },
  isAuthenticated: true,
  isLoading: false,
  role: "climber",
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: mockSignOut,
  refreshProfile: mockRefreshProfile,
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuthReturn,
}));

// Mock useUserBadges — returns earned badge data
let mockUseUserBadgesReturn: any = {
  data: mockUserBadges,
  isLoading: false,
  error: null,
};

// Mock useUserStreak — returns streak data
let mockUseUserStreakReturn: any = {
  data: mockStreak,
  isLoading: false,
  error: null,
};

// Mock usePinnedBadges — returns pinned badge IDs from profile
let mockUsePinnedBadgesReturn: any = {
  data: { pinned_badge_ids: ["b1"] },
  isLoading: false,
  error: null,
};

// Mock useSetPinnedBadges — mutation for saving pinned selection
const mockBadgeMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockUseSetPinnedBadgesReturn = {
  mutateAsync: mockBadgeMutateAsync,
  isPending: false,
};

jest.mock("@/hooks/useBadges", () => ({
  useUserBadges: () => mockUseUserBadgesReturn,
  useUserStreak: () => mockUseUserStreakReturn,
  usePinnedBadges: () => mockUsePinnedBadgesReturn,
  useSetPinnedBadges: () => mockUseSetPinnedBadgesReturn,
}));

// Mock useChallenges — returns active challenges and progress data
let mockUseActiveChallengesReturn: any = {
  data: null,
  isLoading: false,
  error: null,
};
let mockUseChallengeProgressReturn: any = {
  data: null,
  isLoading: false,
  error: null,
};

jest.mock("@/hooks/useChallenges", () => ({
  useActiveChallenges: () => mockUseActiveChallengesReturn,
  useChallengeProgress: () => mockUseChallengeProgressReturn,
}));

// Mock useProfileStats — returns total sends + max grade
let mockUseProfileStatsReturn: any = {
  data: [{ total_sends: 42, max_grade: 20 }],
  isLoading: false,
  error: null,
};

// Mock useUpdateProfile — mutation for saving profile edits
const mockUpdateMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockUseUpdateProfileReturn = {
  mutateAsync: mockUpdateMutateAsync,
  isPending: false,
};

// Mock useExportData — mutation for exporting user data
const mockExportMutateAsync = jest.fn().mockResolvedValue({ profile: {} });
const mockUseExportDataReturn = {
  mutateAsync: mockExportMutateAsync,
  isPending: false,
};

// Mock useDeleteAccount — mutation for deleting account
const mockDeleteMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockUseDeleteAccountReturn = {
  mutateAsync: mockDeleteMutateAsync,
  isPending: false,
};

jest.mock("@/hooks/useProfile", () => ({
  useProfileStats: () => mockUseProfileStatsReturn,
  useUpdateProfile: () => mockUseUpdateProfileReturn,
  useExportData: () => mockUseExportDataReturn,
  useDeleteAccount: () => mockUseDeleteAccountReturn,
}));

// Mock useGyms — returns gym list for picker
let mockUseGymsReturn: any = {
  data: [
    { id: "gym-1", name: "Ape Index" },
    { id: "gym-2", name: "Summit Gym" },
  ],
  isLoading: false,
  error: null,
};

const mockSetHomeGymMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockUseSetHomeGymReturn = {
  mutateAsync: mockSetHomeGymMutateAsync,
  isPending: false,
};

jest.mock("@/hooks/useGyms", () => ({
  useGyms: () => mockUseGymsReturn,
  useSetHomeGym: () => mockUseSetHomeGymReturn,
}));

// Mock expo-image (no native runtime in Jest)
jest.mock("expo-image", () => ({
  Image: (props: any) => {
    const { View } = require("react-native");
    return <View {...props} />;
  },
}));

import ProfileScreen from "../profile";

describe("ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Fix system time so deriveStreakStatus() produces deterministic results.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 5));
    // Reset all mock return values to defaults
    mockUseAuthReturn = {
      user: mockUser,
      session: { access_token: "test" },
      isAuthenticated: true,
      isLoading: false,
      role: "climber",
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: mockSignOut,
      refreshProfile: mockRefreshProfile,
    };
    mockUseUserBadgesReturn = {
      data: mockUserBadges,
      isLoading: false,
      error: null,
    };
    mockUseUserStreakReturn = {
      data: mockStreak,
      isLoading: false,
      error: null,
    };
    mockUsePinnedBadgesReturn = {
      data: { pinned_badge_ids: ["b1"] },
      isLoading: false,
      error: null,
    };
    mockUseActiveChallengesReturn = {
      data: null,
      isLoading: false,
      error: null,
    };
    mockUseChallengeProgressReturn = {
      data: null,
      isLoading: false,
      error: null,
    };
    mockUseProfileStatsReturn = {
      data: [{ total_sends: 42, max_grade: 20 }],
      isLoading: false,
      error: null,
    };
    mockUseGymsReturn = {
      data: [
        { id: "gym-1", name: "Ape Index" },
        { id: "gym-2", name: "Summit Gym" },
      ],
      isLoading: false,
      error: null,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Existing tests ─────────────────────────────────────────────────

  it("shows loading state while data loads", () => {
    mockUseAuthReturn = {
      ...mockUseAuthReturn,
      isLoading: true,
      user: null,
    };

    render(<ProfileScreen />);
    expect(screen.getByText("Loading...")).toBeOnTheScreen();
  });

  it("renders avatar and display name", () => {
    render(<ProfileScreen />);
    expect(screen.getByText("TestClimber")).toBeOnTheScreen();
  });

  it("renders streak data (current + longest)", () => {
    render(<ProfileScreen />);
    expect(screen.getByText("5")).toBeOnTheScreen();
    expect(screen.getByText("8")).toBeOnTheScreen();
  });

  it("renders pinned badges", () => {
    render(<ProfileScreen />);
    expect(screen.getByText("First V0")).toBeOnTheScreen();
  });

  it('shows "No badges yet" when user has zero badges', () => {
    mockUseUserBadgesReturn = { data: [], isLoading: false, error: null };
    mockUsePinnedBadgesReturn = {
      data: { pinned_badge_ids: [] },
      isLoading: false,
      error: null,
    };
    mockUseAuthReturn = {
      ...mockUseAuthReturn,
      user: { ...mockUser, pinnedBadgeIds: [] },
    };

    render(<ProfileScreen />);
    expect(screen.getByText("No badges yet")).toBeOnTheScreen();
  });

  it("edit button opens BadgePicker modal", () => {
    render(<ProfileScreen />);
    // Press the Edit button in the pinned badges section (not the profile Edit)
    fireEvent.press(screen.getByText("Edit"));
    expect(screen.getByText("Select Badges to Pin")).toBeOnTheScreen();
  });

  it("shows tier badge (Free/Pro)", () => {
    render(<ProfileScreen />);
    expect(screen.getByText("Free")).toBeOnTheScreen();
  });

  it("shows unauthenticated fallback when user is null", () => {
    mockUseAuthReturn = {
      ...mockUseAuthReturn,
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    };

    render(<ProfileScreen />);
    expect(screen.getByText("Please sign in")).toBeOnTheScreen();
  });

  // ── Streak status tests ──────────────────────────────────────────

  it('shows "Active" badge when streak is in the current week', () => {
    render(<ProfileScreen />);
    expect(screen.getByText("Active")).toBeOnTheScreen();
  });

  it("shows at-risk banner when streak is 1-2 weeks old", () => {
    mockUseUserStreakReturn = {
      data: { ...mockStreak, last_active_date: "2026-01-26" },
      isLoading: false,
      error: null,
    };

    render(<ProfileScreen />);
    expect(screen.getByText("At Risk")).toBeOnTheScreen();
    expect(
      screen.getByText("Climb this week to keep your streak alive!"),
    ).toBeOnTheScreen();
  });

  it('shows "Broken" badge and banner when streak has expired', () => {
    mockUseUserStreakReturn = {
      data: { ...mockStreak, last_active_date: "2026-01-12" },
      isLoading: false,
      error: null,
    };

    render(<ProfileScreen />);
    expect(screen.getByText("Broken")).toBeOnTheScreen();
    expect(
      screen.getByText("Your streak has ended. Start a new one today!"),
    ).toBeOnTheScreen();
    expect(screen.getByText("0")).toBeOnTheScreen();
  });

  // ── Active Challenges tests ──────────────────────────────────────

  it('renders "Active Challenges" section when challenges exist', () => {
    mockUseAuthReturn = {
      ...mockUseAuthReturn,
      user: { ...mockUser, homeGymId: "gym-1" },
    };
    mockUseActiveChallengesReturn = {
      data: [
        {
          id: "c1",
          name: "Flash Five",
          description: "Flash 5 routes this week",
          criteria: { type: "flash_count", target: 5 },
          start_date: "2026-02-01T00:00:00Z",
          end_date: "2026-02-15T00:00:00Z",
          reward_badge: null,
        },
      ],
      isLoading: false,
      error: null,
    };

    render(<ProfileScreen />);
    expect(screen.getByText("Active Challenges")).toBeOnTheScreen();
    expect(screen.getByText("Flash Five")).toBeOnTheScreen();
  });

  it("does not render challenges section when no active challenges", () => {
    mockUseActiveChallengesReturn = {
      data: [],
      isLoading: false,
      error: null,
    };

    render(<ProfileScreen />);
    expect(screen.queryByText("Active Challenges")).toBeNull();
  });

  it("shows challenge progress from hook data", () => {
    mockUseAuthReturn = {
      ...mockUseAuthReturn,
      user: { ...mockUser, homeGymId: "gym-1" },
    };
    mockUseActiveChallengesReturn = {
      data: [
        {
          id: "c1",
          name: "Send Ten",
          description: "Send 10 routes",
          criteria: { type: "send_count", target: 10 },
          start_date: "2026-02-01T00:00:00Z",
          end_date: "2026-02-15T00:00:00Z",
          reward_badge: null,
        },
      ],
      isLoading: false,
      error: null,
    };
    mockUseChallengeProgressReturn = {
      data: [
        {
          user_id: "user-123",
          challenge_id: "c1",
          progress: 7,
          completed_at: null,
        },
      ],
      isLoading: false,
      error: null,
    };

    render(<ProfileScreen />);
    expect(screen.getByText("7 / 10")).toBeOnTheScreen();
  });

  // ── Stats section tests ────────────────────────────────────────────

  it("renders stats section with total sends and max grade", () => {
    // Default mock has stats: 42 sends, max grade 20 (V8 in v-scale)
    render(<ProfileScreen />);
    expect(screen.getByText("Stats")).toBeOnTheScreen();
    expect(screen.getByText("42")).toBeOnTheScreen();
    expect(screen.getByText("V8")).toBeOnTheScreen();
    expect(screen.getByText("Total Sends")).toBeOnTheScreen();
    expect(screen.getByText("Max Grade")).toBeOnTheScreen();
  });

  it('shows "—" for max grade when user has no sends', () => {
    // New user with 0 sends and null max_grade
    mockUseProfileStatsReturn = {
      data: [{ total_sends: 0, max_grade: null }],
      isLoading: false,
      error: null,
    };

    render(<ProfileScreen />);
    expect(screen.getByText("0")).toBeOnTheScreen();
    expect(screen.getByText("\u2014")).toBeOnTheScreen(); // em dash
  });

  // ── Edit mode tests ────────────────────────────────────────────────

  it("Edit Profile button toggles edit mode", () => {
    render(<ProfileScreen />);

    // Press "Edit Profile" to enter edit mode
    fireEvent.press(screen.getByTestId("edit-profile-button"));

    // Edit mode header and form fields should appear
    expect(screen.getByText("Edit Profile")).toBeOnTheScreen();
    expect(screen.getByTestId("edit-name-input")).toBeOnTheScreen();
    expect(screen.getByTestId("edit-avatar-input")).toBeOnTheScreen();
  });

  it("edit mode populates fields from current user data", () => {
    render(<ProfileScreen />);

    fireEvent.press(screen.getByTestId("edit-profile-button"));

    // Name input should be pre-filled with the current display name
    const nameInput = screen.getByTestId("edit-name-input");
    expect(nameInput.props.value).toBe("TestClimber");

    // Avatar input should be pre-filled with the current URL
    const avatarInput = screen.getByTestId("edit-avatar-input");
    expect(avatarInput.props.value).toBe("https://example.com/avatar.png");
  });

  it("grade system picker shows 3 options", () => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId("edit-profile-button"));

    // All three grade system options should be visible
    expect(screen.getByText("V-Scale")).toBeOnTheScreen();
    expect(screen.getByText("Font")).toBeOnTheScreen();
    expect(screen.getByText("YDS")).toBeOnTheScreen();
  });

  it("cancel button exits edit mode without saving", () => {
    render(<ProfileScreen />);

    // Enter edit mode
    fireEvent.press(screen.getByTestId("edit-profile-button"));
    expect(screen.getByText("Edit Profile")).toBeOnTheScreen();

    // Press Cancel — should return to view mode without calling the mutation
    fireEvent.press(screen.getByTestId("edit-cancel-button"));

    // Edit Profile header should be gone, view mode header should be back
    expect(screen.getByTestId("edit-profile-button")).toBeOnTheScreen();
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  it("save button calls updateProfile mutation and exits edit mode", async () => {
    render(<ProfileScreen />);

    // Enter edit mode
    fireEvent.press(screen.getByTestId("edit-profile-button"));

    // Change the display name
    fireEvent.changeText(screen.getByTestId("edit-name-input"), "NewName");

    // Press Save
    fireEvent.press(screen.getByTestId("edit-save-button"));

    // The mutation should be called with the edited fields
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      userId: "user-123",
      fields: {
        display_name: "NewName",
        avatar_url: "https://example.com/avatar.png",
        preferred_grade_system: "v-scale",
      },
    });
  });

  it("gym picker opens in edit mode", () => {
    render(<ProfileScreen />);

    fireEvent.press(screen.getByTestId("edit-profile-button"));
    fireEvent.press(screen.getByTestId("edit-gym-picker"));

    // The gym picker modal should show with gym names
    expect(screen.getByText("Select Home Gym")).toBeOnTheScreen();
    expect(screen.getByText("Ape Index")).toBeOnTheScreen();
    expect(screen.getByText("Summit Gym")).toBeOnTheScreen();
  });

  // ── Account actions tests ──────────────────────────────────────────

  it("renders export and delete buttons", () => {
    render(<ProfileScreen />);
    expect(screen.getByText("Export My Data")).toBeOnTheScreen();
    expect(screen.getByText("Delete Account")).toBeOnTheScreen();
  });

  it("export button triggers Alert confirmation", () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<ProfileScreen />);

    fireEvent.press(screen.getByTestId("export-data-button"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Export My Data",
      expect.any(String),
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });

  it("delete button triggers Alert confirmation with destructive option", () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    render(<ProfileScreen />);

    fireEvent.press(screen.getByTestId("delete-account-button"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Delete Account",
      expect.stringContaining("permanently"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Delete", style: "destructive" }),
      ]),
    );
    alertSpy.mockRestore();
  });
});
