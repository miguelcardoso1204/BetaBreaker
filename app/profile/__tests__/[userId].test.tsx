/**
 * Other User Profile Screen Tests
 *
 * Tests the screen that displays another user's profile when
 * navigated to via app/profile/[userId]. Shows:
 *   - Avatar (lg) + display name
 *   - Follow button (self-contained FollowButton component)
 *   - Follow counts: "X followers · Y following"
 *   - Loading/error states
 *
 * Mock strategy:
 *   - expo-router: provides userId via useLocalSearchParams
 *   - useProfile: custom query wrapping profileService.getById
 *   - useSocial hooks: follow counts + follow button state
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

// Mock TanStack Query — the screen uses useQuery internally
// for profile fetching. We mock at the hook level via __mockData.
jest.mock("@/services/profile.service", () => ({
  profileService: {
    getById: jest.fn(),
  },
}));

// Mock the query hook — screen wraps profileService in useQuery
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
      // If this is the profile query, return mock data
      if (
        options.queryKey &&
        options.queryKey[0] === "profile" &&
        options.queryKey[1] === "user-2"
      ) {
        return mockProfileData;
      }
      // For other queries (like useIsFollowing), return defaults
      return { data: null, isLoading: false, error: null };
    },
    __mockProfileData: mockProfileData,
  };
});

// Mock useSocial hooks — control follow state and counts
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
}

// ── Tests ────────────────────────────────────────────────────────

describe("UserProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    __mockProfileData.isLoading = true;
    render(<UserProfileScreen />);
    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("renders user display name and avatar", () => {
    __mockProfileData.data = {
      id: "user-2",
      display_name: "Alex Climber",
      avatar_url: "https://img.com/alex.jpg",
      tier: "free",
    };
    render(<UserProfileScreen />);

    expect(screen.getByText("Alex Climber")).toBeOnTheScreen();
  });

  it("renders follow counts", () => {
    __mockProfileData.data = {
      id: "user-2",
      display_name: "Alex Climber",
      avatar_url: null,
      tier: "free",
    };
    render(<UserProfileScreen />);

    expect(screen.getByText(/42 followers/)).toBeOnTheScreen();
    expect(screen.getByText(/18 following/)).toBeOnTheScreen();
  });

  it("shows FollowButton", () => {
    __mockProfileData.data = {
      id: "user-2",
      display_name: "Alex Climber",
      avatar_url: null,
      tier: "free",
    };
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
});
