/**
 * Admin Event List Screen Tests
 *
 * Tests the event list that gym admins see: a FlatList of events at their
 * home gym with status badges, dates, and navigation to create/edit screens.
 *
 * Mock strategy:
 *   - useEvents: control events data via mutable __mockEventsData
 *   - useAuth: provide a stable admin user with adminGymId
 *   - expo-router: capture navigation calls (push for create/edit)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock expo-router ────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1" },
    adminGymId: "gym-1",
    role: "gym_admin",
  }),
}));

// ── Mock useEvents ──────────────────────────────────────────────────
jest.mock("@/hooks/useEvents", () => {
  const mockEventsData = {
    events: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useEvents: () => mockEventsData,
    __mockEventsData: mockEventsData,
  };
});

// ── Mock lucide-react-native ────────────────────────────────────────
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Plus: (props: any) => <View testID="icon-plus" {...props} />,
    Calendar: (props: any) => <View testID="icon-calendar" {...props} />,
    Trophy: (props: any) => <View testID="icon-trophy" {...props} />,
  };
});

import EventListScreen from "../index";

const { __mockEventsData } = jest.requireMock<{
  __mockEventsData: {
    events: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useEvents");

// ── Fixtures ────────────────────────────────────────────────────────

const mockEvent = {
  id: "event-1",
  gym_id: "gym-1",
  name: "Spring Bouldering Comp",
  scoring_model: "tops_and_zones",
  start_date: "2026-03-01T09:00:00Z",
  end_date: "2026-03-01T18:00:00Z",
  status: "draft",
  created_at: "2026-02-11T00:00:00Z",
};

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockEventsData.events = [];
  __mockEventsData.isLoading = false;
  __mockEventsData.error = null;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("EventListScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    __mockEventsData.isLoading = true;

    render(<EventListScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows empty state when no events", () => {
    __mockEventsData.events = [];

    render(<EventListScreen />);

    expect(screen.getByText("No events yet")).toBeOnTheScreen();
  });

  it("renders event cards with name and status", () => {
    __mockEventsData.events = [mockEvent];

    render(<EventListScreen />);

    expect(screen.getByText("Spring Bouldering Comp")).toBeOnTheScreen();
    expect(screen.getByText("draft")).toBeOnTheScreen();
  });

  it("navigates to edit screen when event is tapped", () => {
    __mockEventsData.events = [mockEvent];

    render(<EventListScreen />);

    fireEvent.press(screen.getByText("Spring Bouldering Comp"));

    expect(mockPush).toHaveBeenCalledWith("/(admin)/events/event-1");
  });

  it("navigates to create screen when create button is pressed", () => {
    render(<EventListScreen />);

    fireEvent.press(screen.getByTestId("create-event-button"));

    expect(mockPush).toHaveBeenCalledWith("/(admin)/events/create");
  });

  it("shows error state", () => {
    __mockEventsData.error = new Error("Network error");

    render(<EventListScreen />);

    expect(screen.getByText("Network error")).toBeOnTheScreen();
  });
});
