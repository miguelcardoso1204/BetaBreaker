/**
 * Paywall Component Tests (Step 13.1)
 *
 * Tests for the subscription upsell modal that appears when a free-tier
 * user tries to access a Pro feature. The Paywall shows:
 *   - A list of Pro benefits
 *   - A Subscribe button that triggers an IAP purchase
 *   - A Restore Purchases link for users who previously subscribed
 *   - Loading, error, and success states
 *
 * Mock strategy:
 * - Mock useSubscription to control mutation states
 * - Mock useAuth for user state
 * - Wrap in QueryClientProvider (for any internal query needs)
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// ── Mocks ───────────────────────────────────────────────────────────

// Control the purchase/restore mutation state
const mockPurchaseMutate = jest.fn();
const mockRestoreMutate = jest.fn();
const mockPurchaseMutation = {
  mutate: mockPurchaseMutate,
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
};
const mockRestoreMutation = {
  mutate: mockRestoreMutate,
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
};

jest.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({
    purchaseMutation: mockPurchaseMutation,
    restoreMutation: mockRestoreMutation,
  }),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { tier: "free" },
    isLoading: false,
    refreshProfile: jest.fn(),
  }),
}));

import { Paywall } from "../Paywall";

describe("Paywall", () => {
  const defaultProps = {
    visible: true,
    onDismiss: jest.fn(),
    feature: "analytics" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mutation state to defaults between tests
    mockPurchaseMutation.isPending = false;
    mockPurchaseMutation.isError = false;
    mockPurchaseMutation.isSuccess = false;
    mockPurchaseMutation.error = null;
    mockRestoreMutation.isPending = false;
    mockRestoreMutation.isError = false;
    mockRestoreMutation.isSuccess = false;
  });

  // ── Rendering ─────────────────────────────────────────────────────

  it("renders the Pro benefits list", () => {
    // The Paywall should list all three Pro benefits to convince
    // users that the upgrade is worthwhile.
    const { getByText } = render(<Paywall {...defaultProps} />);

    // Use getAllByText for "analytics" since it appears in both the
    // subtitle and the benefits list (that's expected — the subtitle
    // mentions the triggering feature, and the list shows all benefits).
    expect(getByText(/Full analytics dashboard/)).toBeTruthy();
    expect(getByText(/Unlimited beta video uploads/)).toBeTruthy();
    expect(getByText(/Display up to 3 profile badges/)).toBeTruthy();
  });

  it("shows a Subscribe button", () => {
    const { getByText } = render(<Paywall {...defaultProps} />);

    expect(getByText(/subscribe/i)).toBeTruthy();
  });

  it("shows a Restore Purchases link", () => {
    // Users who previously subscribed (e.g., reinstalled the app)
    // need a way to restore their purchase without paying again.
    const { getByText } = render(<Paywall {...defaultProps} />);

    expect(getByText(/restore/i)).toBeTruthy();
  });

  // ── Interactions ──────────────────────────────────────────────────

  it("calls purchaseMutation.mutate when Subscribe is pressed", () => {
    const { getByText } = render(<Paywall {...defaultProps} />);

    fireEvent.press(getByText(/subscribe/i));

    expect(mockPurchaseMutate).toHaveBeenCalledWith(
      "com.betabreaker.pro.monthly"
    );
  });

  it("calls restoreMutation.mutate when Restore is pressed", () => {
    const { getByText } = render(<Paywall {...defaultProps} />);

    fireEvent.press(getByText(/restore/i));

    expect(mockRestoreMutate).toHaveBeenCalled();
  });

  // ── Loading state ─────────────────────────────────────────────────

  it("shows a loading indicator when purchase is pending", () => {
    // While the store sheet is showing or receipt verification is in
    // progress, the Paywall should show a loading state.
    mockPurchaseMutation.isPending = true;

    const { getByTestId } = render(<Paywall {...defaultProps} />);

    expect(getByTestId("purchase-loading")).toBeTruthy();
  });

  // ── Error state ───────────────────────────────────────────────────

  it("shows an error message when purchase fails", () => {
    // If the purchase or receipt verification fails, show an error
    // so the user knows to try again.
    mockPurchaseMutation.isError = true;

    const { getByText } = render(<Paywall {...defaultProps} />);

    expect(getByText(/failed/i)).toBeTruthy();
  });

  // ── Success / Dismiss ─────────────────────────────────────────────

  it("calls onDismiss when purchase succeeds", () => {
    // After a successful purchase, the Paywall auto-dismisses so the
    // user can immediately access the feature they wanted.
    mockPurchaseMutation.isSuccess = true;

    render(<Paywall {...defaultProps} />);

    expect(defaultProps.onDismiss).toHaveBeenCalled();
  });

  it("displays the feature name that triggered the paywall", () => {
    // Show which feature prompted the paywall so users understand
    // what they're unlocking. The subtitle includes the feature description.
    const { getByText } = render(
      <Paywall {...defaultProps} feature="analytics" />
    );

    // The subtitle says "Unlock full analytics dashboard and more"
    expect(getByText(/unlock.*analytics/i)).toBeTruthy();
  });
});
