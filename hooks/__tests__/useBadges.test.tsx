/**
 * useBadges / useUserBadges / useUserStreak Hook Tests
 *
 * These hooks wrap gamificationService methods with TanStack Query, providing:
 * - Caching: badge data is cached by user ID
 * - Loading/error states: screens get { data, isLoading, error }
 * - Conditional fetching: user-specific hooks disable when userId is undefined
 *
 * Mock strategy: We mock the SERVICE layer (gamificationService), not Supabase.
 * The hook just calls gamificationService methods and lets TanStack Query
 * manage caching, loading states, and refetch logic.
 *
 * TanStack Query setup: Each test creates a fresh QueryClient (with retry
 * disabled) wrapped in a QueryClientProvider to prevent cache leakage.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock gamificationService ────────────────────────────────────────
jest.mock("@/services/gamification.service", () => ({
  gamificationService: {
    getBadges: jest.fn(),
    getUserBadges: jest.fn(),
    getUserStreak: jest.fn(),
    getPinnedBadges: jest.fn(),
    setPinnedBadges: jest.fn(),
  },
}));

import {
  useBadges,
  useUserBadges,
  useUserStreak,
  usePinnedBadges,
  useSetPinnedBadges,
} from "../useBadges";

const { gamificationService } = jest.requireMock<{
  gamificationService: {
    getBadges: jest.Mock;
    getUserBadges: jest.Mock;
    getUserStreak: jest.Mock;
    getPinnedBadges: jest.Mock;
    setPinnedBadges: jest.Mock;
  };
}>("@/services/gamification.service");

// ── Test wrapper ──────────────────────────────────────────────────
// TanStack Query hooks must render inside a QueryClientProvider.
// Fresh client per test with retry disabled to avoid flaky timing.
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

// ── Fixtures ──────────────────────────────────────────────────────

const mockBadges = [
  { id: "b1", name: "First V0", criteria_type: "first_grade", criteria_value: 0, icon_key: "badge-v0" },
  { id: "b2", name: "First Send", criteria_type: "total_sends", criteria_value: 1, icon_key: "badge-first-send" },
];

const mockUserBadges = [
  {
    user_id: "user-1",
    badge_id: "b1",
    awarded_at: "2026-01-10T00:00:00Z",
    badge: { name: "First V0", icon_key: "badge-v0" },
  },
];

const mockStreak = {
  user_id: "user-1",
  streak_type: "weekly",
  current_streak: 5,
  longest_streak: 8,
  last_active_week: "2026-02-03",
};

// ── useBadges ──────────────────────────────────────────────────────

describe("useBadges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Before the query resolves, isLoading should be true — screens use
    // this to show a skeleton or spinner in the badge gallery.
    gamificationService.getBadges.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useBadges(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns badge definitions on success", async () => {
    // The service returns { data, error } — the hook unwraps it and
    // exposes just the data array via TanStack Query.
    gamificationService.getBadges.mockResolvedValueOnce({
      data: mockBadges,
      error: null,
    });

    const { result } = renderHook(() => useBadges(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockBadges);
  });

  it("returns error on failure", async () => {
    // When the service errors, TanStack Query sets the error state.
    gamificationService.getBadges.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(() => useBadges(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});

// ── useUserBadges ──────────────────────────────────────────────────

describe("useUserBadges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    gamificationService.getUserBadges.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useUserBadges("user-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns earned badges on success", async () => {
    // Each user badge includes the embedded badge definition (name,
    // icon_key) so the UI can render the badge without a second query.
    gamificationService.getUserBadges.mockResolvedValueOnce({
      data: mockUserBadges,
      error: null,
    });

    const { result } = renderHook(() => useUserBadges("user-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockUserBadges);
    expect(gamificationService.getUserBadges).toHaveBeenCalledWith("user-1");
  });

  it("returns error on failure", async () => {
    gamificationService.getUserBadges.mockResolvedValueOnce({
      data: null,
      error: { message: "Forbidden" },
    });

    const { result } = renderHook(() => useUserBadges("user-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it("is disabled when userId is undefined", () => {
    // When userId is undefined (e.g., user not yet authenticated), the
    // query should NOT fire. TanStack Query's `enabled: !!userId` option
    // prevents unnecessary requests and avoids errors from passing
    // undefined to the service.
    const { result } = renderHook(() => useUserBadges(undefined), {
      wrapper: createWrapper(),
    });

    // isPending is true because the query hasn't run yet (disabled)
    // but fetchStatus is 'idle' (not actually fetching)
    expect(result.current.fetchStatus).toBe("idle");
    expect(gamificationService.getUserBadges).not.toHaveBeenCalled();
  });
});

// ── useUserStreak ──────────────────────────────────────────────────

describe("useUserStreak", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns streak data on success", async () => {
    // The streak includes current_streak, longest_streak, and
    // last_active_week — used by the profile screen to show the
    // user's climbing consistency.
    gamificationService.getUserStreak.mockResolvedValueOnce({
      data: mockStreak,
      error: null,
    });

    const { result } = renderHook(() => useUserStreak("user-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockStreak);
    expect(gamificationService.getUserStreak).toHaveBeenCalledWith("user-1");
  });

  it("returns error on failure", async () => {
    gamificationService.getUserStreak.mockResolvedValueOnce({
      data: null,
      error: { message: "Connection refused" },
    });

    const { result } = renderHook(() => useUserStreak("user-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it("is disabled when userId is undefined", () => {
    // Same pattern as useUserBadges — don't fetch if no userId
    const { result } = renderHook(() => useUserStreak(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(gamificationService.getUserStreak).not.toHaveBeenCalled();
  });
});

// ── usePinnedBadges ────────────────────────────────────────────────

describe("usePinnedBadges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns pinned badge IDs on success", async () => {
    // usePinnedBadges fetches the pinned_badge_ids array from the user's
    // profile. The UI uses these IDs to resolve full badge objects from
    // the user's earned badges.
    gamificationService.getPinnedBadges.mockResolvedValueOnce({
      data: { pinned_badge_ids: ["badge-uuid-1", "badge-uuid-2"] },
      error: null,
    });

    const { result } = renderHook(() => usePinnedBadges("user-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({
      pinned_badge_ids: ["badge-uuid-1", "badge-uuid-2"],
    });
    expect(gamificationService.getPinnedBadges).toHaveBeenCalledWith("user-1");
  });

  it("is disabled when userId is undefined", () => {
    // Same guard as other user-specific hooks — prevents fetching before
    // the user is authenticated.
    const { result } = renderHook(() => usePinnedBadges(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(gamificationService.getPinnedBadges).not.toHaveBeenCalled();
  });
});

// ── useSetPinnedBadges ────────────────────────────────────────────

describe("useSetPinnedBadges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls service with userId and badgeIds", async () => {
    // useSetPinnedBadges wraps a mutation that updates the pinned badge
    // IDs on the user's profile. The DB trigger enforces tier limits.
    gamificationService.setPinnedBadges.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useSetPinnedBadges(), {
      wrapper: createWrapper(),
    });

    // Fire the mutation with userId and badge IDs
    await result.current.mutateAsync({
      userId: "user-1",
      badgeIds: ["badge-uuid-1"],
    });

    expect(gamificationService.setPinnedBadges).toHaveBeenCalledWith(
      "user-1",
      ["badge-uuid-1"]
    );
  });

  it("invalidates pinned badges cache on success", async () => {
    // After successfully updating pinned badges, the query cache for
    // pinned badges should be invalidated so the UI reflects the change.
    gamificationService.setPinnedBadges.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // Pre-populate the cache with stale data
    gamificationService.getPinnedBadges.mockResolvedValueOnce({
      data: { pinned_badge_ids: [] },
      error: null,
    });

    const wrapper = createWrapper();
    const { result: pinnedResult } = renderHook(
      () => usePinnedBadges("user-1"),
      { wrapper }
    );

    // Wait for initial query to resolve
    await waitFor(() => {
      expect(pinnedResult.current.isLoading).toBe(false);
    });

    // Now render the mutation hook in the same QueryClient context
    const { result: mutationResult } = renderHook(
      () => useSetPinnedBadges(),
      { wrapper }
    );

    // Set up the refetch mock to return updated data
    gamificationService.getPinnedBadges.mockResolvedValueOnce({
      data: { pinned_badge_ids: ["badge-uuid-1"] },
      error: null,
    });

    // Fire the mutation
    await mutationResult.current.mutateAsync({
      userId: "user-1",
      badgeIds: ["badge-uuid-1"],
    });

    // After mutation success, the pinned badges cache is invalidated and
    // re-fetched — verify the service was called again
    await waitFor(() => {
      expect(gamificationService.getPinnedBadges).toHaveBeenCalledTimes(2);
    });
  });
});
