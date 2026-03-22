/**
 * Enrolled Leaderboards Tab Tests
 *
 * Tests the Leaderboards tab screen which shows the user's enrolled
 * leaderboard entries across gyms, filterable by active/retired status.
 * Each entry shows rank, leaderboard name, gym name, scoring model, and score.
 *
 * This screen integrates:
 *   - useAuth() for the current user's ID
 *   - useEnrolledLeaderboards(userId, active) for fetching data
 *   - expo-router for card → gym leaderboard navigation
 *   - Button component for "Find Gyms" CTA in empty state
 *
 * Mock strategy (matching __mockData pattern):
 *   - @/hooks/useEnrolledLeaderboards: __mockData pattern (array data)
 *   - @/hooks/useAuth: returns { user: { id: 'test-user-id' } }
 *   - expo-router: useRouter returns { push: mockPush }
 *   - lucide-react-native: Trophy/ChevronRight as simple Views
 *   - expo-image: Image as View
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Track what args are passed to useEnrolledLeaderboards.
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

// Mock useAuth — provides the current user context
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user-id" },
    session: {},
    isLoading: false,
    isAuthenticated: true,
    role: "climber",
  }),
}));

// Mock expo-router
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock lucide-react-native — replace SVG icons with simple Views
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Trophy: (props: any) => <View testID="icon-trophy" {...props} />,
    ChevronRight: (props: any) => (
      <View testID="icon-chevron-right" {...props} />
    ),
  };
});

// Mock expo-image
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

const mockLeaderboards = [
  {
    id: "entry-1",
    leaderboard_id: "lb-1",
    gym_id: "gym-1",
    gym_name: "Summit Climbing Gym",
    leaderboard_name: "March Madness",
    starts_at: "2026-03-01T00:00:00Z",
    ends_at: "2026-03-31T23:59:59Z",
    rank: 3,
    score: 1250,
    total_participants: 45,
  },
  {
    id: "entry-2",
    leaderboard_id: "lb-2",
    gym_id: "gym-2",
    gym_name: "Vertical World",
    leaderboard_name: "Volume Week",
    starts_at: "2026-03-01T00:00:00Z",
    ends_at: "2026-03-07T23:59:59Z",
    rank: 1,
    score: 2100,
    total_participants: 30,
  },
];

// ── Helper ───────────────────────────────────────────────────────

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

  it("shows loading state", () => {
    __mockData.isLoading = true;
    render(<LeaderboardsScreen />);
    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("renders leaderboard list with names, ranks, and scores", () => {
    __mockData.data = mockLeaderboards;
    render(<LeaderboardsScreen />);

    // Leaderboard names
    expect(screen.getByText("March Madness")).toBeOnTheScreen();
    expect(screen.getByText("Volume Week")).toBeOnTheScreen();

    // Gym names
    expect(screen.getByText("Summit Climbing Gym")).toBeOnTheScreen();
    expect(screen.getByText("Vertical World")).toBeOnTheScreen();

    // Ranks
    expect(screen.getByText("#3")).toBeOnTheScreen();
    expect(screen.getByText("#1")).toBeOnTheScreen();

    // Scores
    expect(screen.getByText("1,250 pts")).toBeOnTheScreen();
    expect(screen.getByText("2,100 pts")).toBeOnTheScreen();
  });

  it("shows empty state with Find Gyms button when no leaderboards", () => {
    __mockData.data = [];
    render(<LeaderboardsScreen />);

    expect(screen.getByText("No leaderboards found")).toBeOnTheScreen();
    expect(screen.getByText("Log climbs at a gym to join their leaderboards")).toBeOnTheScreen();
    expect(screen.getByText("Find Gyms")).toBeOnTheScreen();
  });

  it("navigates to gym leaderboard on card press", () => {
    __mockData.data = mockLeaderboards;
    render(<LeaderboardsScreen />);

    fireEvent.press(screen.getByTestId("leaderboard-card-lb-1"));

    expect(mockPush).toHaveBeenCalledWith("/(tabs)/gym/gym-1/leaderboard?lb=lb-1");
  });

  it("passes userId and active flag to useEnrolledLeaderboards", () => {
    render(<LeaderboardsScreen />);

    // Default: active=true
    expect(mockUseEnrolledLeaderboards).toHaveBeenCalledWith("test-user-id", true);
  });

  it("shows active/retired filter buttons", () => {
    render(<LeaderboardsScreen />);

    expect(screen.getByTestId("filter-active")).toBeOnTheScreen();
    expect(screen.getByTestId("filter-retired")).toBeOnTheScreen();
  });

  it("switches to retired filter on press", () => {
    render(<LeaderboardsScreen />);

    fireEvent.press(screen.getByTestId("filter-retired"));

    // After pressing retired, the hook should be called with active=false
    expect(mockUseEnrolledLeaderboards).toHaveBeenCalledWith("test-user-id", false);
  });
});
