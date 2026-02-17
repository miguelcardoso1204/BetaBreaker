/**
 * useGradePyramid Hook Tests
 *
 * Tests the Pro-gated Grade Pyramid analytics hook. Three things to verify:
 *   1. Query is enabled + returns data for Pro users
 *   2. Query is disabled for free-tier users (hasAccess: false)
 *   3. Query is disabled when no user is authenticated
 *   4. Time period parameter affects the query key
 *
 * Mock strategy:
 *   - Mock sessionsService.getGradePyramid (not Supabase — hook doesn't
 *     know about PostgREST)
 *   - Mock useAuth for user identity
 *   - Mock useEntitlement for Pro-tier gating
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock sessionsService ─────────────────────────────────────────
jest.mock("@/services/sessions.service", () => ({
  sessionsService: {
    getGradePyramid: jest.fn(),
  },
}));

// ── Mock useAuth ─────────────────────────────────────────────────
// Mutable so individual tests can override the user state.
const mockAuthReturn = {
  user: { id: "user-1" } as { id: string } | null,
  session: { user: { id: "user-1" } },
  isAuthenticated: true,
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthReturn,
}));

// ── Mock useEntitlement ──────────────────────────────────────────
// Mutable so we can toggle Pro/free between tests.
const mockEntitlementReturn = {
  hasAccess: true,
  tier: "pro" as string,
  isLoading: false,
};

jest.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => mockEntitlementReturn,
}));

import { useGradePyramid } from "../useGradePyramid";

const { sessionsService } = jest.requireMock<{
  sessionsService: {
    getGradePyramid: jest.Mock;
  };
}>("@/services/sessions.service");

// ── Test wrapper ─────────────────────────────────────────────────
// TanStack Query hooks must render inside a QueryClientProvider.
// Fresh client per test prevents cache leakage.

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

const mockPyramid = [
  { grade: 6, count: 3 },
  { grade: 10, count: 2 },
  { grade: 15, count: 1 },
];

// ── Tests ────────────────────────────────────────────────────────

describe("useGradePyramid", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to Pro user defaults before each test
    mockAuthReturn.user = { id: "user-1" };
    mockEntitlementReturn.hasAccess = true;
    mockEntitlementReturn.tier = "pro";
  });

  it("returns pyramid data for a Pro user", async () => {
    // When the user has Pro access and the service returns data,
    // the hook should expose it along with hasAccess: true.
    sessionsService.getGradePyramid.mockResolvedValueOnce(mockPyramid);

    const { result } = renderHook(() => useGradePyramid("all_time"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockPyramid);
    expect(result.current.hasAccess).toBe(true);
    expect(result.current.tier).toBe("pro");
    // Verify the service was called with user ID and no date filters (all_time)
    expect(sessionsService.getGradePyramid).toHaveBeenCalledWith(
      "user-1",
      undefined,
      undefined
    );
  });

  it("disables query when user has no Pro access (free tier)", async () => {
    // Free-tier users can't see analytics. The query should be disabled
    // to avoid wasting bandwidth fetching data behind the paywall.
    mockEntitlementReturn.hasAccess = false;
    mockEntitlementReturn.tier = "free";

    const { result } = renderHook(() => useGradePyramid("last_month"), {
      wrapper: createWrapper(),
    });

    // Query should never fire — data stays undefined, loading stays false
    // (TanStack Query reports isLoading: false for disabled queries)
    expect(result.current.data).toBeUndefined();
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.tier).toBe("free");
    expect(sessionsService.getGradePyramid).not.toHaveBeenCalled();
  });

  it("disables query when no user is authenticated", async () => {
    // If the user is signed out (user is null), the query should be
    // disabled — there's no userId to query for.
    mockAuthReturn.user = null;

    const { result } = renderHook(() => useGradePyramid("all_time"), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(sessionsService.getGradePyramid).not.toHaveBeenCalled();
  });

  it("passes date range for 'last_month' period", async () => {
    // The 'last_month' period should compute a 30-day lookback window
    // and pass startDate/endDate to the service.
    sessionsService.getGradePyramid.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useGradePyramid("last_month"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify the service was called with ISO date strings (not undefined)
    expect(sessionsService.getGradePyramid).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // startDate ISO string
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)  // endDate ISO string
    );
  });

  it("passes date range for 'three_months' period", async () => {
    // The 'three_months' period should compute a 90-day lookback window.
    sessionsService.getGradePyramid.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useGradePyramid("three_months"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(sessionsService.getGradePyramid).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    );
  });

  it("handles service errors", async () => {
    // When the service throws, TanStack Query should capture the error
    // and expose it via the error property.
    sessionsService.getGradePyramid.mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() => useGradePyramid("all_time"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeUndefined();
  });
});
