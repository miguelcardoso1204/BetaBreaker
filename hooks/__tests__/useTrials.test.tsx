/**
 * useTrials Hook Tests (Step 13.2)
 *
 * Tests for the trial status query and promo code redemption mutation.
 * Verifies that:
 *   - redeemMutation calls trialService.redeemPromoCode
 *   - refreshProfile is called after successful redemption
 *   - Trial query cache is invalidated on success
 *   - Network errors surface in mutation error state
 *   - Business errors (e.g., already trialed) surface correctly
 *   - trialQuery fetches trial data
 *
 * Mock strategy:
 * - Mock trialService (getActiveTrial, redeemPromoCode)
 * - Mock useAuth to provide user + refreshProfile
 * - Wrap in QueryClientProvider for TanStack Query
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ───────────────────────────────────────────────────────────

// Mock the trial service
jest.mock("@/services/trial.service", () => ({
  trialService: {
    getActiveTrial: jest.fn(),
    redeemPromoCode: jest.fn(),
  },
}));

// Mock useAuth to provide a controllable refreshProfile and user
const mockRefreshProfile = jest.fn();
jest.mock("../useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user-id", tier: "free" },
    isLoading: false,
    refreshProfile: mockRefreshProfile,
  }),
}));

import { useTrials } from "../useTrials";

const { trialService } = jest.requireMock<{
  trialService: {
    getActiveTrial: jest.Mock;
    redeemPromoCode: jest.Mock;
  };
}>("@/services/trial.service");

// ── Test wrapper with QueryClient ───────────────────────────────────
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe("useTrials", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no existing trial
    trialService.getActiveTrial.mockResolvedValue({
      data: null,
      error: null,
    });
  });

  // ── Redeem mutation ────────────────────────────────────────────────

  it("redeemMutation calls trialService.redeemPromoCode", async () => {
    // When the user enters a promo code and hits Redeem, the mutation
    // should call the service which invokes the Edge Function.
    trialService.redeemPromoCode.mockResolvedValueOnce({
      data: { success: true, tier: "pro", trial_expires_at: "2026-02-24" },
      error: null,
    });
    mockRefreshProfile.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTrials(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.redeemMutation.mutate("BETAFRIEND7");
    });

    await waitFor(() => {
      expect(result.current.redeemMutation.isSuccess).toBe(true);
    });

    expect(trialService.redeemPromoCode).toHaveBeenCalledWith("BETAFRIEND7");
  });

  it("calls refreshProfile after successful redemption", async () => {
    // After the Edge Function sets tier = 'pro' in the DB, we need
    // to re-fetch the profile so the UI reflects the new tier.
    trialService.redeemPromoCode.mockResolvedValueOnce({
      data: { success: true, tier: "pro" },
      error: null,
    });
    mockRefreshProfile.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTrials(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.redeemMutation.mutate("BETAFRIEND7");
    });

    await waitFor(() => {
      expect(result.current.redeemMutation.isSuccess).toBe(true);
    });

    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
  });

  it("invalidates trial query on successful redemption", async () => {
    // After redeeming, the trial query should refetch to show the new
    // trial record. We verify by checking that getActiveTrial is called
    // again after the mutation succeeds.
    trialService.redeemPromoCode.mockResolvedValueOnce({
      data: { success: true, tier: "pro" },
      error: null,
    });
    mockRefreshProfile.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTrials(), {
      wrapper: createWrapper(),
    });

    // Wait for initial query to fire
    await waitFor(() => {
      expect(trialService.getActiveTrial).toHaveBeenCalledTimes(1);
    });

    // Set up fresh response for the re-fetch after invalidation
    trialService.getActiveTrial.mockResolvedValueOnce({
      data: { status: "active", expires_at: "2026-02-24" },
      error: null,
    });

    await act(async () => {
      result.current.redeemMutation.mutate("BETAFRIEND7");
    });

    await waitFor(() => {
      expect(result.current.redeemMutation.isSuccess).toBe(true);
    });

    // getActiveTrial should have been called again due to invalidation
    await waitFor(() => {
      expect(trialService.getActiveTrial).toHaveBeenCalledTimes(2);
    });
  });

  it("enters error state on network error", async () => {
    // If the Edge Function call fails (network issue), the mutation
    // should enter the error state so the UI can show an error message.
    trialService.redeemPromoCode.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(() => useTrials(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.redeemMutation.mutate("BADCODE");
    });

    await waitFor(() => {
      expect(result.current.redeemMutation.isError).toBe(true);
    });
  });

  it("enters error state on business error (already trialed)", async () => {
    // If the user already redeemed a trial, the Edge Function returns
    // a 409 error. The mutation should surface this.
    trialService.redeemPromoCode.mockResolvedValueOnce({
      data: null,
      error: { message: "You have already used a trial" },
    });

    const { result } = renderHook(() => useTrials(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.redeemMutation.mutate("BETAFRIEND7");
    });

    await waitFor(() => {
      expect(result.current.redeemMutation.isError).toBe(true);
    });
  });

  it("trialQuery fetches active trial data", async () => {
    // When the user has an active trial, the query should return it
    // and the computed isOnTrial should be true.
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    trialService.getActiveTrial.mockResolvedValueOnce({
      data: {
        status: "active",
        expires_at: futureDate.toISOString(),
        user_id: "test-user-id",
      },
      error: null,
    });

    const { result } = renderHook(() => useTrials(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.trialQuery.isSuccess).toBe(true);
    });

    expect(result.current.trialQuery.data?.status).toBe("active");
    expect(result.current.isOnTrial).toBe(true);
    expect(result.current.trialExpiresAt).toBeInstanceOf(Date);
  });
});
