// app/(tabs)/__tests__/profile.test.tsx
//
// Tests for the Profile screen — the user's personal dashboard showing
// their avatar, name, streak stats, tier badge, and pinned achievements.
//
// MOCK STRATEGY:
// - useAuth: Mocked to control user data (name, avatar, tier, pinned IDs)
// - useUserBadges: Mocked to provide earned badge data
// - useUserStreak: Mocked to provide streak data
// - usePinnedBadges: Mocked to provide resolved pinned badge IDs
// - useSetPinnedBadges: Mocked to verify save interactions
// - expo-image: Mocked as View (no native image runtime in Jest)
//
// Each test configures these mocks to simulate different user states:
// authenticated vs. unauthenticated, badges earned vs. none, etc.

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

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
  // last_active_date (not last_active_week) — matches the DB column name.
  // Set to Mon Feb 2, 2026 (same ISO week as the fake system time below)
  // so deriveStreakStatus() computes "active" by default.
  last_active_date: "2026-02-02",
};

// Mock useAuth — controls whether the user is authenticated and their profile
let mockUseAuthReturn: any = {
  user: mockUser,
  session: { access_token: "test" },
  isAuthenticated: true,
  isLoading: false,
  role: "climber",
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
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
const mockMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockUseSetPinnedBadgesReturn = {
  mutateAsync: mockMutateAsync,
  isPending: false,
};

jest.mock("@/hooks/useBadges", () => ({
  useUserBadges: () => mockUseUserBadgesReturn,
  useUserStreak: () => mockUseUserStreakReturn,
  usePinnedBadges: () => mockUsePinnedBadgesReturn,
  useSetPinnedBadges: () => mockUseSetPinnedBadgesReturn,
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
    // Thu Feb 5, 2026 → ISO week starting Mon Feb 2. When last_active_date
    // is "2026-02-02" (the default mock), gap = 0 → status = "active".
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
      signOut: jest.fn(),
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows loading state while data loads", () => {
    // When useAuth is still loading, show a loading indicator.
    // This happens briefly on app startup while the session is restored.
    mockUseAuthReturn = {
      ...mockUseAuthReturn,
      isLoading: true,
      user: null,
    };

    render(<ProfileScreen />);
    expect(screen.getByText("Loading...")).toBeOnTheScreen();
  });

  it("renders avatar and display name", () => {
    // The profile header shows the user's avatar (or initials) and
    // their display name prominently at the top of the screen.
    render(<ProfileScreen />);
    expect(screen.getByText("TestClimber")).toBeOnTheScreen();
  });

  it("renders streak data (current + longest)", () => {
    // Streak stats show the user's current weekly climbing streak
    // and their all-time longest streak for motivation.
    render(<ProfileScreen />);
    expect(screen.getByText("5")).toBeOnTheScreen(); // current streak
    expect(screen.getByText("8")).toBeOnTheScreen(); // longest streak
  });

  it("renders pinned badges", () => {
    // Pinned badges should display with their names visible.
    // The profile resolves pinned IDs against earned badges.
    render(<ProfileScreen />);
    // b1 = "First V0" is pinned
    expect(screen.getByText("First V0")).toBeOnTheScreen();
  });

  it('shows "No badges yet" when user has zero badges', () => {
    // New users who haven't earned any badges should see an empty state
    // message instead of a broken or empty badge section.
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
    // The Edit button in the pinned badges section should open the
    // BadgePicker modal where users select which badges to pin.
    render(<ProfileScreen />);

    // Press the Edit button to open the picker
    fireEvent.press(screen.getByText("Edit"));

    // The BadgePicker modal should now be visible with the "Select Badges to Pin" title
    expect(screen.getByText("Select Badges to Pin")).toBeOnTheScreen();
  });

  it("shows tier badge (Free/Pro)", () => {
    // The user's subscription tier is displayed as a badge/label
    // near their name, helping them understand their current plan.
    render(<ProfileScreen />);
    expect(screen.getByText("Free")).toBeOnTheScreen();
  });

  it("shows unauthenticated fallback when user is null", () => {
    // When there's no authenticated user (e.g., session expired),
    // show a message prompting them to sign in.
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
  // These verify that the profile screen correctly derives streak status
  // from the DB values and renders the appropriate StreakCard + banner.

  it('shows "Active" badge when streak is in the current week', () => {
    // Default mock has last_active_date "2026-02-02" (same ISO week as
    // the fake system time Feb 5). deriveStreakStatus → active.
    render(<ProfileScreen />);
    expect(screen.getByText("Active")).toBeOnTheScreen();
  });

  it("shows at-risk banner when streak is 1-2 weeks old", () => {
    // last_active_date set to Mon Jan 26 — 1 ISO week before the
    // reference week (Feb 2). deriveStreakStatus → at_risk.
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
    // last_active_date set to Mon Jan 12 — 3 ISO weeks before the
    // reference week (Feb 2). deriveStreakStatus → broken, displayStreak = 0.
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
    // displayStreak should be 0 when broken (overrides stale DB value of 5)
    expect(screen.getByText("0")).toBeOnTheScreen();
  });
});
