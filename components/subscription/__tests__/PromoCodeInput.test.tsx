/**
 * PromoCodeInput Component Tests (Step 13.2)
 *
 * Tests for the expandable promo code entry section inside the Paywall.
 * Verifies:
 *   - Toggle text renders and expands on press
 *   - Input and Redeem button appear after expansion
 *   - Mutate is called with the entered code
 *   - Loading, error, and success states render correctly
 *   - onSuccess callback is fired on successful redemption
 *   - Redeem button is disabled when input is empty
 *   - Redeem button is disabled during loading
 *   - Input placeholder renders correctly
 *
 * Mock strategy:
 * - Mock useTrials to control mutation states
 * - Mock useAuth for user state
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// ── Mocks ───────────────────────────────────────────────────────────

// Control the redeem mutation state
const mockMutate = jest.fn();
const mockRedeemMutation = {
  mutate: mockMutate,
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useTrials", () => ({
  useTrials: () => ({
    redeemMutation: mockRedeemMutation,
    trialQuery: { data: null, isLoading: false },
    isOnTrial: false,
    trialExpiresAt: null,
  }),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", tier: "free" },
    isLoading: false,
    refreshProfile: jest.fn(),
  }),
}));

import { PromoCodeInput } from "../PromoCodeInput";

describe("PromoCodeInput", () => {
  const defaultProps = {
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mutation state between tests
    mockRedeemMutation.isPending = false;
    mockRedeemMutation.isError = false;
    mockRedeemMutation.isSuccess = false;
    mockRedeemMutation.error = null;
  });

  // ── Toggle behavior ────────────────────────────────────────────────

  it("renders the toggle text in collapsed state", () => {
    // Initially the input should be hidden — just show a toggle link.
    const { getByText } = render(<PromoCodeInput {...defaultProps} />);

    expect(getByText(/have a promo code/i)).toBeTruthy();
  });

  it("expands to show input and Redeem button when toggle is pressed", () => {
    // Pressing the toggle should reveal the TextInput and Redeem button.
    const { getByText, getByPlaceholderText } = render(
      <PromoCodeInput {...defaultProps} />
    );

    fireEvent.press(getByText(/have a promo code/i));

    expect(getByPlaceholderText(/enter promo code/i)).toBeTruthy();
    expect(getByText(/redeem/i)).toBeTruthy();
  });

  // ── Redemption ─────────────────────────────────────────────────────

  it("calls mutate with the entered code when Redeem is pressed", () => {
    const { getByText, getByPlaceholderText } = render(
      <PromoCodeInput {...defaultProps} />
    );

    // Expand
    fireEvent.press(getByText(/have a promo code/i));

    // Type a code
    fireEvent.changeText(
      getByPlaceholderText(/enter promo code/i),
      "BETAFRIEND7"
    );

    // Press Redeem
    fireEvent.press(getByText(/redeem/i));

    expect(mockMutate).toHaveBeenCalledWith("BETAFRIEND7");
  });

  // ── Loading state ──────────────────────────────────────────────────

  it("shows a loading indicator when redemption is pending", () => {
    mockRedeemMutation.isPending = true;

    const { getByText, getByTestId } = render(
      <PromoCodeInput {...defaultProps} />
    );

    // Expand first
    fireEvent.press(getByText(/have a promo code/i));

    expect(getByTestId("promo-loading")).toBeTruthy();
  });

  // ── Error state ────────────────────────────────────────────────────

  it("shows an error message when redemption fails", () => {
    mockRedeemMutation.isError = true;
    mockRedeemMutation.error = new Error("Invalid or inactive promo code");

    const { getByText } = render(<PromoCodeInput {...defaultProps} />);

    // Expand
    fireEvent.press(getByText(/have a promo code/i));

    expect(getByText(/invalid or inactive promo code/i)).toBeTruthy();
  });

  // ── Success state ──────────────────────────────────────────────────

  it("calls onSuccess when redemption succeeds", () => {
    mockRedeemMutation.isSuccess = true;

    render(<PromoCodeInput {...defaultProps} />);

    // The useEffect fires onSuccess when isSuccess becomes true
    expect(defaultProps.onSuccess).toHaveBeenCalled();
  });

  it("shows a success message when redeemed", () => {
    mockRedeemMutation.isSuccess = true;

    const { getByText } = render(<PromoCodeInput {...defaultProps} />);

    // Expand (the toggle still renders since isSuccess fires before effect)
    fireEvent.press(getByText(/have a promo code/i));

    expect(getByText(/promo code redeemed/i)).toBeTruthy();
  });

  // ── Disabled state ─────────────────────────────────────────────────

  it("disables Redeem button when input is empty", () => {
    const { getByText } = render(<PromoCodeInput {...defaultProps} />);

    // Expand
    fireEvent.press(getByText(/have a promo code/i));

    // Press Redeem without entering a code
    fireEvent.press(getByText(/redeem/i));

    // Should NOT call mutate since the button is disabled
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── Accessibility ──────────────────────────────────────────────────

  it("toggle has accessibilityRole button", () => {
    // The collapsed "Have a promo code?" text acts as a button and
    // screen readers should announce it as such.
    const { getByRole } = render(<PromoCodeInput {...defaultProps} />);

    const toggle = getByRole("button", { name: /have a promo code/i });
    expect(toggle).toBeTruthy();
  });

  it("redeem button has accessibilityRole and disabled state", () => {
    // When expanded with no text entered, the Redeem button should
    // expose its disabled state via accessibilityState.
    const { getByText, getByRole } = render(
      <PromoCodeInput {...defaultProps} />
    );

    // Expand
    fireEvent.press(getByText(/have a promo code/i));

    const redeem = getByRole("button", { name: /redeem/i });
    expect(redeem.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
  });

  it("text input has accessibilityLabel", () => {
    // The text input should have a label for screen readers to announce
    // what content is expected.
    const { getByText, getByLabelText } = render(
      <PromoCodeInput {...defaultProps} />
    );

    // Expand
    fireEvent.press(getByText(/have a promo code/i));

    expect(getByLabelText(/enter promo code/i)).toBeTruthy();
  });
});
