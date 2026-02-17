/**
 * useStyleInsights Hook Tests
 *
 * Tests the Pro-gated Style Insights analytics hook. Same pattern as
 * useGradePyramid tests — verify:
 *   1. Query is enabled + returns data for Pro users
 *   2. Query is disabled for free-tier users (hasAccess: false)
 *   3. Query is disabled when no user is authenticated
 *   4. Time period parameter affects the query (date range passed to service)
 *   5. Service errors propagate correctly
 *
 * Mock strategy:
 *   - Mock sessionsService.getStyleInsights (not Supabase)
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
    getStyleInsights: jest.fn(),
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

import { useStyleInsights } from "../useStyleInsights";

const { sessionsService } = jest.requireMock<{
  sessionsService: {
    getStyleInsights: jest.Mock;
  };
}>("@/services/sessions.service");

// ── Test wrapper ─────────────────────────────────────────────────
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

// ── Fixtures ─────────────────────────────────────────────────────

const mockStyleData = [
  { tagName: "slab", category: "angle", count: 5 },
  { tagName: "crimpy", category: "hold_type", count: 3 },
  { tagName: "dyno", category: "movement", count: 2 },
];

// ── Tests ────────────────────────────────────────────────────────

describe("useStyleInsights", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to Pro user defaults before each test
    mockAuthReturn.user = { id: "user-1" };
    mockEntitlementReturn.hasAccess = true;
    mockEntitlementReturn.tier = "pro";
  });

  it("returns style data for a Pro user", async () => {
    // When the user has Pro access and the service returns data,
    // the hook should expose it along with hasAccess: true.
    sessionsService.getStyleInsights.mockResolvedValueOnce(mockStyleData);

    const { result } = renderHook(() => useStyleInsights("all_time"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockStyleData);
    expect(result.current.hasAccess).toBe(true);
    expect(result.current.tier).toBe("pro");
    // Verify the service was called with user ID and no date filters (all_time)
    expect(sessionsService.getStyleInsights).toHaveBeenCalledWith(
      "user-1",
      undefined,
      undefined
    );
  });

  it("disables query when user has no Pro access (free tier)", async () => {
    // Free-tier users can't see analytics. The query should be disabled
    // to avoid fetching data behind the paywall.
    mockEntitlementReturn.hasAccess = false;
    mockEntitlementReturn.tier = "free";

    const { result } = renderHook(() => useStyleInsights("last_month"), {
      wrapper: createWrapper(),
    });

    // Query should never fire — data stays undefined
    expect(result.current.data).toBeUndefined();
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.tier).toBe("free");
    expect(sessionsService.getStyleInsights).not.toHaveBeenCalled();
  });

  it("disables query when no user is authenticated", async () => {
    // No userId → query disabled (no user to query for).
    mockAuthReturn.user = null;

    const { result } = renderHook(() => useStyleInsights("all_time"), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(sessionsService.getStyleInsights).not.toHaveBeenCalled();
  });

  it("passes date range for 'last_month' period", async () => {
    // 'last_month' should compute a 30-day lookback window and pass
    // startDate/endDate ISO strings to the service.
    sessionsService.getStyleInsights.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useStyleInsights("last_month"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify the service was called with ISO date strings (not undefined)
    expect(sessionsService.getStyleInsights).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // startDate ISO
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)  // endDate ISO
    );
  });

  it("passes date range for 'three_months' period", async () => {
    // 'three_months' should compute a 90-day lookback window.
    sessionsService.getStyleInsights.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useStyleInsights("three_months"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(sessionsService.getStyleInsights).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    );
  });

  it("handles service errors", async () => {
    // When the service throws, TanStack Query should capture the error
    // and expose it via the error property.
    sessionsService.getStyleInsights.mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() => useStyleInsights("all_time"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeUndefined();
  });
});
