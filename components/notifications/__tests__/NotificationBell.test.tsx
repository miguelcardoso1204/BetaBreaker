/**
 * NotificationBell Component Tests
 *
 * Tests the bell icon with unread count badge overlay used in the
 * home screen header. The component:
 *   - Wraps IconButton with a Bell icon
 *   - Shows a red badge with the unread count when count > 0
 *   - Caps display at "99+" for count >= 100
 *   - Hides the badge entirely when count === 0
 *   - Delegates press handling to the parent (navigates to notification center)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Bell: (props: any) => <View testID="icon-bell" {...props} />,
  };
});

import { NotificationBell } from "../NotificationBell";

// ── Tests ────────────────────────────────────────────────────────

describe("NotificationBell", () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the bell icon", () => {
    render(<NotificationBell count={0} onPress={mockOnPress} />);

    expect(screen.getByTestId("icon-bell")).toBeOnTheScreen();
  });

  it("hides badge when count is 0", () => {
    // No unread notifications = no red dot. The badge should not
    // render at all (not just be invisible) to avoid layout shifts.
    render(<NotificationBell count={0} onPress={mockOnPress} />);

    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });

  it("shows badge with count when count > 0", () => {
    render(<NotificationBell count={5} onPress={mockOnPress} />);

    const badge = screen.getByTestId("notification-badge");
    expect(badge).toBeOnTheScreen();
    expect(screen.getByText("5")).toBeOnTheScreen();
  });

  it("caps display at 99+ for large counts", () => {
    // Counts above 99 would break the badge layout, so we cap the
    // display text. The actual count prop stays accurate.
    render(<NotificationBell count={150} onPress={mockOnPress} />);

    expect(screen.getByText("99+")).toBeOnTheScreen();
  });

  it("calls onPress when bell is pressed", () => {
    render(<NotificationBell count={3} onPress={mockOnPress} />);

    fireEvent.press(screen.getByRole("button"));

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it("shows badge for count of 1", () => {
    // Edge case: single unread notification should still show badge
    render(<NotificationBell count={1} onPress={mockOnPress} />);

    expect(screen.getByText("1")).toBeOnTheScreen();
    expect(screen.getByTestId("notification-badge")).toBeOnTheScreen();
  });
});
