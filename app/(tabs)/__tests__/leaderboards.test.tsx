/**
 * Enrolled Leaderboards Tab Tests
 *
 * Tests the Leaderboards tab screen which shows the user's enrolled
 * leaderboard entries across gyms. Each entry shows rank, score, gym name,
 * and the competition period. Users tap a card to navigate to the full
 * leaderboard detail for that gym.
 *
 * This screen integrates:
 *   - useAuth() for the current user's ID
 *   - useEnrolledLeaderboards(userId) for fetching leaderboard data
 *   - expo-router for card → gym leaderboard navigation
 *   - Button component for "Find Gyms" CTA in empty state
 *
 * Mock strategy (matching map.test.tsx __mockData pattern):
 *   - @/hooks/useEnrolledLeaderboards: __mockData pattern (array data)
 *   - @/hooks/useAuth: returns { user: { id: 'test-user-id' } }
 *   - expo-router: useRouter returns { push: mockPush }
 *   - lucide-react-native: Trophy/ChevronRight as simple Views with testIDs
 *   - expo-image: Image as View with testID
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Track what userId is passed to useEnrolledLeaderboards.
// The hook now requires a userId parameter (from useAuth).
const mockUseEnrolledLeaderboards = jest.fn();
jest.mock("@/hooks/useEnrolledLeaderboards", () => {
  const mockData = {
    data: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useEnrolledLeaderboards: (...args: any[]) => {
      mockUseEnrolledLeaderboards(...args);
      return mockData;
    },
    __mockData: mockData,
  };
});

// Mock useAuth — provides the current user context to the screen.
// The screen passes user.id to useEnrolledLeaderboards.
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user-id" },
    session: {},
    isLoading: false,
    isAuthenticated: true,
    role: "climber",
  }),
}));

// Mock expo-router — useRouter returns push for card tap navigation.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock lucide-react-native — replace SVG icons with simple Views.
// Trophy is used in the empty state, ChevronRight in list item cards.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Trophy: (props: any) => <View testID="icon-trophy" {...props} />,
    ChevronRight: (props: any) => (
      <View testID="icon-chevron-right" {...props} />
    ),
  };
});

// Mock expo-image — Image component isn't available in Jest (native module).
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

import LeaderboardsScreen from "../leaderboards";

// Access __mockData to control leaderboard data before each render.
const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useEnrolledLeaderboards");

// ── Fixtures ─────────────────────────────────────────────────────

/**
 * Two mock leaderboard entries — different gyms, different ranks/scores.
 * This lets us verify that both entries render and that tap navigation
 * targets the correct gym.
 */
const mockLeaderboards = [
  {
    id: "entry-1",
    gym_id: "gym-1",
    gym_name: "Summit Climbing Gym",
    period: "2026-W06",
    rank: 3,
    score: 1250,
    total_participants: 45,
  },
  {
    id: "entry-2",
    gym_id: "gym-2",
    gym_name: "Vertical World",
    period: "2026-W06",
    rank: 1,
    score: 2100,
    total_participants: 30,
  },
];

// ── Helper ───────────────────────────────────────────────────────

/** Reset mock data to defaults before each test. */
function resetMocks() {
  __mockData.data = [];
  __mockData.isLoading = false;
  __mockData.error = null;
}

// ── Tests ────────────────────────────────────────────────────────

describe("LeaderboardsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  // ── 1. Loading state ────────────────────────────────────────────

  it("shows loading state", () => {
    // When leaderboard data is still loading, the screen should display
    // an ActivityIndicator so users know content is being fetched.
    __mockData.isLoading = true;

    render(<LeaderboardsScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  // ── 2. Renders leaderboard list ─────────────────────────────────

  it("renders leaderboard list with gym names, ranks, and scores", () => {
    // When data is loaded, each leaderboard entry should display the
    // gym name, rank position, and score so users can see their standings.
    __mockData.data = mockLeaderboards;

    render(<LeaderboardsScreen />);

    // Both gym names should be visible
    expect(screen.getByText("Summit Climbing Gym")).toBeOnTheScreen();
    expect(screen.getByText("Vertical World")).toBeOnTheScreen();

    // Rank displayed as "#N" format
    expect(screen.getByText("#3")).toBeOnTheScreen();
    expect(screen.getByText("#1")).toBeOnTheScreen();

    // Scores should be visible
    expect(screen.getByText("1,250")).toBeOnTheScreen();
    expect(screen.getByText("2,100")).toBeOnTheScreen();
  });

  // ── 3. Empty state ──────────────────────────────────────────────

  it("shows empty state with Find Gyms button when no leaderboards", () => {
    // When the user has no leaderboard entries, we show an encouraging
    // empty state with a CTA to find gyms and start climbing.
    __mockData.data = [];

    render(<LeaderboardsScreen />);

    expect(screen.getByText("No enrolled leaderboards")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Log climbs at a gym to join their weekly leaderboard"
      )
    ).toBeOnTheScreen();
    // "Find Gyms" button should be visible as a CTA
    expect(screen.getByText("Find Gyms")).toBeOnTheScreen();
  });

  // ── 4. Tap navigates to gym leaderboard detail ──────────────────

  it("navigates to gym leaderboard on card press", () => {
    // Tapping a leaderboard card should push the gym leaderboard route
    // so the user can see the full standings for that gym.
    __mockData.data = mockLeaderboards;

    render(<LeaderboardsScreen />);

    // Press the first leaderboard card (Summit Climbing Gym)
    fireEvent.press(screen.getByText("Summit Climbing Gym"));

    expect(mockPush).toHaveBeenCalledWith("/gym/gym-1/leaderboard");
  });

  // ── 5. Passes userId from useAuth to useEnrolledLeaderboards ────

  it("passes userId from useAuth to useEnrolledLeaderboards", () => {
    // The screen should get the user's ID from useAuth() and pass it
    // to useEnrolledLeaderboards(userId) for personalized data.
    render(<LeaderboardsScreen />);

    // Verify the hook was called with the mocked user's ID
    expect(mockUseEnrolledLeaderboards).toHaveBeenCalledWith("test-user-id");
  });
});
