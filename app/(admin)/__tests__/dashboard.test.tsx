/**
 * Admin Dashboard Screen Tests (Step 15.1)
 *
 * Tests the admin dashboard that displays:
 *   - Stat widgets: active routes, retiring soon, total ascents
 *   - Recent activity feed (climber name, route name, status)
 *   - Loading, empty, and error states
 *
 * Mock strategy:
 *   - useAdminDashboard: mutable __mockData pattern (from billing.test.tsx)
 *   - useAuth: provides homeGymId for gym-scoped queries
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1", homeGymId: "gym-1" },
    role: "gym_admin",
  }),
}));

// ── Mock useAdminDashboard ──────────────────────────────────────────
jest.mock("@/hooks/useAdminDashboard", () => {
  // Mutable object so tests can override data before rendering
  const mockData = {
    activeRoutes: 0,
    retiringRoutes: 0,
    totalAscents: 0,
    recentActivity: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useAdminDashboard: () => mockData,
    __mockData: mockData,
  };
});

import DashboardScreen from "../dashboard";

const { __mockData } = jest.requireMock<{
  __mockData: {
    activeRoutes: number;
    retiringRoutes: number;
    totalAscents: number;
    recentActivity: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useAdminDashboard");

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockData.activeRoutes = 0;
  __mockData.retiringRoutes = 0;
  __mockData.totalAscents = 0;
  __mockData.recentActivity = [];
  __mockData.isLoading = false;
  __mockData.error = null;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("DashboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    __mockData.isLoading = true;

    render(<DashboardScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows active routes count", () => {
    // The "Active Routes" widget should display the count from the hook.
    __mockData.activeRoutes = 24;
    // Need at least one non-zero field to avoid empty state
    __mockData.recentActivity = [{ id: "a" }];

    render(<DashboardScreen />);

    expect(screen.getByText("24")).toBeOnTheScreen();
    expect(screen.getByText("Active Routes")).toBeOnTheScreen();
  });

  it("shows retiring soon count", () => {
    // The "Retiring Soon" widget replaces the spec's "sets in progress"
    // since no draft status exists in the schema.
    __mockData.retiringRoutes = 5;
    __mockData.recentActivity = [{ id: "a" }];

    render(<DashboardScreen />);

    expect(screen.getByText("5")).toBeOnTheScreen();
    expect(screen.getByText("Retiring Soon")).toBeOnTheScreen();
  });

  it("shows total ascents count", () => {
    // "Total Ascents" replaces the spec's "scan count" since no
    // qr_scans table exists.
    __mockData.totalAscents = 482;
    __mockData.recentActivity = [{ id: "a" }];

    render(<DashboardScreen />);

    expect(screen.getByText("482")).toBeOnTheScreen();
    expect(screen.getByText("Total Ascents")).toBeOnTheScreen();
  });

  it("shows recent activity items", () => {
    // The activity feed should show climber name, route name,
    // and ascent status for each item.
    __mockData.recentActivity = [
      {
        id: "asc-1",
        status: "send",
        attempts: 2,
        created_at: "2026-02-18T10:00:00Z",
        route: { name: "Crimpy Corner", gym_id: "gym-1", canonical_grade: 12 },
        climber: { display_name: "Alice" },
      },
      {
        id: "asc-2",
        status: "flash",
        attempts: 1,
        created_at: "2026-02-18T09:30:00Z",
        route: { name: "Slab Master", gym_id: "gym-1", canonical_grade: 8 },
        climber: { display_name: "Bob" },
      },
    ];

    render(<DashboardScreen />);

    // Climber names
    expect(screen.getByText("Alice")).toBeOnTheScreen();
    expect(screen.getByText("Bob")).toBeOnTheScreen();
    // Route names (combined with grade in the same Text element)
    expect(screen.getByText(/Crimpy Corner/)).toBeOnTheScreen();
    expect(screen.getByText(/Slab Master/)).toBeOnTheScreen();
    // Status badges
    expect(screen.getByText("send")).toBeOnTheScreen();
    expect(screen.getByText("flash")).toBeOnTheScreen();
  });

  it("shows empty state when all zeroes and no activity", () => {
    // A brand-new gym with no routes or activity should see a
    // helpful empty state message.
    __mockData.activeRoutes = 0;
    __mockData.retiringRoutes = 0;
    __mockData.totalAscents = 0;
    __mockData.recentActivity = [];

    render(<DashboardScreen />);

    expect(screen.getByText("No activity yet")).toBeOnTheScreen();
  });

  it("shows error state", () => {
    // When the hook returns an error, the screen should display
    // the error message so the admin knows something went wrong.
    __mockData.error = new Error("Failed to load dashboard");

    render(<DashboardScreen />);

    expect(screen.getByText("Failed to load dashboard")).toBeOnTheScreen();
  });
});
