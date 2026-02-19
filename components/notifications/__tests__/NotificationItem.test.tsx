/**
 * NotificationItem Component Tests
 *
 * Tests the presentational component that renders a single notification
 * in the notification center list. Each notification has:
 *   - A type-specific icon (Award, Trophy, Users, AlertCircle, Bell)
 *   - Title and body text (body truncated to 2 lines via numberOfLines)
 *   - Relative time display ("2h ago", "3d ago")
 *   - Unread dot indicator when read = false
 *   - Reduced opacity when read = true
 *
 * The component is purely presentational — no hooks or service calls.
 * It receives all data via props and calls onPress with the notification ID.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────
// lucide-react-native icons need mocking because Jest can't process
// the SVG transforms that Lucide uses internally.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Award: (props: any) => <View testID="icon-award" {...props} />,
    Trophy: (props: any) => <View testID="icon-trophy" {...props} />,
    Users: (props: any) => <View testID="icon-users" {...props} />,
    AlertCircle: (props: any) => <View testID="icon-alert" {...props} />,
    Bell: (props: any) => <View testID="icon-bell" {...props} />,
  };
});

import { NotificationItem } from "../NotificationItem";
import type { NotificationItemData } from "../NotificationItem";

// ── Test Data ────────────────────────────────────────────────────

const baseNotification: NotificationItemData = {
  id: "notif-1",
  type: "badge_earned",
  title: "New Badge Earned!",
  body: "You earned the First Flash badge for flashing a route.",
  read: false,
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
};

// ── Tests ────────────────────────────────────────────────────────

describe("NotificationItem", () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders title and body text", () => {
    render(
      <NotificationItem item={baseNotification} onPress={mockOnPress} />
    );

    expect(screen.getByText("New Badge Earned!")).toBeOnTheScreen();
    expect(screen.getByText(/First Flash badge/)).toBeOnTheScreen();
  });

  it("shows unread dot when notification is unread", () => {
    render(
      <NotificationItem item={baseNotification} onPress={mockOnPress} />
    );

    // The unread indicator is a small colored dot
    expect(screen.getByTestId("unread-dot")).toBeOnTheScreen();
  });

  it("hides unread dot when notification is read", () => {
    const readNotification = { ...baseNotification, read: true };

    render(
      <NotificationItem item={readNotification} onPress={mockOnPress} />
    );

    expect(screen.queryByTestId("unread-dot")).toBeNull();
  });

  it("calls onPress with notification ID when tapped", () => {
    render(
      <NotificationItem item={baseNotification} onPress={mockOnPress} />
    );

    fireEvent.press(screen.getByTestId("notification-item-notif-1"));

    expect(mockOnPress).toHaveBeenCalledWith("notif-1");
  });

  it("shows Award icon for badge_earned type", () => {
    render(
      <NotificationItem item={baseNotification} onPress={mockOnPress} />
    );

    expect(screen.getByTestId("icon-award")).toBeOnTheScreen();
  });

  it("shows Trophy icon for rank_change type", () => {
    const rankNotification = { ...baseNotification, type: "rank_change" };

    render(
      <NotificationItem item={rankNotification} onPress={mockOnPress} />
    );

    expect(screen.getByTestId("icon-trophy")).toBeOnTheScreen();
  });

  it("shows Bell icon for unknown notification types", () => {
    // The general/fallback icon for any type we don't have a specific
    // icon for — future-proofs against new notification types.
    const generalNotification = { ...baseNotification, type: "general" };

    render(
      <NotificationItem item={generalNotification} onPress={mockOnPress} />
    );

    expect(screen.getByTestId("icon-bell")).toBeOnTheScreen();
  });

  // ── Accessibility ──────────────────────────────────────────────

  it("has accessibilityRole button with label including title and body", () => {
    // Screen readers announce the notification as a tappable button with
    // the title and body combined, so users hear the full context.
    render(
      <NotificationItem item={baseNotification} onPress={mockOnPress} />
    );

    const pressable = screen.getByRole("button");
    expect(pressable.props.accessibilityLabel).toContain("New Badge Earned!");
    expect(pressable.props.accessibilityLabel).toContain(
      "You earned the First Flash badge"
    );
  });

  it("includes unread status in accessibility label for unread notifications", () => {
    // Unread notifications should announce that status so screen reader
    // users know which notifications they haven't seen yet.
    render(
      <NotificationItem item={baseNotification} onPress={mockOnPress} />
    );

    const pressable = screen.getByRole("button");
    expect(pressable.props.accessibilityLabel).toContain("Unread");
  });

  it("omits unread status in accessibility label for read notifications", () => {
    // Read notifications don't need the "Unread" announcement — that
    // would be confusing.
    const readNotification = { ...baseNotification, read: true };

    render(
      <NotificationItem item={readNotification} onPress={mockOnPress} />
    );

    const pressable = screen.getByRole("button");
    expect(pressable.props.accessibilityLabel).not.toContain("Unread");
  });
});
