/**
 * useSessions Hook Tests — Session History & Detail Queries
 *
 * These hooks wrap sessionsService with TanStack Query to provide:
 *   - `useSessionHistory()` — fetches all past session entries for the logbook
 *   - `useSessionDetail(date)` — fetches summary + raw ascents for one date
 *
 * Mock strategy:
 *   - Mock sessionsService (not Supabase) — hooks don't know about PostgREST
 *   - Mock useAuth to provide a stable user ID for queries
 *   - Wrap renderHook in QueryClientProvider with retry: false
 *
 * WHY MOCK sessionsService AT THE MODULE LEVEL?
 * The hooks call sessionsService methods inside queryFn. By mocking the
 * entire service module, we control exactly what data/errors the hooks
 * receive without touching Supabase or Postgres.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock sessionsService ─────────────────────────────────────────
jest.mock("@/services/sessions.service", () => ({
  sessionsService: {
    getSessionHistory: jest.fn(),
    getSessionSummary: jest.fn(),
    getSessionAscents: jest.fn(),
  },
}));

// ── Mock useAuth ─────────────────────────────────────────────────
// Return a fixed user so the hooks know whose sessions to query.
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { user: { id: "user-1" } },
    isAuthenticated: true,
  }),
}));

import { useSessionHistory, useSessionDetail } from "../useSessions";

const { sessionsService } = jest.requireMock<{
  sessionsService: {
    getSessionHistory: jest.Mock;
    getSessionSummary: jest.Mock;
    getSessionAscents: jest.Mock;
  };
}>("@/services/sessions.service");

// ── Test wrapper ─────────────────────────────────────────────────
// TanStack Query hooks must render inside a QueryClientProvider.
// Fresh client per test prevents cache leakage between tests.

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

// ── Fixtures ─────────────────────────────────────────────────────

const mockHistory = [
  {
    date: "2026-02-09",
    ascentCount: 5,
    sends: 3,
    flashes: 1,
    topGrade: 10,
  },
  {
    date: "2026-02-08",
    ascentCount: 3,
    sends: 2,
    flashes: 0,
    topGrade: 8,
  },
];

const mockSummary = {
  date: "2026-02-09",
  totalAscents: 5,
  sends: 3,
  flashes: 1,
  attempts: 1,
  gradeDistribution: { 8: 2, 10: 3 },
};

const mockAscents = [
  {
    id: "ascent-1",
    user_id: "user-1",
    route_id: "route-1",
    status: "send",
    attempts: 2,
    notes: null,
    perceived_grade: null,
    created_at: "2026-02-09T18:00:00Z",
    route: { name: "Crimpy Arete", canonical_grade: 10, color: "#EF4444" },
  },
];

// ── useSessionHistory tests ──────────────────────────────────────

describe("useSessionHistory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Before the query resolves, the hook should report isLoading: true.
    // The logbook screen uses this to show a spinner.
    sessionsService.getSessionHistory.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSessionHistory(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("returns session history data", async () => {
    // When the service resolves with history entries, the hook should
    // expose them as the data property.
    sessionsService.getSessionHistory.mockResolvedValueOnce(mockHistory);

    const { result } = renderHook(() => useSessionHistory(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockHistory);
    expect(sessionsService.getSessionHistory).toHaveBeenCalledWith("user-1");
  });

  it("handles error from service", async () => {
    // When the service throws, TanStack Query should capture the error.
    sessionsService.getSessionHistory.mockRejectedValueOnce(
      new Error("DB connection failed")
    );

    const { result } = renderHook(() => useSessionHistory(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});

// ── useSessionDetail tests ───────────────────────────────────────

describe("useSessionDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Before both service calls resolve, the hook should be loading.
    sessionsService.getSessionSummary.mockReturnValue(new Promise(() => {}));
    sessionsService.getSessionAscents.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useSessionDetail("2026-02-09"),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
  });

  it("returns summary and ascents data", async () => {
    // When both service calls resolve, the hook should combine them
    // into a single data object with `summary` and `ascents` properties.
    sessionsService.getSessionSummary.mockResolvedValueOnce(mockSummary);
    sessionsService.getSessionAscents.mockResolvedValueOnce(mockAscents);

    const { result } = renderHook(
      () => useSessionDetail("2026-02-09"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({
      summary: mockSummary,
      ascents: mockAscents,
    });
    // Verify both service methods were called with correct args
    expect(sessionsService.getSessionSummary).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date)
    );
    expect(sessionsService.getSessionAscents).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date)
    );
  });

  it("handles error from service", async () => {
    // If either service call throws, the entire query should error.
    sessionsService.getSessionSummary.mockRejectedValueOnce(
      new Error("Query failed")
    );
    sessionsService.getSessionAscents.mockResolvedValueOnce(mockAscents);

    const { result } = renderHook(
      () => useSessionDetail("2026-02-09"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});
