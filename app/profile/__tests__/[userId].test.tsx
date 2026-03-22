/**
 * Other User Profile Screen Tests
 *
 * Tests the screen that displays another user's profile when
 * navigated to via app/profile/[userId]. Shows:
 *   - Avatar (lg) + display name + tier badge
 *   - Follow button (self-contained FollowButton component)
 *   - Follow counts: "X followers · Y following"
 *   - Profile stats: total sends + max grade
 *   - Streak card: current + longest streak with status badge
 *   - Pinned badges: inline BadgeIcon row
 *   - Recent sends: FeedItem list
 *   - Loading/error states
 *
 * Mock strategy:
 *   - expo-router: provides userId via useLocalSearchParams
 *   - @tanstack/react-query useQuery: dispatched by queryKey for profile data
 *   - @/hooks/useSocial: follow counts, toggle, recent ascents
 *   - @/hooks/useBadges: earned badges, pinned badges, streak
 *   - @/hooks/useProfile: profile stats
 *   - Native modules: lucide-react-native, expo-image
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ userId: "user-2" }),
  useRouter: () => ({ back: mockBack }),
}));

// Mock TanStack Query — the screen uses useQuery directly for profile fetch.
// Other data comes through dedicated hooks (mocked separately below).
jest.mock("@/services/profile.service", () => ({
  profileService: {
    getById: jest.fn(),
  },
}));

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  const mockProfileData = {
    data: null as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    ...actual,
    useQuery: (options: any) => {
      // Profile query — controlled via __mockProfileData
      if (
        options.queryKey &&
        options.queryKey[0] === "profile" &&
        options.queryKey[1] === "user-2"
      ) {
        return mockProfileData;
      }
      // Default for any other useQuery calls (e.g., useIsFollowing inside FollowButton)
      return { data: null, isLoading: false, error: null };
    },
    __mockProfileData: mockProfileData,
  };
});

// ── Mock data containers ─────────────────────────────────────────
// Mutable objects that tests can modify to control what hooks return.

const mockStatsReturn = {
  data: null as any | null,
  isLoading: false,
};

const mockStreakReturn = {
  data: null as any | null,
  isLoading: false,
};

const mockUserBadgesReturn = {
  data: null as any[] | null,
  isLoading: false,
};

const mockPinnedBadgesReturn = {
  data: null as any | null,
  isLoading: false,
};

// Mock useSocial hooks — follow counts and toggle
jest.mock("@/hooks/useSocial", () => ({
  useFollowCounts: () => ({
    followers: 42,
    following: 18,
    isLoading: false,
  }),
  useToggleFollow: () => ({
    isFollowing: false,
    isLoading: false,
    toggleFollow: jest.fn(),
    isPending: false,
  }),
}));

// Mock useRecentSessions — recent session history for profile
jest.mock("@/hooks/useRecentSessions", () => ({
  useRecentSessions: () => ({
    data: [
      {
        id: "session-1",
        user_id: "user-2",
        gym_id: "gym-1",
        started_at: "2026-03-15T10:00:00Z",
        ended_at: "2026-03-15T11:15:00Z",
        duration_minutes: 75,
        gym: { name: "Summit Climbing", logo_url: null },
        ascentCount: 5,
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

// Mock useEnrolledLeaderboards — active leaderboard standings for profile
jest.mock("@/hooks/useEnrolledLeaderboards", () => ({
  useEnrolledLeaderboards: () => ({
    data: [
      {
        id: "entry-1",
        leaderboard_id: "lb-1",
        gym_id: "gym-1",
        gym_name: "Summit Climbing",
        leaderboard_name: "March Madness",
        starts_at: "2026-03-01",
        ends_at: "2026-03-31",
        rank: 3,
        score: 1250,
        total_participants: 50,
        rules: null,
        prizes: null,
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

// Mock useBadges hooks — earned badges, pinned badges, streak
jest.mock("@/hooks/useBadges", () => ({
  useUserBadges: () => mockUserBadgesReturn,
  usePinnedBadges: () => mockPinnedBadgesReturn,
  useUserStreak: () => mockStreakReturn,
}));

// Mock useProfile hooks — profile stats
jest.mock("@/hooks/useProfile", () => ({
  useProfileStats: () => mockStatsReturn,
}));

// Mock useAuth
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    isAuthenticated: true,
  }),
}));

// Mock lucide-react-native
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ArrowLeft: (props: any) => <View testID="icon-arrow-left" {...props} />,
    ChevronRight: (props: any) => <View testID="icon-chevron-right" {...props} />,
    Clock: (props: any) => <View testID="icon-clock" {...props} />,
    Trophy: (props: any) => <View testID="icon-trophy" {...props} />,
  };
});

// Mock expo-image
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

import UserProfileScreen from "../[userId]";

const { __mockProfileData } = jest.requireMock<{
  __mockProfileData: {
    data: any | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@tanstack/react-query");

// ── Helpers ──────────────────────────────────────────────────────

function resetMockData() {
  __mockProfileData.data = null;
  __mockProfileData.isLoading = false;
  __mockProfileData.error = null;

  mockStatsReturn.data = null;
  mockStatsReturn.isLoading = false;

  mockStreakReturn.data = null;
  mockStreakReturn.isLoading = false;

  mockUserBadgesReturn.data = null;
  mockUserBadgesReturn.isLoading = false;

  mockPinnedBadgesReturn.data = null;
  mockPinnedBadgesReturn.isLoading = false;
}

/** Standard profile data used in most tests */
const baseProfile = {
  id: "user-2",
  display_name: "Alex Climber",
  avatar_url: "https://img.com/alex.jpg",
  tier: "pro",
};

// ── Tests ────────────────────────────────────────────────────────

describe("UserProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
    // Pin time so deriveStreakStatus() produces deterministic results.
    // Without this, streak tests fail when the real date drifts far from
    // the mock last_active_date values.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 17)); // Feb 17, 2026
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Existing tests ──────────────────────────────────────────────

  it("shows loading state", () => {
    __mockProfileData.isLoading = true;
    render(<UserProfileScreen />);
    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("renders user display name and avatar", () => {
    __mockProfileData.data = baseProfile;
    render(<UserProfileScreen />);

    expect(screen.getByText("Alex Climber")).toBeOnTheScreen();
  });

  it("renders follow counts", () => {
    __mockProfileData.data = baseProfile;
    render(<UserProfileScreen />);

    expect(screen.getByText(/42 followers/)).toBeOnTheScreen();
    expect(screen.getByText(/18 following/)).toBeOnTheScreen();
  });

  it("shows FollowButton", () => {
    __mockProfileData.data = baseProfile;
    render(<UserProfileScreen />);

    // FollowButton renders a Button with testID="follow-button"
    expect(screen.getByTestId("follow-button")).toBeOnTheScreen();
  });

  it("shows error state on fetch failure", () => {
    __mockProfileData.error = new Error("User not found");
    render(<UserProfileScreen />);

    expect(screen.getByTestId("error-state")).toBeOnTheScreen();
    expect(screen.getByText("User not found")).toBeOnTheScreen();
  });

  // ── Tier badge ──────────────────────────────────────────────────

  it("renders tier badge when user has a tier", () => {
    __mockProfileData.data = baseProfile;
    render(<UserProfileScreen />);

    // The Badge component renders the tier label (capitalized)
    expect(screen.getByText("Pro")).toBeOnTheScreen();
  });

  // ── Stats section ───────────────────────────────────────────────

  it("renders total sends and max grade from stats", () => {
    __mockProfileData.data = baseProfile;
    // Stats RPC returns an array with one row
    mockStatsReturn.data = [{ total_sends: 47, max_grade: 18 }];
    render(<UserProfileScreen />);

    expect(screen.getByText("47")).toBeOnTheScreen();
    expect(screen.getByText(/Total Sends/)).toBeOnTheScreen();
    // canonical_grade 18 in v-scale is "V7"
    expect(screen.getByText("V7")).toBeOnTheScreen();
    expect(screen.getByText(/Max Grade/)).toBeOnTheScreen();
  });

  it("renders dash when stats have no sends", () => {
    __mockProfileData.data = baseProfile;
    mockStatsReturn.data = [{ total_sends: 0, max_grade: null }];
    render(<UserProfileScreen />);

    // Zero sends renders "0", null max grade renders "—"
    expect(screen.getByText("0")).toBeOnTheScreen();
    expect(screen.getByText("—")).toBeOnTheScreen();
  });

  // ── Streak section ──────────────────────────────────────────────

  it("renders streak card with current and longest streak", () => {
    __mockProfileData.data = baseProfile;
    mockStreakReturn.data = {
      current_streak: 5,
      longest_streak: 8,
      last_active_date: "2026-02-16",
    };
    render(<UserProfileScreen />);

    expect(screen.getByTestId("streak-card")).toBeOnTheScreen();
    expect(screen.getByText("5")).toBeOnTheScreen();
    expect(screen.getByText("8")).toBeOnTheScreen();
    expect(screen.getByText(/Current Streak/)).toBeOnTheScreen();
    expect(screen.getByText(/Longest Streak/)).toBeOnTheScreen();
  });

  // ── Pinned badges ──────────────────────────────────────────────

  it("renders pinned badges with badge names", () => {
    __mockProfileData.data = baseProfile;
    // userBadges includes full badge objects via resource embedding
    mockUserBadgesReturn.data = [
      { badge_id: "b1", badge: { id: "b1", name: "First V0", icon_key: "badge-v0" } },
      { badge_id: "b2", badge: { id: "b2", name: "Flash Master", icon_key: "badge-flash" } },
      { badge_id: "b3", badge: { id: "b3", name: "Streak Week", icon_key: "badge-streak" } },
    ];
    // Pinned badge IDs — only b1 and b2 are pinned
    mockPinnedBadgesReturn.data = { pinned_badge_ids: ["b1", "b2"] };
    render(<UserProfileScreen />);

    expect(screen.getByText("First V0")).toBeOnTheScreen();
    expect(screen.getByText("Flash Master")).toBeOnTheScreen();
    // b3 is not pinned, so it shouldn't appear in the pinned section
    expect(screen.queryByText("Streak Week")).not.toBeOnTheScreen();
  });

  it("shows empty state when no pinned badges", () => {
    __mockProfileData.data = baseProfile;
    mockUserBadgesReturn.data = [];
    mockPinnedBadgesReturn.data = { pinned_badge_ids: [] };
    render(<UserProfileScreen />);

    expect(screen.getByText(/No pinned badges/)).toBeOnTheScreen();
  });

  // ── Recent Sessions ────────────────────────────────────────────

  it("renders recent sessions with gym name and duration", () => {
    __mockProfileData.data = baseProfile;
    render(<UserProfileScreen />);

    // Session card should show the gym name from the mock
    expect(screen.getByTestId("session-card-session-1")).toBeOnTheScreen();
    // Duration: 75 min = "1h 15m"
    expect(screen.getByText(/1h 15m/)).toBeOnTheScreen();
    // Ascent count
    expect(screen.getByText(/5 ascents/)).toBeOnTheScreen();
  });

  // ── Enrolled Leaderboards ─────────────────────────────────────

  it("renders enrolled leaderboards with rank and score", () => {
    __mockProfileData.data = baseProfile;
    render(<UserProfileScreen />);

    expect(screen.getByText("March Madness")).toBeOnTheScreen();
    expect(screen.getByText("#3")).toBeOnTheScreen();
    expect(screen.getByText(/1,250 pts/)).toBeOnTheScreen();
  });
});
