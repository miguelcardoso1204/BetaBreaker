/**
 * Admin Calendar Screen Tests (Step 15.3)
 *
 * Tests the calendar screen that displays:
 *   - CalendarGrid component for month navigation + date selection
 *   - Session list for the selected date
 *   - Add session form (setter picker + notes)
 *   - Setter workload summary
 *   - Loading, empty, and error states
 *
 * Mock strategy:
 *   - useSettingSessions / useSetterWorkload: mutable __mockData pattern
 *   - useCreateSettingSession / useUpdateSettingSession / useDeleteSettingSession: jest.fn()
 *   - useGymSetters: provides setter list for the dropdown
 *   - useAuth: provides adminGymId for gym-scoped queries
 *   - CalendarGrid: simplified mock to avoid date-fns complexity in screen tests
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1" },
    adminGymId: "gym-1",
    role: "gym_admin",
  }),
}));

// ── Mock useSettingCalendar hooks ────────────────────────────────────
jest.mock("@/hooks/useSettingCalendar", () => {
  const mockSessionsData = {
    sessions: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  const mockWorkloadData = {
    workload: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useSettingSessions: () => mockSessionsData,
    useSetterWorkload: () => mockWorkloadData,
    useCreateSettingSession: () => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    }),
    useUpdateSettingSession: () => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    }),
    useDeleteSettingSession: () => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    }),
    __mockSessionsData: mockSessionsData,
    __mockWorkloadData: mockWorkloadData,
  };
});

// ── Mock useGymSetters ──────────────────────────────────────────────
jest.mock("@/hooks/useAdminRoutes", () => ({
  useGymSetters: () => ({
    setters: [
      { user_id: "setter-1", display_name: "Alice Setter" },
      { user_id: "setter-2", display_name: "Bob Setter" },
    ],
    isLoading: false,
  }),
}));

// ── Mock CalendarGrid ───────────────────────────────────────────────
// The CalendarGrid has its own tests — here we just need it to be renderable
// and to simulate date selection via onSelectDate.
jest.mock("@/components/admin/CalendarGrid", () => {
  const { View, Text, Pressable } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => (
      <View testID="calendar-grid">
        <Text>Calendar Mock</Text>
        <Pressable
          testID="mock-select-date"
          onPress={() => props.onSelectDate("2026-03-15")}
        >
          <Text>Select March 15</Text>
        </Pressable>
      </View>
    ),
  };
});

// ── Mock lucide ─────────────────────────────────────────────────────
jest.mock("lucide-react-native", () => ({
  Plus: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>Plus</Text>;
  },
  Trash2: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>Trash</Text>;
  },
  Edit3: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>Edit</Text>;
  },
}));

import CalendarScreen from "../calendar";

const { __mockSessionsData, __mockWorkloadData } = jest.requireMock<{
  __mockSessionsData: {
    sessions: any[];
    isLoading: boolean;
    error: Error | null;
  };
  __mockWorkloadData: {
    workload: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useSettingCalendar");

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockSessionsData.sessions = [];
  __mockSessionsData.isLoading = false;
  __mockSessionsData.error = null;
  __mockWorkloadData.workload = [];
  __mockWorkloadData.isLoading = false;
  __mockWorkloadData.error = null;
}

describe("CalendarScreen", () => {
  beforeEach(resetMockData);

  it("renders the calendar grid", () => {
    render(<CalendarScreen />);
    expect(screen.getByTestId("calendar-grid")).toBeTruthy();
  });

  it("shows loading state", () => {
    __mockSessionsData.isLoading = true;
    render(<CalendarScreen />);
    expect(screen.getByTestId("loading-indicator")).toBeTruthy();
  });

  it("shows error state", () => {
    __mockSessionsData.error = new Error("Network failure");
    render(<CalendarScreen />);
    expect(screen.getByText(/Network failure/)).toBeTruthy();
  });

  it("shows sessions for selected date", () => {
    __mockSessionsData.sessions = [
      {
        id: "s1",
        scheduled_date: "2026-03-15",
        status: "planned",
        notes: "Set lead wall",
        setter: { id: "setter-1", display_name: "Alice Setter" },
      },
    ];

    render(<CalendarScreen />);

    // Tap a date via the mock CalendarGrid
    fireEvent.press(screen.getByTestId("mock-select-date"));

    // Session details should appear
    expect(screen.getByText("Alice Setter")).toBeTruthy();
    expect(screen.getByText("planned")).toBeTruthy();
    expect(screen.getByText("Set lead wall")).toBeTruthy();
  });

  it("shows empty message when no sessions on selected date", () => {
    __mockSessionsData.sessions = [];

    render(<CalendarScreen />);

    // Select a date with no sessions
    fireEvent.press(screen.getByTestId("mock-select-date"));

    expect(screen.getByText(/No sessions/i)).toBeTruthy();
  });

  it("shows Add Session button after selecting a date", () => {
    render(<CalendarScreen />);

    // Before selecting a date, no add button
    expect(screen.queryByTestId("add-session-button")).toBeNull();

    // Select a date
    fireEvent.press(screen.getByTestId("mock-select-date"));

    // Now the add button should appear
    expect(screen.getByTestId("add-session-button")).toBeTruthy();
  });

  it("shows workload summary when data is available", () => {
    __mockWorkloadData.workload = [
      { setter_id: "s1", display_name: "Alice Setter", route_count: 5 },
      { setter_id: "s2", display_name: "Bob Setter", route_count: 3 },
    ];

    render(<CalendarScreen />);

    // Workload section should show setter names and route counts
    expect(screen.getByText("Workload")).toBeTruthy();
    expect(screen.getByText("Alice Setter")).toBeTruthy();
    expect(screen.getByText("5 routes")).toBeTruthy();
    expect(screen.getByText("Bob Setter")).toBeTruthy();
    expect(screen.getByText("3 routes")).toBeTruthy();
  });

  it("renders the screen header", () => {
    render(<CalendarScreen />);
    expect(screen.getByText("Setting Calendar")).toBeTruthy();
  });
});
