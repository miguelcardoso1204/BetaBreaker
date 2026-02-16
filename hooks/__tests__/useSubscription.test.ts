/**
 * useSubscription Hook Tests (Step 13.1)
 *
 * Tests for the hook that manages the IAP purchase and restore flows.
 * The hook wraps purchaseService methods in TanStack Query mutations
 * and calls refreshProfile() after a successful purchase/restore to
 * pick up the updated tier.
 *
 * Mock strategy:
 * - Mock purchaseService (subscribe, verifyReceipt, restorePurchases)
 * - Mock useAuth to provide refreshProfile
 * - Wrap rendering in QueryClientProvider for TanStack Query mutations
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ───────────────────────────────────────────────────────────

// Mock the purchase service — we control what subscribe/restore return
jest.mock("@/services/purchase.service", () => ({
  purchaseService: {
    subscribe: jest.fn(),
    verifyReceipt: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));

// Mock useAuth to provide a controllable refreshProfile function
const mockRefreshProfile = jest.fn();
jest.mock("../useAuth", () => ({
  useAuth: () => ({
    user: { tier: "free" },
    isLoading: false,
    refreshProfile: mockRefreshProfile,
  }),
}));

import { useSubscription } from "../useSubscription";

const { purchaseService } = jest.requireMock<{
  purchaseService: {
    subscribe: jest.Mock;
    verifyReceipt: jest.Mock;
    restorePurchases: jest.Mock;
  };
}>("@/services/purchase.service");

// ── Test wrapper with QueryClient ───────────────────────────────────
// TanStack Query mutations require a QueryClientProvider in the tree.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
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

describe("useSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Purchase flow ─────────────────────────────────────────────────

  it("purchaseMutation calls subscribe then verifyReceipt", async () => {
    // The purchase flow is: subscribe (opens store sheet) → verifyReceipt
    // (server-side validation) → refreshProfile (pick up new tier).
    const mockPurchase = {
      transactionId: "txn-001",
      purchaseToken: "receipt-abc",
      productId: "com.betabreaker.pro.monthly",
    };

    purchaseService.subscribe.mockResolvedValueOnce(mockPurchase);
    purchaseService.verifyReceipt.mockResolvedValueOnce({
      data: { success: true, tier: "pro" },
      error: null,
    });
    mockRefreshProfile.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.purchaseMutation.mutate("com.betabreaker.pro.monthly");
    });

    await waitFor(() => {
      expect(result.current.purchaseMutation.isSuccess).toBe(true);
    });

    expect(purchaseService.subscribe).toHaveBeenCalledWith(
      "com.betabreaker.pro.monthly"
    );
    expect(purchaseService.verifyReceipt).toHaveBeenCalledWith(mockPurchase);
  });

  it("calls refreshProfile after successful purchase", async () => {
    // After the Edge Function updates the tier in the DB, we need
    // to re-fetch the profile so the UI reflects the change.
    const mockPurchase = {
      transactionId: "txn-002",
      purchaseToken: "receipt-def",
      productId: "com.betabreaker.pro.monthly",
    };

    purchaseService.subscribe.mockResolvedValueOnce(mockPurchase);
    purchaseService.verifyReceipt.mockResolvedValueOnce({
      data: { success: true, tier: "pro" },
      error: null,
    });
    mockRefreshProfile.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.purchaseMutation.mutate("com.betabreaker.pro.monthly");
    });

    await waitFor(() => {
      expect(result.current.purchaseMutation.isSuccess).toBe(true);
    });

    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
  });

  it("enters error state when purchase fails", async () => {
    // If the user cancels the store sheet or the store returns an error,
    // the mutation should enter the error state so the UI can display
    // an error message.
    purchaseService.subscribe.mockRejectedValueOnce(
      new Error("User cancelled")
    );

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.purchaseMutation.mutate("com.betabreaker.pro.monthly");
    });

    await waitFor(() => {
      expect(result.current.purchaseMutation.isError).toBe(true);
    });
  });

  // ── Restore flow ──────────────────────────────────────────────────

  it("restoreMutation calls restorePurchases then verifyReceipt for each", async () => {
    // Restore flow: get all available purchases from the store, then
    // verify each one server-side to ensure the user gets pro access.
    const mockPurchases = [
      {
        transactionId: "txn-restored-001",
        purchaseToken: "receipt-restored",
        productId: "com.betabreaker.pro.monthly",
      },
    ];

    purchaseService.restorePurchases.mockResolvedValueOnce(mockPurchases);
    purchaseService.verifyReceipt.mockResolvedValueOnce({
      data: { success: true, tier: "pro" },
      error: null,
    });
    mockRefreshProfile.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.restoreMutation.mutate();
    });

    await waitFor(() => {
      expect(result.current.restoreMutation.isSuccess).toBe(true);
    });

    expect(purchaseService.restorePurchases).toHaveBeenCalledTimes(1);
    expect(purchaseService.verifyReceipt).toHaveBeenCalledWith(
      mockPurchases[0]
    );
  });

  it("calls refreshProfile after successful restore", async () => {
    const mockPurchases = [
      {
        transactionId: "txn-restored-002",
        purchaseToken: "receipt-restored-2",
        productId: "com.betabreaker.pro.monthly",
      },
    ];

    purchaseService.restorePurchases.mockResolvedValueOnce(mockPurchases);
    purchaseService.verifyReceipt.mockResolvedValueOnce({
      data: { success: true, tier: "pro" },
      error: null,
    });
    mockRefreshProfile.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.restoreMutation.mutate();
    });

    await waitFor(() => {
      expect(result.current.restoreMutation.isSuccess).toBe(true);
    });

    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
  });

  it("enters error state when restore fails", async () => {
    purchaseService.restorePurchases.mockRejectedValueOnce(
      new Error("No purchases found")
    );

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.restoreMutation.mutate();
    });

    await waitFor(() => {
      expect(result.current.restoreMutation.isError).toBe(true);
    });
  });
});
