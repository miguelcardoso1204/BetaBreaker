/**
 * Create Event Screen Tests
 *
 * Tests the form for creating a new competition event. The admin fills in:
 * name, scoring model, start date, end date. On submit, useCreateEvent
 * fires and the user navigates back to the list.
 *
 * Mock strategy:
 *   - useCreateEvent: capture mutation calls
 *   - useAuth: provide homeGymId
 *   - expo-router: capture navigation (back after create)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock expo-router ────────────────────────────────────────────────
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
}));

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1", homeGymId: "gym-1" },
    role: "gym_admin",
  }),
}));

// ── Mock useEvents ──────────────────────────────────────────────────
const mockCreateMutate = jest.fn();
jest.mock("@/hooks/useEvents", () => ({
  useCreateEvent: () => ({
    mutate: mockCreateMutate,
    isPending: false,
  }),
}));

// ── Mock lucide-react-native ────────────────────────────────────────
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ChevronDown: (props: any) => <View testID="icon-chevron" {...props} />,
  };
});

import CreateEventScreen from "../create";

// ── Tests ───────────────────────────────────────────────────────────

describe("CreateEventScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the form with name input and submit button", () => {
    render(<CreateEventScreen />);

    expect(screen.getByPlaceholderText("Event name")).toBeOnTheScreen();
    expect(screen.getByText("Create Event")).toBeOnTheScreen();
  });

  it("shows scoring model options", () => {
    // The form should display the 4 scoring models so the admin can choose.
    render(<CreateEventScreen />);

    expect(screen.getByText("Tops & Zones")).toBeOnTheScreen();
    expect(screen.getByText("Points")).toBeOnTheScreen();
  });

  it("calls createEvent mutation on submit with form data", () => {
    render(<CreateEventScreen />);

    // Fill in the name
    fireEvent.changeText(
      screen.getByPlaceholderText("Event name"),
      "Summer Comp"
    );

    // Submit the form
    fireEvent.press(screen.getByText("Create Event"));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        gymId: "gym-1",
        name: "Summer Comp",
      }),
      expect.anything()
    );
  });

  it("disables submit when name is empty", () => {
    render(<CreateEventScreen />);

    // Don't fill in name — submit should not call mutation
    fireEvent.press(screen.getByText("Create Event"));

    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it("navigates back after successful creation", () => {
    // When the mutation succeeds, the onSuccess callback should navigate back.
    mockCreateMutate.mockImplementation((_data: any, options: any) => {
      options?.onSuccess?.();
    });

    render(<CreateEventScreen />);

    fireEvent.changeText(
      screen.getByPlaceholderText("Event name"),
      "Fall Comp"
    );
    fireEvent.press(screen.getByText("Create Event"));

    expect(mockBack).toHaveBeenCalled();
  });

  it("shows start and end date fields", () => {
    render(<CreateEventScreen />);

    expect(screen.getByText("Start Date")).toBeOnTheScreen();
    expect(screen.getByText("End Date")).toBeOnTheScreen();
  });
});
