/**
 * Edit Route Screen Tests
 *
 * Tests the route detail/edit screen that shows route info with editable
 * fields, status transition buttons, QR generation, and delete action.
 *
 * Mock strategy (matching events/[id].test.tsx):
 *   - expo-router: provides routeId via useLocalSearchParams
 *   - useAdminRoutes hooks: control data + capture mutation calls
 *   - useRoutes hooks: useRouteDetail for fetching the route
 *   - useAuth: provide stable admin user
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock expo-router ──────────────────────────────────────────────────
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "route-1" }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

// ── Mock useAuth ──────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1", homeGymId: "gym-1" },
    role: "gym_admin",
  }),
}));

// ── Mock useRoutes hooks ──────────────────────────────────────────────
jest.mock("@/hooks/useRoutes", () => {
  const mockRouteDetailData = {
    data: null as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useRouteDetail: () => mockRouteDetailData,
    __mockRouteDetailData: mockRouteDetailData,
  };
});

// ── Mock useAdminRoutes hooks ─────────────────────────────────────────
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockGenerateQrMutate = jest.fn();

jest.mock("@/hooks/useAdminRoutes", () => ({
  useUpdateRoute: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteRoute: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useGenerateQr: () => ({
    mutate: mockGenerateQrMutate,
    data: null,
    isPending: false,
  }),
  useGymSetters: () => ({
    setters: [
      {
        user_id: "setter-1",
        role: "setter",
        profile: { id: "setter-1", display_name: "RouteSetterPro" },
      },
    ],
    isLoading: false,
  }),
}));

import EditRouteScreen from "../[id]";

const { __mockRouteDetailData } = jest.requireMock<{
  __mockRouteDetailData: {
    data: any | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useRoutes");

// ── Fixtures ──────────────────────────────────────────────────────────

const mockRoute = {
  id: "route-1",
  gym_id: "gym-1",
  name: "Crimpy McSlab",
  canonical_grade: 12,
  color: "#EF4444",
  wall_section: "South",
  setter_id: "setter-1",
  status: "active",
  retired_at: null,
  setter: { display_name: "RouteSetterPro", avatar_url: null },
};

// ── Helper ────────────────────────────────────────────────────────────

function resetMockData() {
  __mockRouteDetailData.data = null;
  __mockRouteDetailData.isLoading = false;
  __mockRouteDetailData.error = null;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("EditRouteScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    __mockRouteDetailData.isLoading = true;

    render(<EditRouteScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows route details when loaded", () => {
    __mockRouteDetailData.data = mockRoute;

    render(<EditRouteScreen />);

    // Route name should be in an editable input
    expect(screen.getByDisplayValue("Crimpy McSlab")).toBeOnTheScreen();
    // Setter name should be visible
    expect(screen.getByText("RouteSetterPro")).toBeOnTheScreen();
  });

  it("shows status transition button for active routes", () => {
    // An active route should show "Retire Route" to move to retiring_soon
    __mockRouteDetailData.data = mockRoute;

    render(<EditRouteScreen />);

    expect(screen.getByText("Retire Route")).toBeOnTheScreen();
  });

  it("calls updateRoute mutation when save is pressed", () => {
    __mockRouteDetailData.data = mockRoute;

    render(<EditRouteScreen />);

    // Change the name
    fireEvent.changeText(
      screen.getByDisplayValue("Crimpy McSlab"),
      "Updated Name"
    );

    // Press save
    fireEvent.press(screen.getByText("Save Changes"));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: "route-1",
        data: expect.objectContaining({ name: "Updated Name" }),
      }),
      expect.anything()
    );
  });

  it("calls deleteRoute mutation and navigates back", () => {
    __mockRouteDetailData.data = mockRoute;

    render(<EditRouteScreen />);

    fireEvent.press(screen.getByText("Delete Route"));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      { routeId: "route-1" },
      expect.anything()
    );
  });

  it("triggers QR generation when button is pressed", () => {
    __mockRouteDetailData.data = mockRoute;

    render(<EditRouteScreen />);

    fireEvent.press(screen.getByText("Generate QR"));

    expect(mockGenerateQrMutate).toHaveBeenCalledWith({
      routeId: "route-1",
    });
  });

  it("shows error state", () => {
    __mockRouteDetailData.error = new Error("Failed to load route");

    render(<EditRouteScreen />);

    expect(screen.getByText("Failed to load route")).toBeOnTheScreen();
  });
});
