/**
 * Home Tab Screen Tests — Activity Feed
 *
 * Tests the main home screen that shows:
 *   - Welcome header with user's display name
 *   - Activity feed from followed users (FeedItem list)
 *   - Empty state when not following anyone / no activity
 *
 * Mock strategy:
 *   - useAuth: provides current user info
 *   - useSocial: controls activity feed data
 *   - Native modules: lucide-react-native, expo-image
 *   - grades utility: controlled grade display
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", displayName: "Dawn" },
    isAuthenticated: true,
  }),
}));

// Mock useSocial with __mockFeedData for per-test control
jest.mock("@/hooks/useSocial", () => {
  const mockFeedData = {
    feed: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useActivityFeed: () => mockFeedData,
    __mockFeedData: mockFeedData,
  };
});

jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ArrowLeft: (props: any) => <View testID="icon-arrow-left" {...props} />,
  };
});

jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn().mockReturnValue("V4"),
}));

import HomeScreen from "../index";

const { __mockFeedData } = jest.requireMock<{
  __mockFeedData: {
    feed: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useSocial");

// ── Helpers ──────────────────────────────────────────────────────

function resetMockData() {
  __mockFeedData.feed = [];
  __mockFeedData.isLoading = false;
  __mockFeedData.error = null;
}

// ── Tests ────────────────────────────────────────────────────────

describe("HomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows welcome header with user name", () => {
    render(<HomeScreen />);

    expect(screen.getByText("Welcome Back")).toBeOnTheScreen();
    expect(screen.getByText(/Dawn/)).toBeOnTheScreen();
  });

  it("renders feed items when activity exists", () => {
    __mockFeedData.feed = [
      {
        id: "ascent-1",
        user_id: "user-2",
        status: "sent",
        attempts: 1,
        created_at: "2026-02-10T14:30:00Z",
        route: {
          name: "Crimpy Arete",
          canonical_grade: 10,
          color: "#EF4444",
        },
        profile: {
          display_name: "Alex",
          avatar_url: null,
        },
      },
      {
        id: "ascent-2",
        user_id: "user-3",
        status: "flashed",
        attempts: 1,
        created_at: "2026-02-09T10:00:00Z",
        route: {
          name: "Slab Master",
          canonical_grade: 8,
          color: "#22C55E",
        },
        profile: {
          display_name: "Sam",
          avatar_url: null,
        },
      },
    ];

    render(<HomeScreen />);

    expect(screen.getByText(/Alex/)).toBeOnTheScreen();
    expect(screen.getByText(/Crimpy Arete/)).toBeOnTheScreen();
    expect(screen.getByText(/Sam/)).toBeOnTheScreen();
    expect(screen.getByText(/Slab Master/)).toBeOnTheScreen();
  });

  it("shows empty state when no activity", () => {
    __mockFeedData.feed = [];

    render(<HomeScreen />);

    expect(
      screen.getByText(/Follow climbers to see their activity/)
    ).toBeOnTheScreen();
  });

  it("shows empty state when not following anyone", () => {
    __mockFeedData.feed = [];

    render(<HomeScreen />);

    expect(
      screen.getByText(/Follow climbers to see their activity/)
    ).toBeOnTheScreen();
  });
});
