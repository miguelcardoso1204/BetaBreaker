/**
 * Admin Billing Screen Tests (Step 13.3)
 *
 * Tests the admin billing dashboard that displays:
 *   - Current month widget with active users and projected bill
 *   - Billing history list with period, user count, amount, and status
 *   - Loading and empty states
 *
 * Mock strategy:
 *   - useBilling hook: control billing data and query states
 *   - Same mutable mock object pattern as moderation.test.tsx
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Mock useBilling hook ─────────────────────────────────────────────
jest.mock("@/hooks/useBilling", () => {
  // Mutable object so tests can override data before rendering
  const mockBillingData = {
    billingHistory: [] as any[],
    activeUsers: 0,
    projectedBill: 0,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useBilling: () => mockBillingData,
    __mockBillingData: mockBillingData,
  };
});

import BillingScreen from "../billing";

const { __mockBillingData } = jest.requireMock<{
  __mockBillingData: {
    billingHistory: any[];
    activeUsers: number;
    projectedBill: number;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useBilling");

// ── Fixtures ─────────────────────────────────────────────────────────

const mockBillingRecord = {
  id: "rec-1",
  gym_id: "gym-1",
  period_start: "2026-01-01",
  period_end: "2026-02-01",
  active_user_count: 8,
  rate_per_user_eur: "0.50",
  total_due_eur: "4.00",
  status: "pending",
  created_at: "2026-02-01T03:00:00Z",
};

// ── Helper ───────────────────────────────────────────────────────────

function resetMockData() {
  __mockBillingData.billingHistory = [];
  __mockBillingData.activeUsers = 0;
  __mockBillingData.projectedBill = 0;
  __mockBillingData.isLoading = false;
  __mockBillingData.error = null;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("BillingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    __mockBillingData.isLoading = true;

    render(<BillingScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows empty state when no billing data", () => {
    // New gym with no billing history and no active users
    __mockBillingData.billingHistory = [];
    __mockBillingData.activeUsers = 0;

    render(<BillingScreen />);

    expect(screen.getByText("No billing history yet")).toBeOnTheScreen();
  });

  it("renders current month widget with active users", () => {
    // The widget shows the live active user count and projected bill
    __mockBillingData.activeUsers = 12;
    __mockBillingData.projectedBill = 6.0;
    __mockBillingData.billingHistory = [mockBillingRecord];

    render(<BillingScreen />);

    expect(screen.getByTestId("current-month-widget")).toBeOnTheScreen();
    expect(screen.getByText("12 active users")).toBeOnTheScreen();
  });

  it("renders billing history records", () => {
    // Past billing records should show the period, user count, and amount
    __mockBillingData.billingHistory = [mockBillingRecord];

    render(<BillingScreen />);

    // The record should display the formatted period (Jan 2026)
    expect(screen.getByText("Jan 2026")).toBeOnTheScreen();
    // Active users and total due in the detail line
    expect(screen.getByText(/8 active users · €4\.00/)).toBeOnTheScreen();
    // Status badge
    expect(screen.getByText("pending")).toBeOnTheScreen();
  });

  it("displays correct projected bill", () => {
    // projectedBill should show the euro amount with 2 decimal places
    __mockBillingData.activeUsers = 5;
    __mockBillingData.projectedBill = 2.5;
    __mockBillingData.billingHistory = [mockBillingRecord];

    render(<BillingScreen />);

    // The projected bill text includes the per-user rate
    expect(screen.getByText(/Projected: €2\.50/)).toBeOnTheScreen();
  });
});
