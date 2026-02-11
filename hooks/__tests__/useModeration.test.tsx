/**
 * useModeration Hook Tests — Content Reporting Query & Mutation Logic
 *
 * These hooks wrap moderationService with TanStack Query to provide:
 *   - `useCreateReport()` — mutation to submit a content report
 *   - `useReports(status?)` — query to fetch reports (admin moderation queue)
 *   - `useResolveReport()` — mutation to dismiss or review a report
 *
 * Mock strategy (matching useFeedback.test.tsx):
 *   - Mock moderationService (not Supabase) — hooks don't know about PostgREST
 *   - Mock useAuth to provide a stable user ID
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock moderationService ───────────────────────────────────────────
jest.mock("@/services/moderation.service", () => ({
  moderationService: {
    createReport: jest.fn(),
    getReports: jest.fn(),
    resolveReport: jest.fn(),
  },
}));

// ── Mock useAuth ─────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { user: { id: "user-1" } },
    isAuthenticated: true,
  }),
}));

import { useCreateReport, useReports, useResolveReport } from "../useModeration";

const { moderationService } = jest.requireMock<{
  moderationService: {
    createReport: jest.Mock;
    getReports: jest.Mock;
    resolveReport: jest.Mock;
  };
}>("@/services/moderation.service");

// ── Test wrapper ─────────────────────────────────────────────────────
// TanStack Query hooks need a QueryClientProvider. Fresh client per
// test prevents cache leakage between tests.

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

// ── useCreateReport tests ────────────────────────────────────────────

describe("useCreateReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls service with correct args including userId from auth", async () => {
    // The mutation should pass targetType, targetId, and reason from
    // the caller, plus inject the userId from the auth context.
    moderationService.createReport.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useCreateReport(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        targetType: "feedback",
        targetId: "target-123",
        reason: "Spam",
      });
    });

    expect(moderationService.createReport).toHaveBeenCalledWith(
      "user-1", // userId from useAuth mock
      "feedback",
      "target-123",
      "Spam"
    );
  });
});

// ── useReports tests ─────────────────────────────────────────────────

describe("useReports", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns reports from service", async () => {
    // The hook should fetch reports and expose them via the query result.
    const mockReports = [
      {
        id: "report-1",
        reporter_id: "user-2",
        target_type: "feedback",
        target_id: "target-1",
        reason: "Spam",
        status: "pending",
        created_at: "2026-02-11T00:00:00Z",
        reporter: { display_name: "Alex", avatar_url: null },
      },
    ];

    moderationService.getReports.mockResolvedValueOnce({
      data: mockReports,
      error: null,
    });

    const { result } = renderHook(() => useReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.reports).toEqual(mockReports);
    expect(moderationService.getReports).toHaveBeenCalledWith(undefined);
  });

  it("filters by status when provided", async () => {
    // The admin moderation screen passes "pending" to only show
    // unresolved reports.
    moderationService.getReports.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useReports("pending"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(moderationService.getReports).toHaveBeenCalledWith("pending");
  });
});

// ── useResolveReport tests ───────────────────────────────────────────

describe("useResolveReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls service with reportId, userId, and status", async () => {
    // When an admin resolves a report, the hook should pass the
    // reportId, the admin's userId (from auth), and the resolution status.
    moderationService.resolveReport.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useResolveReport(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        reportId: "report-1",
        status: "reviewed",
      });
    });

    expect(moderationService.resolveReport).toHaveBeenCalledWith(
      "report-1",
      "user-1", // reviewerId from useAuth mock
      "reviewed"
    );
  });

  it("invalidates reports query on success", async () => {
    // After resolving a report, the reports list should refetch so
    // the resolved report disappears from the pending queue.
    moderationService.resolveReport.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    // The refetch triggered by invalidation will call getReports again
    moderationService.getReports.mockResolvedValue({
      data: [],
      error: null,
    });

    const { result } = renderHook(
      () => {
        const reports = useReports("pending");
        const resolve = useResolveReport();
        return { reports, resolve };
      },
      { wrapper: createWrapper() }
    );

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.reports.isLoading).toBe(false);
    });

    // Clear to track only the refetch call
    moderationService.getReports.mockClear();

    await act(async () => {
      result.current.resolve.mutate({
        reportId: "report-1",
        status: "dismissed",
      });
    });

    // After mutation settles, getReports should be called again
    // due to query invalidation
    await waitFor(() => {
      expect(moderationService.getReports).toHaveBeenCalled();
    });
  });
});
