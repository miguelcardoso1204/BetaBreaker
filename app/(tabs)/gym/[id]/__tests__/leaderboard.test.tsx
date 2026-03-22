/**
 * Gym Leaderboard Screen Tests — app/gym/[id]/leaderboard.tsx
 *
 * Tests the gym leaderboard screen which shows:
 *   - LIST MODE: Active/retired leaderboard cards for the gym
 *   - DETAIL MODE: Ranked entries for a selected leaderboard
 *
 * Mock strategy:
 *   - useGymLeaderboards: __mockData pattern for leaderboard list
 *   - useLeaderboard: __mockData pattern for ranked entries
 *   - useGym: returns gym name for the header
 *   - useAuth: returns current user ID for row highlighting
 *   - expo-router: provides gymId via useLocalSearchParams
 *   - lucide-react-native / expo-image: standard icon/image mocks
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock expo-router — provides gymId and optional lb query param
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "gym-1" }),
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock useGymLeaderboards — __mockData pattern for the list view
jest.mock("@/hooks/useGymLeaderboards", () => {
  const mockData = {
    data: null as any[] | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useGymLeaderboards: () => mockData,
    __mockData: mockData,
  };
});

// Mock useLeaderboard — __mockData pattern for the detail view
jest.mock("@/hooks/useLeaderboard", () => {
  const mockData = {
    data: null as any[] | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useLeaderboard: () => mockData,
    __mockData: mockData,
  };
});

// Mock useGyms — useGym for the header gym name
jest.mock("@/hooks/useGyms", () => {
  const gymMockData = {
    data: { id: "gym-1", name: "Summit Climbing" } as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useGym: () => gymMockData,
    useGyms: jest.fn(),
    useToggleFavoriteGym: jest.fn(),
    __mockGymData: gymMockData,
  };
});

// Mock useAuth — provides current user ID for row highlighting
const mockUser = {
  id: "user-1",
  preferredGradeSystem: "v-scale",
};
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock lucide-react-native — replace SVG icons with simple Views
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Trophy: (props: any) => <View testID="icon-trophy" {...props} />,
    ChevronRight: (props: any) => <View testID="icon-chevron" {...props} />,
    ChevronLeft: (props: any) => <View testID="icon-chevron-left" {...props} />,
    Users: (props: any) => <View testID="icon-users" {...props} />,
    ScrollText: (props: any) => <View testID="icon-scroll-text" {...props} />,
    X: (props: any) => <View testID="icon-x" {...props} />,
  };
});

// Mock expo-image
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

import LeaderboardScreen from "../leaderboard";

// Access mock data objects
const { __mockData: listMockData } = jest.requireMock<{
  __mockData: { data: any[] | null; isLoading: boolean; error: Error | null };
}>("@/hooks/useGymLeaderboards");

const { __mockData: detailMockData } = jest.requireMock<{
  __mockData: { data: any[] | null; isLoading: boolean; error: Error | null };
}>("@/hooks/useLeaderboard");

// ── Fixtures ─────────────────────────────────────────────────────

const mockLeaderboards = [
  {
    id: "lb-1",
    name: "March Madness",
    starts_at: "2026-03-01T00:00:00Z",
    ends_at: "2026-03-31T23:59:59Z",
    total_participants: 25,
  },
  {
    id: "lb-2",
    name: "Flash Friday",
    starts_at: "2026-03-14T00:00:00Z",
    ends_at: "2026-03-14T23:59:59Z",
    total_participants: 12,
  },
];

const mockEntries = [
  {
    id: "entry-1",
    user_id: "user-2",
    score: 15,
    rank: 1,
    profile: { display_name: "Alex Honnold", avatar_url: null },
  },
  {
    id: "entry-2",
    user_id: "user-1", // current user
    score: 10,
    rank: 2,
    profile: { display_name: "Tommy Caldwell", avatar_url: "https://example.com/tommy.jpg" },
  },
];

// ── Helper ───────────────────────────────────────────────────────

function resetMocks() {
  listMockData.data = null;
  listMockData.isLoading = false;
  listMockData.error = null;
  detailMockData.data = null;
  detailMockData.isLoading = false;
  detailMockData.error = null;
  mockUser.id = "user-1";
  mockUser.preferredGradeSystem = "v-scale";
}

// ── Tests ────────────────────────────────────────────────────────

describe("LeaderboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  // ── List view tests ───────────────────────────────────────────

  it("shows loading indicator while fetching leaderboard list", () => {
    listMockData.isLoading = true;

    render(<LeaderboardScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("renders leaderboard cards with names", () => {
    listMockData.data = mockLeaderboards;

    render(<LeaderboardScreen />);

    expect(screen.getByText("March Madness")).toBeOnTheScreen();
    expect(screen.getByText("Flash Friday")).toBeOnTheScreen();
  });

  it("shows active/retired filter buttons", () => {
    listMockData.data = [];

    render(<LeaderboardScreen />);

    expect(screen.getByTestId("filter-active")).toBeOnTheScreen();
    expect(screen.getByTestId("filter-retired")).toBeOnTheScreen();
  });

  it("shows empty state when no leaderboards", () => {
    listMockData.data = [];

    render(<LeaderboardScreen />);

    expect(screen.getByText("No active leaderboards at this gym")).toBeOnTheScreen();
  });

  it("shows gym name in header", () => {
    listMockData.data = [];

    render(<LeaderboardScreen />);

    expect(screen.getByText("Summit Climbing Leaderboards")).toBeOnTheScreen();
  });

  // ── Detail view tests ──────────────────────────────────────────

  it("shows ranked entries when a leaderboard card is tapped", () => {
    listMockData.data = mockLeaderboards;
    detailMockData.data = mockEntries;

    render(<LeaderboardScreen />);

    // Tap the first leaderboard card
    fireEvent.press(screen.getByTestId("leaderboard-card-lb-1"));

    // Should show ranked entries
    expect(screen.getByText("Alex Honnold")).toBeOnTheScreen();
    expect(screen.getByText("Tommy Caldwell")).toBeOnTheScreen();
    expect(screen.getByText("#1")).toBeOnTheScreen();
    expect(screen.getByText("#2")).toBeOnTheScreen();
  });

  it("highlights current user row in detail view", () => {
    listMockData.data = mockLeaderboards;
    detailMockData.data = mockEntries;

    render(<LeaderboardScreen />);

    fireEvent.press(screen.getByTestId("leaderboard-card-lb-1"));

    // Current user (user-1) should have a highlighted row
    const highlightedRow = screen.getByTestId("leaderboard-row-user-1");
    expect(highlightedRow).toBeOnTheScreen();
  });

  it("shows back button in detail view", () => {
    listMockData.data = mockLeaderboards;
    detailMockData.data = mockEntries;

    render(<LeaderboardScreen />);

    fireEvent.press(screen.getByTestId("leaderboard-card-lb-1"));

    expect(screen.getByTestId("back-to-list")).toBeOnTheScreen();
  });

  it("returns to list view when back is pressed", () => {
    listMockData.data = mockLeaderboards;
    detailMockData.data = mockEntries;

    render(<LeaderboardScreen />);

    // Enter detail view
    fireEvent.press(screen.getByTestId("leaderboard-card-lb-1"));
    expect(screen.getByText("Alex Honnold")).toBeOnTheScreen();

    // Go back
    fireEvent.press(screen.getByTestId("back-to-list"));

    // Should be back in list view
    expect(screen.getByText("March Madness")).toBeOnTheScreen();
    expect(screen.getByText("Flash Friday")).toBeOnTheScreen();
  });
});
