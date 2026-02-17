/**
 * useBilling Hook Tests (Step 13.3)
 *
 * Tests for the hook that provides billing data to the admin dashboard.
 * The hook wraps billingService with TanStack Query and computes a
 * projected bill from the active user count.
 *
 * Mock strategy:
 * - Mock billingService methods (return controlled data/error)
 * - Wrap rendering in QueryClientProvider for TanStack Query
 */

import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ───────────────────────────────────────────────────────────

jest.mock("@/services/billing.service", () => ({
  billingService: {
    getGymBillingHistory: jest.fn(),
    getCurrentMonthActiveUsers: jest.fn(),
  },
}));

import { useBilling } from "../useBilling";

const { billingService } = jest.requireMock<{
  billingService: {
    getGymBillingHistory: jest.Mock;
    getCurrentMonthActiveUsers: jest.Mock;
  };
}>("@/services/billing.service");

// ── Test wrapper with QueryClient ───────────────────────────────────
// TanStack Query hooks require a QueryClientProvider in the tree.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
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

describe("useBilling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches billing history for a gym", async () => {
    // When a gymId is provided, the hook should fetch billing records
    // from the service and return them via billingHistory.
    const mockRecords = [
      { id: "rec-1", period_start: "2026-01-01", active_user_count: 5, total_due_eur: 2.5 },
    ];

    billingService.getGymBillingHistory.mockResolvedValueOnce({
      data: mockRecords,
      error: null,
    });
    billingService.getCurrentMonthActiveUsers.mockResolvedValueOnce({
      data: 3,
      error: null,
    });

    const { result } = renderHook(() => useBilling("gym-123"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.billingHistory).toEqual(mockRecords);
    expect(billingService.getGymBillingHistory).toHaveBeenCalledWith("gym-123");
  });

  it("fetches current month active users", async () => {
    // The activeUsers field should come from the RPC call that counts
    // distinct users with ascents in the current month.
    billingService.getGymBillingHistory.mockResolvedValueOnce({
      data: [],
      error: null,
    });
    billingService.getCurrentMonthActiveUsers.mockResolvedValueOnce({
      data: 7,
      error: null,
    });

    const { result } = renderHook(() => useBilling("gym-456"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeUsers).toBe(7);
    expect(billingService.getCurrentMonthActiveUsers).toHaveBeenCalledWith("gym-456");
  });

  it("computes projected bill from active users × rate", async () => {
    // projectedBill = activeUsers × GYM_BILLING_RATE_EUR (€0.50)
    // So 6 active users → €3.00 projected bill.
    billingService.getGymBillingHistory.mockResolvedValueOnce({
      data: [],
      error: null,
    });
    billingService.getCurrentMonthActiveUsers.mockResolvedValueOnce({
      data: 6,
      error: null,
    });

    const { result } = renderHook(() => useBilling("gym-789"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.projectedBill).toBe(3.0);
  });

  it("disables queries when gymId is null", async () => {
    // When no gym is selected, neither query should fire — both
    // are disabled via the `enabled: !!gymId` option.
    const { result } = renderHook(() => useBilling(null), {
      wrapper: createWrapper(),
    });

    // Queries should not be loading (they're disabled, not pending)
    expect(result.current.isLoading).toBe(false);
    expect(result.current.billingHistory).toEqual([]);
    expect(result.current.activeUsers).toBe(0);
    expect(result.current.projectedBill).toBe(0);

    // Service methods should never have been called
    expect(billingService.getGymBillingHistory).not.toHaveBeenCalled();
    expect(billingService.getCurrentMonthActiveUsers).not.toHaveBeenCalled();
  });
});
