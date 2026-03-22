/**
 * useScores Hook Tests — TanStack Query Wrappers for Competition Scores
 *
 * These hooks wrap scoresService with TanStack Query to provide:
 *   - useEventScores(eventId)              — all scores for an event (admin/judge)
 *   - useUserEventScores(eventId)          — current user's scores (athlete)
 *   - useActiveEventsForRoute(routeId)     — ongoing events containing a route (QR flow)
 *   - useCreateScore()                     — athlete submits a score
 *   - useUpdateScore()                     — judge updates score + verification
 *   - useVerifyScore()                     — judge verifies without changing score
 *   - useDeleteScore()                     — admin removes a score
 *
 * Mock strategy (matching useEvents.test.tsx):
 *   - Mock scoresService (not Supabase) — hooks don't know about PostgREST
 *   - Mock useAuth to provide a stable user ID
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock scoresService ──────────────────────────────────────────────
jest.mock("@/services/scores.service", () => ({
  scoresService: {
    getEventScores: jest.fn(),
    getUserEventScores: jest.fn(),
    getScore: jest.fn(),
    getActiveEventsForRoute: jest.fn(),
    createScore: jest.fn(),
    updateScore: jest.fn(),
    verifyScore: jest.fn(),
    deleteScore: jest.fn(),
  },
}));

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "athlete-1" },
    session: { user: { id: "athlete-1" } },
    isAuthenticated: true,
    role: "climber",
  }),
}));

import {
  useEventScores,
  useUserEventScores,
  useActiveEventsForRoute,
  useCreateScore,
  useUpdateScore,
  useVerifyScore,
  useDeleteScore,
} from "../useScores";

const { scoresService } = jest.requireMock<{
  scoresService: {
    getEventScores: jest.Mock;
    getUserEventScores: jest.Mock;
    getScore: jest.Mock;
    getActiveEventsForRoute: jest.Mock;
    createScore: jest.Mock;
    updateScore: jest.Mock;
    verifyScore: jest.Mock;
    deleteScore: jest.Mock;
  };
}>("@/services/scores.service");

// ── Test wrapper ────────────────────────────────────────────────────
// Fresh QueryClient per test prevents cache leakage.

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

// ── useEventScores tests ────────────────────────────────────────────

describe("useEventScores", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches all scores for an event and returns them", async () => {
    const mockScores = [
      { id: "score-1", score: 100, user: { display_name: "Alice" } },
    ];
    scoresService.getEventScores.mockResolvedValueOnce({
      data: mockScores,
      error: null,
    });

    const { result } = renderHook(() => useEventScores("event-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.scores).toEqual(mockScores);
    expect(scoresService.getEventScores).toHaveBeenCalledWith("event-1");
  });
});

// ── useUserEventScores tests ────────────────────────────────────────

describe("useUserEventScores", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches the current user's scores using userId from useAuth", async () => {
    // The hook automatically injects the authenticated user's ID
    // so the athlete screen doesn't need to pass it manually.
    const mockScores = [{ id: "score-1", score: 75, route_id: "r-1" }];
    scoresService.getUserEventScores.mockResolvedValueOnce({
      data: mockScores,
      error: null,
    });

    const { result } = renderHook(() => useUserEventScores("event-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.scores).toEqual(mockScores);
    // Should pass the user ID from useAuth mock
    expect(scoresService.getUserEventScores).toHaveBeenCalledWith(
      "event-1",
      "athlete-1"
    );
  });
});

// ── useActiveEventsForRoute tests ───────────────────────────────────

describe("useActiveEventsForRoute", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches ongoing events for a route", async () => {
    const mockEvents = [{ id: "event-1", name: "Spring Comp" }];
    scoresService.getActiveEventsForRoute.mockResolvedValueOnce({
      data: mockEvents,
      error: null,
    });

    const { result } = renderHook(
      () => useActiveEventsForRoute("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeEvents).toEqual(mockEvents);
    expect(scoresService.getActiveEventsForRoute).toHaveBeenCalledWith(
      "route-1"
    );
  });

  it("is disabled when routeId is null", () => {
    // Before a QR scan completes, routeId is null — the hook should
    // not fire a query until we have a valid route ID.
    const { result } = renderHook(
      () => useActiveEventsForRoute(null),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(scoresService.getActiveEventsForRoute).not.toHaveBeenCalled();
  });
});

// ── useCreateScore tests ────────────────────────────────────────────

describe("useCreateScore", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with score data and userId from useAuth", async () => {
    scoresService.createScore.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useCreateScore(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        eventId: "event-1",
        routeId: "route-1",
        score: 100,
      });
    });

    expect(scoresService.createScore).toHaveBeenCalledWith({
      event_id: "event-1",
      user_id: "athlete-1", // from useAuth mock
      route_id: "route-1",
      score: 100,
    });
  });

  it("passes optional categoryId as category_id", async () => {
    scoresService.createScore.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useCreateScore(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        eventId: "event-1",
        routeId: "route-1",
        score: 50,
        categoryId: "cat-1",
      });
    });

    expect(scoresService.createScore).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: "cat-1" })
    );
  });
});

// ── useUpdateScore tests ────────────────────────────────────────────

describe("useUpdateScore", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with scoreId and update data", async () => {
    scoresService.updateScore.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useUpdateScore(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        scoreId: "score-1",
        data: { score: 200, verified_by: "judge-1" },
      });
    });

    expect(scoresService.updateScore).toHaveBeenCalledWith("score-1", {
      score: 200,
      verified_by: "judge-1",
    });
  });
});

// ── useVerifyScore tests ────────────────────────────────────────────

describe("useVerifyScore", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with scoreId and judge userId from useAuth", async () => {
    scoresService.verifyScore.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useVerifyScore(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ scoreId: "score-1" });
    });

    // verified_by should come from useAuth automatically
    expect(scoresService.verifyScore).toHaveBeenCalledWith(
      "score-1",
      "athlete-1" // useAuth returns athlete-1 as user.id
    );
  });
});

// ── useDeleteScore tests ────────────────────────────────────────────

describe("useDeleteScore", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with scoreId", async () => {
    scoresService.deleteScore.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteScore(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ scoreId: "score-1" });
    });

    expect(scoresService.deleteScore).toHaveBeenCalledWith("score-1");
  });
});
