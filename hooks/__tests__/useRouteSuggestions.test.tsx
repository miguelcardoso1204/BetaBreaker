/**
 * useRouteSuggestions Hook Tests
 *
 * Tests the Pro-gated route suggestion hook that composes:
 *   - useAuth (user identity)
 *   - useEntitlement (Pro-tier gate)
 *   - useGradePyramid (max grade derivation)
 *   - useStyleInsights (weak style detection)
 *   - sessionsService.getSentRouteIds (exclusion set)
 *   - routeService.getCandidateRoutes (candidate pool)
 *   - scoreSuggestions (pure scoring — NOT mocked, runs for real)
 *
 * Mock strategy:
 *   - Mock services (getSentRouteIds, getCandidateRoutes) at the module level
 *   - Mock hooks (useAuth, useEntitlement, useGradePyramid, useStyleInsights)
 *     as mutable objects for per-test control
 *   - Do NOT mock utils/suggestions — let real scoring run to verify integration
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock services ────────────────────────────────────────────────
jest.mock("@/services/sessions.service", () => ({
  sessionsService: {
    getSentRouteIds: jest.fn(),
  },
}));

jest.mock("@/services/routes.service", () => ({
  routeService: {
    getCandidateRoutes: jest.fn(),
  },
}));

// ── Mock hooks ──────────────────────────────────────────────────
// Mutable objects so each test can tweak the return values.

const mockAuthReturn = {
  user: {
    id: "user-1",
    tier: "pro",
  } as { id: string; tier: string } | null,
  isAuthenticated: true,
  isLoading: false,
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthReturn,
}));

const mockEntitlementReturn = {
  hasAccess: true,
  tier: "pro" as string,
  isLoading: false,
};

jest.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => mockEntitlementReturn,
}));

const mockPyramidReturn = {
  data: [
    { grade: 6, count: 5 },
    { grade: 10, count: 3 },
    { grade: 14, count: 1 },
  ] as { grade: number; count: number }[] | undefined,
  isLoading: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useGradePyramid", () => ({
  useGradePyramid: () => mockPyramidReturn,
}));

const mockStyleReturn = {
  data: [
    { tagName: "slab", category: "angle", count: 10 },
    { tagName: "overhang", category: "angle", count: 2 },
    { tagName: "crimpy", category: "hold_type", count: 3 },
  ] as { tagName: string; category: string; count: number }[] | undefined,
  isLoading: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useStyleInsights", () => ({
  useStyleInsights: () => mockStyleReturn,
}));

// ── Import after mocks ──────────────────────────────────────────
import { useRouteSuggestions } from "../useRouteSuggestions";

const { sessionsService } = jest.requireMock<{
  sessionsService: { getSentRouteIds: jest.Mock };
}>("@/services/sessions.service");

const { routeService } = jest.requireMock<{
  routeService: { getCandidateRoutes: jest.Mock };
}>("@/services/routes.service");

// ── Test wrapper ────────────────────────────────────────────────
function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// ── Fixtures ────────────────────────────────────────────────────

const mockCandidates = [
  {
    id: "r1",
    name: "Overhang Problem",
    canonical_grade: 13,
    color: "#EF4444",
    status: "active",
    tags: ["overhang", "crimpy"],
  },
  {
    id: "r2",
    name: "Slab City",
    canonical_grade: 12,
    color: "#22C55E",
    status: "active",
    tags: ["slab"],
  },
  {
    id: "r3",
    name: "Dyno King",
    canonical_grade: 14,
    color: "#3B82F6",
    status: "active",
    tags: ["dyno"],
  },
];

// ── Helpers ─────────────────────────────────────────────────────

function resetMocks() {
  mockAuthReturn.user = { id: "user-1", tier: "pro" };
  mockAuthReturn.isAuthenticated = true;
  mockAuthReturn.isLoading = false;
  mockEntitlementReturn.hasAccess = true;
  mockEntitlementReturn.tier = "pro";
  mockEntitlementReturn.isLoading = false;
  mockPyramidReturn.data = [
    { grade: 6, count: 5 },
    { grade: 10, count: 3 },
    { grade: 14, count: 1 },
  ];
  mockPyramidReturn.isLoading = false;
  mockPyramidReturn.error = null;
  mockStyleReturn.data = [
    { tagName: "slab", category: "angle", count: 10 },
    { tagName: "overhang", category: "angle", count: 2 },
    { tagName: "crimpy", category: "hold_type", count: 3 },
  ];
  mockStyleReturn.isLoading = false;
  mockStyleReturn.error = null;

  sessionsService.getSentRouteIds.mockResolvedValue(new Set(["r-sent"]));
  routeService.getCandidateRoutes.mockResolvedValue(mockCandidates);
}

// ── Tests ───────────────────────────────────────────────────────

describe("useRouteSuggestions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  it("returns scored suggestions for a Pro user with a gym", async () => {
    // Happy path: Pro user with a gym, pyramid data, and style data.
    // The hook should fetch sent routes + candidates, score them, and
    // return sorted suggestions.
    const { result } = renderHook(() => useRouteSuggestions("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have fetched sent routes for user + gym
    expect(sessionsService.getSentRouteIds).toHaveBeenCalledWith(
      "user-1",
      "gym-1"
    );

    // Max grade from pyramid is 14 (last entry sorted ascending).
    // Grade range: 14 ± 2 = [12, 16]
    expect(routeService.getCandidateRoutes).toHaveBeenCalledWith(
      "gym-1",
      12, // maxGrade - SUGGESTION_GRADE_RANGE
      16  // maxGrade + SUGGESTION_GRADE_RANGE
    );

    // Scoring with weakStyles={overhang, crimpy}, knownStyles={slab, overhang, crimpy}:
    // r1 (overhang+crimpy): 1+1=2, r2 (slab): 0, r3 (dyno): 2 (novel)
    // Sorted: r3 (2, grade 14) > r1 (2, grade 13) > r2 (0, grade 12)
    // Wait — r1 and r3 both score 2, tiebreaker is grade desc:
    // r3 grade 14 > r1 grade 13
    expect(result.current.suggestions).toHaveLength(3);
    expect(result.current.suggestions![0].id).toBe("r3"); // dyno, score 2, grade 14
    expect(result.current.suggestions![1].id).toBe("r1"); // overhang+crimpy, score 2, grade 13
    expect(result.current.suggestions![2].id).toBe("r2"); // slab, score 0
    expect(result.current.hasAccess).toBe(true);
    expect(result.current.noGym).toBe(false);
  });

  it("disables query for free-tier users", async () => {
    mockEntitlementReturn.hasAccess = false;
    mockEntitlementReturn.tier = "free";

    const { result } = renderHook(() => useRouteSuggestions(), {
      wrapper: createWrapper(),
    });

    expect(result.current.hasAccess).toBe(false);
    expect(result.current.suggestions).toBeUndefined();
    expect(sessionsService.getSentRouteIds).not.toHaveBeenCalled();
  });

  it("disables query when no user is authenticated", async () => {
    mockAuthReturn.user = null;

    const { result } = renderHook(() => useRouteSuggestions(), {
      wrapper: createWrapper(),
    });

    expect(result.current.suggestions).toBeUndefined();
    expect(sessionsService.getSentRouteIds).not.toHaveBeenCalled();
  });

  it("sets noGym flag when no gymId is provided", async () => {
    const { result } = renderHook(() => useRouteSuggestions(), {
      wrapper: createWrapper(),
    });

    expect(result.current.noGym).toBe(true);
    expect(result.current.suggestions).toBeUndefined();
    expect(sessionsService.getSentRouteIds).not.toHaveBeenCalled();
  });

  it("uses gymId override when provided", async () => {
    const { result } = renderHook(() => useRouteSuggestions("gym-override"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should use the override gym, not home gym
    expect(sessionsService.getSentRouteIds).toHaveBeenCalledWith(
      "user-1",
      "gym-override"
    );
    expect(routeService.getCandidateRoutes).toHaveBeenCalledWith(
      "gym-override",
      12,
      16
    );
  });

  it("propagates service errors", async () => {
    sessionsService.getSentRouteIds.mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() => useRouteSuggestions("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.suggestions).toBeUndefined();
  });

  it("excludes already-sent routes from suggestions", async () => {
    // Mark r2 as already sent — it should be excluded from results
    sessionsService.getSentRouteIds.mockResolvedValueOnce(new Set(["r2"]));

    const { result } = renderHook(() => useRouteSuggestions("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const ids = result.current.suggestions!.map((s) => s.id);
    expect(ids).not.toContain("r2");
    expect(ids).toContain("r1");
    expect(ids).toContain("r3");
  });

  it("waits for pyramid and style data to load before fetching", async () => {
    // If pyramid/style data is still loading, the suggestions query
    // should be disabled (no point fetching without max grade).
    mockPyramidReturn.isLoading = true;
    mockPyramidReturn.data = undefined;

    const { result } = renderHook(() => useRouteSuggestions(), {
      wrapper: createWrapper(),
    });

    // Query shouldn't fire while pyramid is loading
    expect(sessionsService.getSentRouteIds).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
  });
});
