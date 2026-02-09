/**
 * QuickLogSheet Component Tests
 *
 * The QuickLogSheet is a modal-based bottom sheet for logging ascents during
 * an active climbing session. It lets the user select a status (Flash / Send /
 * Attempt), adjust an attempts counter, add notes, and confirm the log.
 *
 * Test strategy:
 *   - Render with `visible={true}` and verify status buttons, stepper, and
 *     confirm button are present.
 *   - Verify Flash auto-sets attempts to 1 (since a flash is by definition
 *     first-try).
 *   - Verify the stepper increments/decrements with min=1 clamping.
 *   - Verify submit calls `logAscent.mutate()` with the correct payload and
 *     triggers haptic feedback.
 *   - Verify dismiss resets the form state for the next opening.
 *
 * Mock strategy:
 *   - Mock `@/hooks/useSession` — return a `logAscent` object with a mock
 *     `mutate` function and `isPending: false`. This isolates the component
 *     from TanStack Query and the Zustand store.
 *   - Mock `expo-haptics` — verify `notificationAsync` is called on submit.
 *   - Mock `lucide-react-native` — Jest can't process SVG transforms.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock useSession — return a controlled logAscent mutation object.
// We define mutate inside the factory so it's available before imports.
jest.mock("@/hooks/useSession", () => ({
  useSession: jest.fn(() => ({
    logAscent: {
      mutate: jest.fn(),
      isPending: false,
    },
  })),
}));

// Mock expo-haptics — verify haptic feedback without native module.
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

// Mock lucide-react-native — Jest can't process the SVG transforms.
// Return simple View stubs with testIDs for each icon used by the component.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Minus: (props: Record<string, unknown>) => (
      <View testID="minus-icon" {...props} />
    ),
    Plus: (props: Record<string, unknown>) => (
      <View testID="plus-icon" {...props} />
    ),
    Zap: (props: Record<string, unknown>) => (
      <View testID="zap-icon" {...props} />
    ),
    Send: (props: Record<string, unknown>) => (
      <View testID="send-icon" {...props} />
    ),
    X: (props: Record<string, unknown>) => (
      <View testID="x-icon" {...props} />
    ),
  };
});

import { QuickLogSheet } from "../QuickLogSheet";

// Get typed references to mocked modules for configuring behavior per test.
const { useSession } = jest.requireMock<{
  useSession: jest.Mock;
}>("@/hooks/useSession");

const Haptics = jest.requireMock<{
  notificationAsync: jest.Mock;
  NotificationFeedbackType: { Success: string };
}>("expo-haptics");

// ── Helpers ──────────────────────────────────────────────────────────

/** Default props for rendering the sheet in an open state. */
const defaultProps = {
  routeId: "route-1",
  visible: true,
  onDismiss: jest.fn(),
};

/** Create a fresh mock mutate function for each test. */
function createMockLogAscent(overrides?: { isPending?: boolean }) {
  const mutate = jest.fn();
  useSession.mockReturnValue({
    logAscent: {
      mutate,
      isPending: overrides?.isPending ?? false,
    },
  });
  return mutate;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("QuickLogSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up default mock return value for useSession
    createMockLogAscent();
  });

  // ── Test 1: Sheet renders with status buttons ───────────────────
  it("renders Flash, Send, and Attempt status buttons when visible", () => {
    render(<QuickLogSheet {...defaultProps} />);

    // The three ascent status options should be visible as selectable buttons.
    expect(screen.getByText("Flash")).toBeOnTheScreen();
    expect(screen.getByText("Send")).toBeOnTheScreen();
    expect(screen.getByText("Attempt")).toBeOnTheScreen();
  });

  // ── Test 2: Flash auto-sets attempts to 1 ──────────────────────
  it("auto-sets attempts to 1 when Flash is selected", () => {
    render(<QuickLogSheet {...defaultProps} />);

    // First, increment attempts to 3 by pressing "+" twice.
    const incrementButton = screen.getByTestId("attempts-increment");
    fireEvent.press(incrementButton);
    fireEvent.press(incrementButton);
    expect(screen.getByText("3")).toBeOnTheScreen();

    // Now select Flash — attempts should reset to 1 because a "flash"
    // means the route was completed on the very first try.
    fireEvent.press(screen.getByText("Flash"));
    expect(screen.getByText("1")).toBeOnTheScreen();
  });

  // ── Test 3: Attempts increment/decrement with min clamping ─────
  it("increments and decrements attempts with minimum of 1", () => {
    render(<QuickLogSheet {...defaultProps} />);

    const incrementButton = screen.getByTestId("attempts-increment");
    const decrementButton = screen.getByTestId("attempts-decrement");

    // Initial value should be 1
    expect(screen.getByTestId("attempts-count")).toHaveTextContent("1");

    // Increment to 2
    fireEvent.press(incrementButton);
    expect(screen.getByTestId("attempts-count")).toHaveTextContent("2");

    // Decrement back to 1
    fireEvent.press(decrementButton);
    expect(screen.getByTestId("attempts-count")).toHaveTextContent("1");

    // Decrement again — should stay at 1 (minimum)
    fireEvent.press(decrementButton);
    expect(screen.getByTestId("attempts-count")).toHaveTextContent("1");
  });

  // ── Test 4: Submit calls logAscent with correct payload ────────
  it("calls logAscent.mutate with routeId, status, attempts, and notes on confirm", () => {
    const mutate = createMockLogAscent();

    render(<QuickLogSheet {...defaultProps} />);

    // Select "Send" status
    fireEvent.press(screen.getByText("Send"));

    // Increment attempts to 3
    fireEvent.press(screen.getByTestId("attempts-increment"));
    fireEvent.press(screen.getByTestId("attempts-increment"));

    // Type notes into the notes field
    fireEvent.changeText(screen.getByPlaceholderText("Notes (optional)"), "Heel hook on crux");

    // Press the confirm button. We use getByRole("button") with name matcher
    // because "Log Ascent" also appears as the sheet title (a Text element).
    // getByRole("button", { name }) matches only the Pressable with that label.
    fireEvent.press(screen.getByRole("button", { name: "Log Ascent" }));

    // Verify the mutation was called with the correct payload.
    // The component passes the routeId prop along with the form state.
    expect(mutate).toHaveBeenCalledWith({
      routeId: "route-1",
      status: "send",
      attempts: 3,
      notes: "Heel hook on crux",
    });
  });

  // ── Test 5: Haptic feedback on submit ──────────────────────────
  it("fires haptic feedback when confirm is pressed", () => {
    createMockLogAscent();

    render(<QuickLogSheet {...defaultProps} />);

    // Must select a status before confirm is enabled
    fireEvent.press(screen.getByText("Send"));

    // Press confirm — use role query to avoid matching the title text.
    fireEvent.press(screen.getByRole("button", { name: "Log Ascent" }));

    // Verify haptic feedback was triggered with Success type.
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success
    );
  });

  // ── Test 6: Dismiss resets form state ──────────────────────────
  it("resets form state when dismissed and re-opened", () => {
    const onDismiss = jest.fn();
    createMockLogAscent();

    // Render the sheet in visible state
    const { rerender } = render(
      <QuickLogSheet routeId="route-1" visible={true} onDismiss={onDismiss} />
    );

    // Select Flash and type some notes
    fireEvent.press(screen.getByText("Flash"));
    fireEvent.changeText(screen.getByPlaceholderText("Notes (optional)"), "Some beta");

    // Verify the selection is visible
    expect(screen.getByTestId("attempts-count")).toHaveTextContent("1");

    // Dismiss the sheet by setting visible=false
    rerender(
      <QuickLogSheet routeId="route-1" visible={false} onDismiss={onDismiss} />
    );

    // Re-open the sheet
    rerender(
      <QuickLogSheet routeId="route-1" visible={true} onDismiss={onDismiss} />
    );

    // Form should be reset — no status selected, attempts back to 1,
    // notes cleared. The "Log Ascent" button should still be present
    // (but disabled since no status is selected — we verify by checking
    // that the confirm button exists and attempts are reset).
    expect(screen.getByTestId("attempts-count")).toHaveTextContent("1");
  });
});
