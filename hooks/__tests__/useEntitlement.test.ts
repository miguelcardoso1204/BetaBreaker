/**
 * useEntitlement Hook Tests (Step 13.1)
 *
 * Tests for the hook that checks whether the current user has access to
 * a specific tier-gated feature. This is the primary API for feature gating
 * in the UI — screens call `useEntitlement('analytics')` to determine
 * whether to show the feature or display a Paywall.
 *
 * Mock strategy: mock useAuth to control the user's tier, then verify
 * that useEntitlement correctly delegates to checkEntitlement().
 */

import { renderHook } from "@testing-library/react-native";

// ── Mock useAuth ────────────────────────────────────────────────────
// We control what useAuth returns so we can test different tier states
// without involving real auth flows.
const mockUseAuth = jest.fn();
jest.mock("../useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

import { useEntitlement } from "../useEntitlement";

describe("useEntitlement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns hasAccess: true for a pro user checking a gated feature", () => {
    // Pro users should have access to all gated features (analytics,
    // unlimited_beta, extra_badges).
    mockUseAuth.mockReturnValue({
      user: { tier: "pro" },
      isLoading: false,
    });

    const { result } = renderHook(() => useEntitlement("analytics"));

    expect(result.current.hasAccess).toBe(true);
    expect(result.current.tier).toBe("pro");
    expect(result.current.isLoading).toBe(false);
  });

  it("returns hasAccess: false for a free user checking a gated feature", () => {
    // Free users are blocked from all gated features — the UI should
    // show a Paywall instead of the feature content.
    mockUseAuth.mockReturnValue({
      user: { tier: "free" },
      isLoading: false,
    });

    const { result } = renderHook(() => useEntitlement("analytics"));

    expect(result.current.hasAccess).toBe(false);
    expect(result.current.tier).toBe("free");
  });

  it("returns isLoading: true while auth state is loading", () => {
    // During app startup, useAuth hasn't fetched the profile yet.
    // The entitlement hook should reflect this loading state so the
    // UI can show a skeleton/spinner instead of a premature paywall.
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
    });

    const { result } = renderHook(() => useEntitlement("unlimited_beta"));

    expect(result.current.isLoading).toBe(true);
  });

  it("defaults to free tier when user is null", () => {
    // If auth state hasn't loaded yet or the user is signed out,
    // default to 'free' tier — never grant access by accident.
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
    });

    const { result } = renderHook(() => useEntitlement("extra_badges"));

    expect(result.current.hasAccess).toBe(false);
    expect(result.current.tier).toBe("free");
  });

  it("returns the correct tier string", () => {
    // The `tier` field is exposed so components can show tier-specific
    // messaging (e.g., "Upgrade from Free to Pro").
    mockUseAuth.mockReturnValue({
      user: { tier: "pro" },
      isLoading: false,
    });

    const { result } = renderHook(() => useEntitlement("analytics"));

    expect(result.current.tier).toBe("pro");
  });
});
