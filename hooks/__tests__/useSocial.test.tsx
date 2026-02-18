/**
 * useSocial Hook Tests — Follow System & Activity Feed
 *
 * Tests the TanStack Query wrappers for the social/follow system:
 *   - useIsFollowing(targetUserId) — checks if current user follows target
 *   - useToggleFollow(targetUserId) — mutation to follow/unfollow
 *   - useFollowCounts(userId) — follower + following counts
 *   - useActivityFeed() — recent ascents from followed users
 *
 * Mock strategy: mock socialService (not Supabase), mock useAuth
 * for user identity, wrap renderHook in QueryClientProvider.
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock socialService ──────────────────────────────────────────
jest.mock("@/services/social.service", () => ({
  socialService: {
    follow: jest.fn(),
    unfollow: jest.fn(),
    isFollowing: jest.fn(),
    getFollowCounts: jest.fn(),
    getFollowing: jest.fn(),
    getActivityFeed: jest.fn(),
    getUserRecentAscents: jest.fn(),
  },
}));

// ── Mock useAuth ──────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", displayName: "Test User" },
    session: { user: { id: "user-1" } },
    isAuthenticated: true,
  }),
}));

import {
  useIsFollowing,
  useToggleFollow,
  useFollowCounts,
  useActivityFeed,
  useUserRecentAscents,
} from "../useSocial";

const { socialService } = jest.requireMock<{
  socialService: {
    follow: jest.Mock;
    unfollow: jest.Mock;
    isFollowing: jest.Mock;
    getFollowCounts: jest.Mock;
    getFollowing: jest.Mock;
    getActivityFeed: jest.Mock;
    getUserRecentAscents: jest.Mock;
  };
}>("@/services/social.service");

// ── Test wrapper ──────────────────────────────────────────────────
function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// ── useIsFollowing tests ──────────────────────────────────────────

describe("useIsFollowing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true when follow relationship exists", async () => {
    socialService.isFollowing.mockResolvedValueOnce({
      data: {
        follower_id: "user-1",
        following_id: "user-2",
        created_at: "2026-02-10T00:00:00Z",
      },
      error: null,
    });

    const { result } = renderHook(() => useIsFollowing("user-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFollowing).toBe(true);
    expect(socialService.isFollowing).toHaveBeenCalledWith("user-1", "user-2");
  });

  it("returns false when not following", async () => {
    socialService.isFollowing.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useIsFollowing("user-3"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFollowing).toBe(false);
  });
});

// ── useToggleFollow tests ─────────────────────────────────────────

describe("useToggleFollow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls follow when not currently following", async () => {
    // isFollowing query returns null (not following)
    socialService.isFollowing.mockResolvedValue({
      data: null,
      error: null,
    });
    socialService.follow.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const wrapper = createWrapper();

    const { result } = renderHook(() => useToggleFollow("user-2"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.toggleFollow).toBeDefined();
    });

    await act(async () => {
      result.current.toggleFollow();
    });

    expect(socialService.follow).toHaveBeenCalledWith("user-1", "user-2");
    expect(socialService.unfollow).not.toHaveBeenCalled();
  });

  it("calls unfollow when currently following", async () => {
    // isFollowing query returns data (is following)
    socialService.isFollowing.mockResolvedValue({
      data: {
        follower_id: "user-1",
        following_id: "user-2",
        created_at: "2026-02-10T00:00:00Z",
      },
      error: null,
    });
    socialService.unfollow.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const wrapper = createWrapper();

    const { result } = renderHook(() => useToggleFollow("user-2"), {
      wrapper,
    });

    // Wait for isFollowing query to settle
    await waitFor(() => {
      expect(result.current.isFollowing).toBe(true);
    });

    await act(async () => {
      result.current.toggleFollow();
    });

    expect(socialService.unfollow).toHaveBeenCalledWith("user-1", "user-2");
    expect(socialService.follow).not.toHaveBeenCalled();
  });
});

// ── useFollowCounts tests ─────────────────────────────────────────

describe("useFollowCounts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns follower and following counts", async () => {
    socialService.getFollowCounts.mockResolvedValueOnce({
      followers: 42,
      following: 18,
    });

    const { result } = renderHook(() => useFollowCounts("user-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.followers).toBe(42);
    expect(result.current.following).toBe(18);
    expect(socialService.getFollowCounts).toHaveBeenCalledWith("user-2");
  });
});

// ── useActivityFeed tests ─────────────────────────────────────────

describe("useActivityFeed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns ascent data with profile info", async () => {
    socialService.getFollowing.mockResolvedValueOnce({
      data: [
        {
          following_id: "user-2",
          profile: { display_name: "Alex", avatar_url: null },
        },
      ],
      error: null,
    });

    const mockAscents = [
      {
        id: "ascent-1",
        user_id: "user-2",
        status: "sent",
        attempts: 1,
        created_at: "2026-02-10T14:00:00Z",
        route: {
          name: "Crimpy Arete",
          canonical_grade: 10,
          color: "#EF4444",
        },
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];
    socialService.getActivityFeed.mockResolvedValueOnce({
      data: mockAscents,
      error: null,
    });

    const { result } = renderHook(() => useActivityFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.feed).toEqual(mockAscents);
    expect(socialService.getFollowing).toHaveBeenCalledWith("user-1");
    expect(socialService.getActivityFeed).toHaveBeenCalledWith(["user-2"]);
  });

  it("returns empty array when not following anyone", async () => {
    socialService.getFollowing.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useActivityFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.feed).toEqual([]);
    // Should NOT call getActivityFeed when following nobody
    expect(socialService.getActivityFeed).not.toHaveBeenCalled();
  });
});

// ── useUserRecentAscents tests ───────────────────────────────────

describe("useUserRecentAscents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns recent ascents for a specific user", async () => {
    const mockAscents = [
      {
        id: "ascent-1",
        user_id: "user-2",
        status: "sent",
        attempts: 1,
        created_at: "2026-02-15T10:00:00Z",
        route: { name: "Crimpy Arete", canonical_grade: 10, color: "#EF4444" },
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    socialService.getUserRecentAscents.mockResolvedValueOnce({
      data: mockAscents,
      error: null,
    });

    const { result } = renderHook(() => useUserRecentAscents("user-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockAscents);
    expect(socialService.getUserRecentAscents).toHaveBeenCalledWith("user-2");
  });

  it("is disabled when userId is null", () => {
    const { result } = renderHook(() => useUserRecentAscents(null), {
      wrapper: createWrapper(),
    });

    // Query should not fire — stays in loading state with no service call
    expect(socialService.getUserRecentAscents).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
