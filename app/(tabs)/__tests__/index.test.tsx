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
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", displayName: "Dawn" },
    isAuthenticated: true,
  }),
}));

// Mock useUnreadCount — the home screen uses this for the bell badge
jest.mock("@/hooks/useNotifications", () => {
  const mockUnreadData = {
    count: 0,
    isLoading: false,
  };
  return {
    useUnreadCount: () => mockUnreadData,
    __mockUnreadData: mockUnreadData,
  };
});

// Mock expo-router for navigation assertions
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
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
    Bell: (props: any) => <View testID="icon-bell" {...props} />,
    RefreshCw: (props: any) => <View testID="icon-refresh" {...props} />,
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

// Mock useRouteSuggestions with mutable data for per-test control
jest.mock("@/hooks/useRouteSuggestions", () => {
  const mockSuggestionsData = {
    suggestions: undefined as any[] | undefined,
    isLoading: false,
    error: null as Error | null,
    hasAccess: true,
    tier: "pro",
    hasMore: false,
    refresh: jest.fn(),
    noHomeGym: false,
  };
  return {
    useRouteSuggestions: () => mockSuggestionsData,
    __mockSuggestionsData: mockSuggestionsData,
  };
});

import HomeScreen from "../index";

const { __mockFeedData } = jest.requireMock<{
  __mockFeedData: {
    feed: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useSocial");

const { __mockUnreadData } = jest.requireMock<{
  __mockUnreadData: {
    count: number;
    isLoading: boolean;
  };
}>("@/hooks/useNotifications");

const { __mockSuggestionsData } = jest.requireMock<{
  __mockSuggestionsData: {
    suggestions: any[] | undefined;
    isLoading: boolean;
    error: Error | null;
    hasAccess: boolean;
    tier: string;
    hasMore: boolean;
    refresh: jest.Mock;
    noHomeGym: boolean;
  };
}>("@/hooks/useRouteSuggestions");

// ── Helpers ──────────────────────────────────────────────────────

function resetMockData() {
  __mockFeedData.feed = [];
  __mockFeedData.isLoading = false;
  __mockFeedData.error = null;
  __mockUnreadData.count = 0;
  __mockUnreadData.isLoading = false;
  __mockSuggestionsData.suggestions = undefined;
  __mockSuggestionsData.isLoading = false;
  __mockSuggestionsData.error = null;
  __mockSuggestionsData.hasAccess = true;
  __mockSuggestionsData.tier = "pro";
  __mockSuggestionsData.hasMore = false;
  __mockSuggestionsData.noHomeGym = false;
  mockPush.mockClear();
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

  // ── Notification Bell Tests ──────────────────────────────────────

  it("renders the notification bell in the header", () => {
    render(<HomeScreen />);

    expect(screen.getByTestId("icon-bell")).toBeOnTheScreen();
  });

  it("shows unread count on the bell badge", () => {
    __mockUnreadData.count = 5;

    render(<HomeScreen />);

    expect(screen.getByText("5")).toBeOnTheScreen();
    expect(screen.getByTestId("notification-badge")).toBeOnTheScreen();
  });

  it("navigates to notification center when bell is pressed", () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Notifications" }));

    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  // ── Suggestions Card Tests ──────────────────────────────────────

  it("renders suggestions card for Pro user with home gym and suggestions", () => {
    // When the user has Pro access, a home gym, and suggestion data,
    // the SuggestionsCard should appear on the home screen.
    __mockSuggestionsData.suggestions = [
      {
        id: "r1",
        name: "Overhang Blitz",
        canonical_grade: 12,
        color: "#EF4444",
        status: "active",
        tags: ["overhang"],
        score: 3,
      },
    ];
    __mockSuggestionsData.hasAccess = true;
    __mockSuggestionsData.noHomeGym = false;

    render(<HomeScreen />);

    expect(screen.getByText("Suggested for You")).toBeOnTheScreen();
    expect(screen.getByText("Overhang Blitz")).toBeOnTheScreen();
  });

  it("does not render suggestions card for free-tier user", () => {
    __mockSuggestionsData.hasAccess = false;
    __mockSuggestionsData.tier = "free";
    __mockSuggestionsData.suggestions = undefined;

    render(<HomeScreen />);

    expect(screen.queryByText("Suggested for You")).toBeNull();
  });
});
