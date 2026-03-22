/**
 * Create Route Screen Tests
 *
 * Tests the form for creating a new climbing route. The admin fills in:
 * grade (required), name, color, wall section, and optionally assigns a setter.
 * On submit, useCreateRoute fires and the user navigates back to the list.
 *
 * Mock strategy (matching events/create.test.tsx):
 *   - useCreateRoute: capture mutation calls
 *   - useGymSetters: provide setter options
 *   - useAuth: provide adminGymId
 *   - expo-router: capture navigation (back after create)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock expo-router ──────────────────────────────────────────────────
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
}));

// ── Mock useAuth ──────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1" },
    adminGymId: "gym-1",
    role: "gym_admin",
  }),
}));

// ── Mock useAdminRoutes hooks ─────────────────────────────────────────
const mockCreateMutate = jest.fn();
jest.mock("@/hooks/useAdminRoutes", () => ({
  useCreateRoute: () => ({
    mutate: mockCreateMutate,
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

import CreateRouteScreen from "../create";

// ── Tests ─────────────────────────────────────────────────────────────

describe("CreateRouteScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders form fields for name, color, and wall section", () => {
    render(<CreateRouteScreen />);

    expect(screen.getByPlaceholderText("Route name")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("Hold color")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("Wall section")).toBeOnTheScreen();
  });

  it("calls createRoute mutation on submit with form data", () => {
    render(<CreateRouteScreen />);

    // Fill in the name
    fireEvent.changeText(
      screen.getByPlaceholderText("Route name"),
      "Crimpy Arete"
    );

    // Select a grade (tap V4 chip — canonical grade 10)
    fireEvent.press(screen.getByText("V4"));

    // Submit
    fireEvent.press(screen.getByText("Create Route"));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        gymId: "gym-1",
        name: "Crimpy Arete",
        canonicalGrade: 10,
      }),
      expect.anything()
    );
  });

  it("navigates back on successful creation", () => {
    // When the mutation succeeds, the onSuccess callback navigates back.
    mockCreateMutate.mockImplementation((_data: any, options: any) => {
      options?.onSuccess?.();
    });

    render(<CreateRouteScreen />);

    // Select a grade first (required)
    fireEvent.press(screen.getByText("V4"));

    fireEvent.press(screen.getByText("Create Route"));

    expect(mockBack).toHaveBeenCalled();
  });

  it("shows setter picker with available setters", () => {
    render(<CreateRouteScreen />);

    // Setter names should be visible as selectable options
    expect(screen.getByText("RouteSetterPro")).toBeOnTheScreen();
  });

  it("requires grade selection before submitting", () => {
    render(<CreateRouteScreen />);

    // Don't select a grade — submit should not call mutation
    fireEvent.changeText(
      screen.getByPlaceholderText("Route name"),
      "Some Route"
    );
    fireEvent.press(screen.getByText("Create Route"));

    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
});
