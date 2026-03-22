/**
 * Notification Center Screen Tests
 *
 * Tests the main notification list screen at app/notifications/index.tsx.
 * Three states to test:
 *   1. Loading — shows ActivityIndicator
 *   2. Empty — shows "no notifications" message
 *   3. Data — renders FlatList of NotificationItem components
 *
 * Also tests:
 *   - "Mark all read" button calls the mutation
 *   - Tapping a notification calls markAsRead
 *   - Gear icon exists for navigating to preferences
 *
 * Mock strategy:
 *   - useNotifications: controls notification list data
 *   - useUnreadCount: not used directly, but needed by imports
 *   - useMarkAsRead/useMarkAllAsRead: mutation mocks
 *   - useNotificationRealtime: no-op (just needs to not throw)
 *   - expo-router: mock useRouter for navigation assertions
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock data objects defined outside jest.mock but referenced inside
// via the __mock* exports pattern.
jest.mock("@/hooks/useNotifications", () => {
  const mockData = {
    notifications: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  const mockMarkAsRead = {
    mutate: jest.fn(),
  };
  const mockMarkAllAsRead = {
    mutate: jest.fn(),
  };
  return {
    useNotifications: () => mockData,
    useUnreadCount: () => ({ count: 0, isLoading: false }),
    useMarkAsRead: () => mockMarkAsRead,
    useMarkAllAsRead: () => mockMarkAllAsRead,
    useNotificationRealtime: jest.fn(),
    __mockData: mockData,
    __mockMarkAsRead: mockMarkAsRead,
    __mockMarkAllAsRead: mockMarkAllAsRead,
  };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Award: (props: any) => <View testID="icon-award" {...props} />,
    Trophy: (props: any) => <View testID="icon-trophy" {...props} />,
    Users: (props: any) => <View testID="icon-users" {...props} />,
    AlertCircle: (props: any) => <View testID="icon-alert" {...props} />,
    Bell: (props: any) => <View testID="icon-bell" {...props} />,
    Settings: (props: any) => <View testID="icon-settings" {...props} />,
    ArrowLeft: (props: any) => <View testID="icon-arrow-left" {...props} />,
  };
});

import NotificationsScreen from "../index";

const {
  __mockData,
  __mockMarkAsRead,
  __mockMarkAllAsRead,
} = jest.requireMock<{
  __mockData: { notifications: any[]; isLoading: boolean; error: Error | null };
  __mockMarkAsRead: { mutate: jest.Mock };
  __mockMarkAllAsRead: { mutate: jest.Mock };
}>("@/hooks/useNotifications");

// ── Helpers ──────────────────────────────────────────────────────

function resetMocks() {
  __mockData.notifications = [];
  __mockData.isLoading = false;
  __mockData.error = null;
  __mockMarkAsRead.mutate.mockClear();
  __mockMarkAllAsRead.mutate.mockClear();
}

// ── Tests ────────────────────────────────────────────────────────

describe("NotificationsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  it("shows loading indicator while fetching", () => {
    __mockData.isLoading = true;

    render(<NotificationsScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows empty state when no notifications", () => {
    __mockData.notifications = [];

    render(<NotificationsScreen />);

    expect(
      screen.getByText(/no notifications/i)
    ).toBeOnTheScreen();
  });

  it("renders notification items when data exists", () => {
    __mockData.notifications = [
      {
        id: "notif-1",
        type: "badge_earned",
        title: "New Badge!",
        body: "You earned First Flash",
        read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: "notif-2",
        type: "rank_change",
        title: "Rank Up!",
        body: "You moved to #3",
        read: true,
        created_at: new Date().toISOString(),
      },
    ];

    render(<NotificationsScreen />);

    expect(screen.getByText("New Badge!")).toBeOnTheScreen();
    expect(screen.getByText("Rank Up!")).toBeOnTheScreen();
  });

  it("shows the Notifications title", () => {
    render(<NotificationsScreen />);

    expect(screen.getByText("Notifications")).toBeOnTheScreen();
  });

  it("renders Mark all read button", () => {
    render(<NotificationsScreen />);

    expect(screen.getByText(/mark all read/i)).toBeOnTheScreen();
  });

  it("calls markAllAsRead when Mark all read is pressed", () => {
    __mockData.notifications = [
      {
        id: "notif-1",
        type: "badge_earned",
        title: "Badge!",
        body: "Text",
        read: false,
        created_at: new Date().toISOString(),
      },
    ];

    render(<NotificationsScreen />);

    fireEvent.press(screen.getByText(/mark all read/i));

    expect(__mockMarkAllAsRead.mutate).toHaveBeenCalled();
  });

  it("calls markAsRead when a notification is tapped", () => {
    __mockData.notifications = [
      {
        id: "notif-1",
        type: "badge_earned",
        title: "Badge!",
        body: "Text",
        read: false,
        created_at: new Date().toISOString(),
      },
    ];

    render(<NotificationsScreen />);

    fireEvent.press(screen.getByTestId("notification-item-notif-1"));

    expect(__mockMarkAsRead.mutate).toHaveBeenCalledWith({
      notificationId: "notif-1",
    });
  });

  it("renders gear icon for preferences navigation", () => {
    render(<NotificationsScreen />);

    // The settings/gear icon should be present in the header
    expect(screen.getByTestId("icon-settings")).toBeOnTheScreen();
  });

  it("has a back navigation button", () => {
    render(<NotificationsScreen />);

    expect(screen.getByTestId("icon-arrow-left")).toBeOnTheScreen();
  });
});
