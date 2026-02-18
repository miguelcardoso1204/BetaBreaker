/**
 * useGradeConsensus Hook Tests — TanStack Query Wrappers for Grade Consensus
 *
 * Two hooks:
 *   - useRoutesGradeConsensus(gymId) — routes with consensus data for a gym
 *   - useGradeSubmissions(routeId) — perceived_grade distribution for a route
 *
 * Mock strategy: mock consensusService (not Supabase). Hooks don't know about
 * PostgREST or RPCs — they just call the service and manage cache state.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock consensusService ──────────────────────────────────────────────
jest.mock("@/services/consensus.service", () => ({
  consensusService: {
    getRoutesGradeConsensus: jest.fn(),
    getGradeSubmissions: jest.fn(),
  },
}));

import {
  useRoutesGradeConsensus,
  useGradeSubmissions,
} from "../useGradeConsensus";

const { consensusService } = jest.requireMock<{
  consensusService: {
    getRoutesGradeConsensus: jest.Mock;
    getGradeSubmissions: jest.Mock;
  };
}>("@/services/consensus.service");

// ── Test wrapper ──────────────────────────────────────────────────────
// Fresh QueryClient per test to prevent cache leakage.

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

// ── useRoutesGradeConsensus tests ─────────────────────────────────────

describe("useRoutesGradeConsensus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches routes with consensus data for a gym", async () => {
    const mockRoutes = [
      { route_id: "r1", name: "Alpha", divergence: 3 },
      { route_id: "r2", name: "Beta", divergence: null },
    ];
    consensusService.getRoutesGradeConsensus.mockResolvedValueOnce({
      data: mockRoutes,
      error: null,
    });

    const { result } = renderHook(
      () => useRoutesGradeConsensus("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.routes).toEqual(mockRoutes);
    expect(consensusService.getRoutesGradeConsensus).toHaveBeenCalledWith(
      "gym-1"
    );
  });

  it("throws on service error", async () => {
    consensusService.getRoutesGradeConsensus.mockResolvedValueOnce({
      data: null,
      error: new Error("RLS blocked"),
    });

    const { result } = renderHook(
      () => useRoutesGradeConsensus("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.routes).toEqual([]);
  });

  it("is disabled when gymId is null", () => {
    const { result } = renderHook(
      () => useRoutesGradeConsensus(null),
      { wrapper: createWrapper() }
    );

    // Query should not fire — stays in idle state
    expect(consensusService.getRoutesGradeConsensus).not.toHaveBeenCalled();
    expect(result.current.routes).toEqual([]);
  });

  it("returns empty array while loading", () => {
    // Service never resolves — simulates loading state
    consensusService.getRoutesGradeConsensus.mockReturnValue(
      new Promise(() => {})
    );

    const { result } = renderHook(
      () => useRoutesGradeConsensus("gym-1"),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.routes).toEqual([]);
  });
});

// ── useGradeSubmissions tests ─────────────────────────────────────────

describe("useGradeSubmissions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches grade distribution for a route", async () => {
    const mockDist = [
      { perceived_grade: 14, submission_count: 3 },
      { perceived_grade: 16, submission_count: 2 },
    ];
    consensusService.getGradeSubmissions.mockResolvedValueOnce({
      data: mockDist,
      error: null,
    });

    const { result } = renderHook(
      () => useGradeSubmissions("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.submissions).toEqual(mockDist);
    expect(consensusService.getGradeSubmissions).toHaveBeenCalledWith(
      "route-1"
    );
  });

  it("throws on service error", async () => {
    consensusService.getGradeSubmissions.mockResolvedValueOnce({
      data: null,
      error: new Error("Not found"),
    });

    const { result } = renderHook(
      () => useGradeSubmissions("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.submissions).toEqual([]);
  });

  it("is disabled when routeId is null", () => {
    const { result } = renderHook(
      () => useGradeSubmissions(null),
      { wrapper: createWrapper() }
    );

    expect(consensusService.getGradeSubmissions).not.toHaveBeenCalled();
    expect(result.current.submissions).toEqual([]);
  });

  it("returns empty array while loading", () => {
    consensusService.getGradeSubmissions.mockReturnValue(
      new Promise(() => {})
    );

    const { result } = renderHook(
      () => useGradeSubmissions("route-1"),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.submissions).toEqual([]);
  });
});
