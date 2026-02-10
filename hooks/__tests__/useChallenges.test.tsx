/**
 * useChallenges Hook Tests (Step 8.4)
 *
 * These hooks wrap challengesService methods with TanStack Query, providing:
 * - Caching: challenge data is cached by gym ID and user ID
 * - Loading/error states: screens get { data, isLoading, error }
 * - Conditional fetching: hooks disable when required IDs are undefined
 *
 * Mock strategy: Mock the SERVICE layer (challengesService), not Supabase.
 * The hook just calls service methods and lets TanStack Query manage caching.
 *
 * TanStack Query setup: Each test creates a fresh QueryClient (with retry
 * disabled) wrapped in a QueryClientProvider to prevent cache leakage.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock challengesService ──────────────────────────────────────────
jest.mock("@/services/challenges.service", () => ({
  challengesService: {
    getActiveChallenges: jest.fn(),
    getAllChallenges: jest.fn(),
    getUserChallengeProgress: jest.fn(),
    getUserProgressForChallenge: jest.fn(),
  },
}));

import {
  useActiveChallenges,
  useAllChallenges,
  useChallengeProgress,
  useSingleChallengeProgress,
} from "../useChallenges";

const { challengesService } = jest.requireMock<{
  challengesService: {
    getActiveChallenges: jest.Mock;
    getAllChallenges: jest.Mock;
    getUserChallengeProgress: jest.Mock;
    getUserProgressForChallenge: jest.Mock;
  };
}>("@/services/challenges.service");

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

const mockActiveChallenges = [
  {
    id: "c1",
    name: "Flash Five",
    criteria: { type: "flash_count", target: 5 },
    reward_badge: { name: "Flash Master", icon_key: "badge-flash" },
  },
];

const mockAllChallenges = [
  { id: "c1", name: "Flash Five", start_date: "2026-02-01" },
  { id: "c2", name: "Old Challenge", start_date: "2026-01-01" },
];

const mockProgress = [
  {
    user_id: "user-1",
    challenge_id: "c1",
    progress: 3,
    completed_at: null,
    challenge: { name: "Flash Five", criteria: { type: "flash_count", target: 5 } },
  },
];

// ===========================================================================
// useActiveChallenges
// ===========================================================================

describe("useActiveChallenges", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns data on success", async () => {
    // When the service resolves with data, the hook should expose it
    // via the data property for the component to render.
    challengesService.getActiveChallenges.mockResolvedValue({
      data: mockActiveChallenges,
      error: null,
    });

    const { result } = renderHook(() => useActiveChallenges("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockActiveChallenges));
    expect(challengesService.getActiveChallenges).toHaveBeenCalledWith("gym-1");
  });

  it("disabled when gymId is undefined", () => {
    // When gymId is undefined (e.g., user hasn't set a home gym),
    // the query should not fire. isLoading stays false, data is undefined.
    const { result } = renderHook(() => useActiveChallenges(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(challengesService.getActiveChallenges).not.toHaveBeenCalled();
  });

  it("throws on error", async () => {
    // When the service returns an error, TanStack Query should throw it.
    // The hook re-throws Supabase errors so components can show error UI.
    challengesService.getActiveChallenges.mockResolvedValue({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(() => useActiveChallenges("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});

// ===========================================================================
// useAllChallenges
// ===========================================================================

describe("useAllChallenges", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns data on success", async () => {
    challengesService.getAllChallenges.mockResolvedValue({
      data: mockAllChallenges,
      error: null,
    });

    const { result } = renderHook(() => useAllChallenges("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockAllChallenges));
    expect(challengesService.getAllChallenges).toHaveBeenCalledWith("gym-1");
  });

  it("disabled when gymId is undefined", () => {
    const { result } = renderHook(() => useAllChallenges(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(challengesService.getAllChallenges).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// useChallengeProgress
// ===========================================================================

describe("useChallengeProgress", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns data on success", async () => {
    challengesService.getUserChallengeProgress.mockResolvedValue({
      data: mockProgress,
      error: null,
    });

    const { result } = renderHook(
      () => useChallengeProgress("user-1", "gym-1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toEqual(mockProgress));
    expect(challengesService.getUserChallengeProgress).toHaveBeenCalledWith(
      "user-1",
      "gym-1",
    );
  });

  it("disabled when userId is undefined", () => {
    const { result } = renderHook(
      () => useChallengeProgress(undefined, "gym-1"),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(challengesService.getUserChallengeProgress).not.toHaveBeenCalled();
  });

  it("disabled when gymId is undefined", () => {
    const { result } = renderHook(
      () => useChallengeProgress("user-1", undefined),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(challengesService.getUserChallengeProgress).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// useSingleChallengeProgress
// ===========================================================================

describe("useSingleChallengeProgress", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null when no progress exists", async () => {
    // A user who hasn't started a challenge has no progress row.
    // maybeSingle() in the service returns { data: null, error: null }.
    challengesService.getUserProgressForChallenge.mockResolvedValue({
      data: null,
      error: null,
    });

    const { result } = renderHook(
      () => useSingleChallengeProgress("user-1", "c1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("disabled when challengeId is undefined", () => {
    const { result } = renderHook(
      () => useSingleChallengeProgress("user-1", undefined),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(challengesService.getUserProgressForChallenge).not.toHaveBeenCalled();
  });
});
