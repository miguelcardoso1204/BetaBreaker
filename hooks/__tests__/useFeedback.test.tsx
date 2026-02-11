/**
 * useFeedback Hook Tests — Beta Tips Query & Mutation Logic
 *
 * These hooks wrap feedbackService with TanStack Query to provide:
 *   - `useRouteFeedback(routeId)` — reactive list of beta tips + user votes
 *   - `useCreateFeedback()` — mutation to add a new tip
 *   - `useDeleteFeedback()` — mutation to remove a tip
 *   - `useVoteFeedback()` — mutation to upvote/downvote/unvote
 *
 * Mock strategy (matching useSavedRoutes.test.tsx):
 *   - Mock feedbackService (not Supabase) — hooks don't know about PostgREST
 *   - Mock useAuth to provide a stable user ID
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock feedbackService ──────────────────────────────────────────
jest.mock("@/services/feedback.service", () => ({
  feedbackService: {
    getRouteFeedback: jest.fn(),
    getUserVotes: jest.fn(),
    createFeedback: jest.fn(),
    deleteFeedback: jest.fn(),
    vote: jest.fn(),
    unvote: jest.fn(),
  },
}));

// ── Mock useAuth ──────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { user: { id: "user-1" } },
    isAuthenticated: true,
  }),
}));

import {
  useRouteFeedback,
  useCreateFeedback,
  useDeleteFeedback,
  useVoteFeedback,
} from "../useFeedback";

const { feedbackService } = jest.requireMock<{
  feedbackService: {
    getRouteFeedback: jest.Mock;
    getUserVotes: jest.Mock;
    createFeedback: jest.Mock;
    deleteFeedback: jest.Mock;
    vote: jest.Mock;
    unvote: jest.Mock;
  };
}>("@/services/feedback.service");

// ── Test wrapper ──────────────────────────────────────────────────
// TanStack Query hooks need a QueryClientProvider. Fresh client per
// test prevents cache leakage.

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

// ── useRouteFeedback tests ────────────────────────────────────────

describe("useRouteFeedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns feedback data from service", async () => {
    // The hook should fetch feedback + user votes and combine them.
    const mockFeedback = [
      {
        id: "fb-1",
        route_id: "route-1",
        user_id: "user-2",
        body: "Start on the left jug",
        score: 3,
        created_at: "2026-02-10T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    feedbackService.getRouteFeedback.mockResolvedValueOnce({
      data: mockFeedback,
      error: null,
    });
    // getUserVotes returns the current user's votes on these tips
    feedbackService.getUserVotes.mockResolvedValueOnce({
      data: [{ feedback_id: "fb-1", user_id: "user-1", vote: "up" }],
      error: null,
    });

    const { result } = renderHook(
      () => useRouteFeedback("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.feedback).toEqual(mockFeedback);
    expect(result.current.userVotes).toEqual({
      "fb-1": "up",
    });
    expect(feedbackService.getRouteFeedback).toHaveBeenCalledWith("route-1");
  });

  it("throws when service returns error", async () => {
    // When the service fails, the hook should propagate the error
    // so the UI can display an error state.
    feedbackService.getRouteFeedback.mockResolvedValueOnce({
      data: null,
      error: { message: "Permission denied" },
    });

    const { result } = renderHook(
      () => useRouteFeedback("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});

// ── useCreateFeedback tests ───────────────────────────────────────

describe("useCreateFeedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls createFeedback with correct args", async () => {
    // The mutation should pass routeId, userId, and body to the service.
    feedbackService.createFeedback.mockResolvedValueOnce({
      data: { id: "fb-new" },
      error: null,
    });

    const { result } = renderHook(
      () => useCreateFeedback("route-1"),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate({ body: "Try the heel hook" });
    });

    expect(feedbackService.createFeedback).toHaveBeenCalledWith(
      "route-1",
      "user-1",
      "Try the heel hook"
    );
  });
});

// ── useDeleteFeedback tests ───────────────────────────────────────

describe("useDeleteFeedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls deleteFeedback with feedback ID", async () => {
    // Users can delete their own tips via a trash button.
    feedbackService.deleteFeedback.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(
      () => useDeleteFeedback("route-1"),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate({ feedbackId: "fb-1" });
    });

    expect(feedbackService.deleteFeedback).toHaveBeenCalledWith("fb-1");
  });
});

// ── useVoteFeedback tests ─────────────────────────────────────────

describe("useVoteFeedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls vote with direction when voting", async () => {
    // When the user taps thumbs-up, the mutation should call vote()
    // with the 'up' direction.
    feedbackService.vote.mockResolvedValueOnce(undefined);

    const { result } = renderHook(
      () => useVoteFeedback("route-1"),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate({
        feedbackId: "fb-1",
        direction: "up",
      });
    });

    expect(feedbackService.vote).toHaveBeenCalledWith(
      "fb-1",
      "user-1",
      "up"
    );
    expect(feedbackService.unvote).not.toHaveBeenCalled();
  });

  it("calls unvote when direction is null (toggling off)", async () => {
    // When the user taps a vote button that's already active, we
    // pass null as direction to indicate "remove my vote".
    feedbackService.unvote.mockResolvedValueOnce(undefined);

    const { result } = renderHook(
      () => useVoteFeedback("route-1"),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate({
        feedbackId: "fb-1",
        direction: null,
      });
    });

    expect(feedbackService.unvote).toHaveBeenCalledWith("fb-1", "user-1");
    expect(feedbackService.vote).not.toHaveBeenCalled();
  });
});
