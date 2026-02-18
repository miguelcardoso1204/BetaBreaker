/**
 * Admin Route List Screen Tests
 *
 * Tests the route list that gym admins see: a FlatList of routes at their
 * home gym with grade, status badges, and navigation to create/edit screens.
 *
 * Mock strategy (matching events/index.test.tsx):
 *   - useAdminRoutes: control route data via mutable __mockRoutesData
 *   - useAuth: provide a stable user with homeGymId
 *   - expo-router: capture navigation calls (push for create/edit)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock expo-router ──────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Mock useAuth ──────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1", homeGymId: "gym-1" },
    role: "gym_admin",
  }),
}));

// ── Mock useAdminRoutes ───────────────────────────────────────────────
jest.mock("@/hooks/useAdminRoutes", () => {
  const mockRoutesData = {
    routes: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useAdminRoutes: () => mockRoutesData,
    __mockRoutesData: mockRoutesData,
  };
});

import RouteListScreen from "../index";

const { __mockRoutesData } = jest.requireMock<{
  __mockRoutesData: {
    routes: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useAdminRoutes");

// ── Fixtures ──────────────────────────────────────────────────────────

const mockRoute = {
  id: "route-1",
  gym_id: "gym-1",
  name: "Crimpy McSlab",
  canonical_grade: 12,
  color: "#EF4444",
  status: "active",
  wall_section: "South",
  setter_id: "setter-1",
};

// ── Helper ────────────────────────────────────────────────────────────

function resetMockData() {
  __mockRoutesData.routes = [];
  __mockRoutesData.isLoading = false;
  __mockRoutesData.error = null;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("RouteListScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    __mockRoutesData.isLoading = true;

    render(<RouteListScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows route list with name, grade, and status", () => {
    __mockRoutesData.routes = [mockRoute];

    render(<RouteListScreen />);

    expect(screen.getByText("Crimpy McSlab")).toBeOnTheScreen();
    expect(screen.getByText("active")).toBeOnTheScreen();
  });

  it("shows empty state when no routes", () => {
    __mockRoutesData.routes = [];

    render(<RouteListScreen />);

    expect(screen.getByText("No routes yet")).toBeOnTheScreen();
  });

  it("shows error state", () => {
    __mockRoutesData.error = new Error("Network error");

    render(<RouteListScreen />);

    expect(screen.getByText("Network error")).toBeOnTheScreen();
  });

  it("navigates to edit screen when route is tapped", () => {
    __mockRoutesData.routes = [mockRoute];

    render(<RouteListScreen />);

    fireEvent.press(screen.getByText("Crimpy McSlab"));

    expect(mockPush).toHaveBeenCalledWith("/(admin)/routes/route-1");
  });

  it("navigates to create screen when create button is pressed", () => {
    render(<RouteListScreen />);

    fireEvent.press(screen.getByTestId("create-route-button"));

    expect(mockPush).toHaveBeenCalledWith("/(admin)/routes/create");
  });
});
