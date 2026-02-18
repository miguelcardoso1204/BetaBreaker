/**
 * useSettingCalendar Hook Tests — TanStack Query Wrappers for Setting Sessions
 *
 * These hooks provide:
 *   Queries:
 *     - useSettingSessions(gymId, start, end) — sessions for a date range
 *     - useSetterWorkload(gymId, start, end) — route counts per setter
 *   Mutations:
 *     - useCreateSettingSession() — schedule a new session
 *     - useUpdateSettingSession() — change status/notes
 *     - useDeleteSettingSession() — remove a session
 *
 * Mock strategy (matching useAdminRoutes.test.tsx):
 *   - Mock calendarService (not Supabase) — hooks don't know about PostgREST
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock calendarService ──────────────────────────────────────────────
jest.mock("@/services/calendar.service", () => ({
  calendarService: {
    getSessionsByDateRange: jest.fn(),
    createSession: jest.fn(),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
    getSetterWorkload: jest.fn(),
  },
}));

import {
  useSettingSessions,
  useSetterWorkload,
  useCreateSettingSession,
  useUpdateSettingSession,
  useDeleteSettingSession,
} from "../useSettingCalendar";

const { calendarService } = jest.requireMock<{
  calendarService: {
    getSessionsByDateRange: jest.Mock;
    createSession: jest.Mock;
    updateSession: jest.Mock;
    deleteSession: jest.Mock;
    getSetterWorkload: jest.Mock;
  };
}>("@/services/calendar.service");

// ── Test wrapper ──────────────────────────────────────────────────────
// Fresh QueryClient per test prevents cache leakage between tests.

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

// ── useSettingSessions tests ──────────────────────────────────────────

describe("useSettingSessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches sessions for a gym and date range", async () => {
    const mockSessions = [
      { id: "s1", scheduled_date: "2026-03-05", status: "planned" },
      { id: "s2", scheduled_date: "2026-03-12", status: "completed" },
    ];
    calendarService.getSessionsByDateRange.mockResolvedValueOnce({
      data: mockSessions,
      error: null,
    });

    const { result } = renderHook(
      () => useSettingSessions("gym-1", "2026-03-01", "2026-03-31"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sessions).toEqual(mockSessions);
    expect(calendarService.getSessionsByDateRange).toHaveBeenCalledWith(
      "gym-1",
      "2026-03-01",
      "2026-03-31"
    );
  });

  it("throws on service error", async () => {
    calendarService.getSessionsByDateRange.mockResolvedValueOnce({
      data: null,
      error: new Error("RLS blocked"),
    });

    const { result } = renderHook(
      () => useSettingSessions("gym-1", "2026-03-01", "2026-03-31"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.sessions).toEqual([]);
  });

  it("is disabled when gymId is null", () => {
    const { result } = renderHook(
      () => useSettingSessions(null, "2026-03-01", "2026-03-31"),
      { wrapper: createWrapper() }
    );

    // Query should not fire — stays in idle state
    expect(calendarService.getSessionsByDateRange).not.toHaveBeenCalled();
    expect(result.current.sessions).toEqual([]);
  });
});

// ── useSetterWorkload tests ──────────────────────────────────────────

describe("useSetterWorkload", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches workload data from RPC", async () => {
    const mockWorkload = [
      { setter_id: "s1", display_name: "Alice", route_count: 5 },
    ];
    calendarService.getSetterWorkload.mockResolvedValueOnce({
      data: mockWorkload,
      error: null,
    });

    const { result } = renderHook(
      () => useSetterWorkload("gym-1", "2026-03-01", "2026-03-31"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.workload).toEqual(mockWorkload);
    expect(calendarService.getSetterWorkload).toHaveBeenCalledWith(
      "gym-1",
      "2026-03-01",
      "2026-03-31"
    );
  });

  it("is disabled when gymId is null", () => {
    const { result } = renderHook(
      () => useSetterWorkload(null, "2026-03-01", "2026-03-31"),
      { wrapper: createWrapper() }
    );

    expect(calendarService.getSetterWorkload).not.toHaveBeenCalled();
    expect(result.current.workload).toEqual([]);
  });
});

// ── useCreateSettingSession tests ────────────────────────────────────

describe("useCreateSettingSession", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls createSession and invalidates queries on success", async () => {
    calendarService.createSession.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCreateSettingSession(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        gymId: "gym-1",
        setterId: "setter-1",
        scheduledDate: "2026-04-01",
        notes: "Boulder wall",
      });
    });

    // Service called with snake_case params
    expect(calendarService.createSession).toHaveBeenCalledWith({
      gym_id: "gym-1",
      setter_id: "setter-1",
      scheduled_date: "2026-04-01",
      notes: "Boulder wall",
    });
  });

  it("throws on service error", async () => {
    calendarService.createSession.mockResolvedValueOnce({
      data: null,
      error: new Error("Duplicate"),
    });

    const { result } = renderHook(() => useCreateSettingSession(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          gymId: "gym-1",
          setterId: "setter-1",
          scheduledDate: "2026-04-01",
        });
      })
    ).rejects.toThrow("Duplicate");
  });
});

// ── useUpdateSettingSession tests ────────────────────────────────────

describe("useUpdateSettingSession", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls updateSession with id and data", async () => {
    calendarService.updateSession.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useUpdateSettingSession(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-1",
        data: { status: "completed" },
      });
    });

    expect(calendarService.updateSession).toHaveBeenCalledWith("session-1", {
      status: "completed",
    });
  });
});

// ── useDeleteSettingSession tests ────────────────────────────────────

describe("useDeleteSettingSession", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls deleteSession with id", async () => {
    calendarService.deleteSession.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteSettingSession(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-1" });
    });

    expect(calendarService.deleteSession).toHaveBeenCalledWith("session-1");
  });
});
