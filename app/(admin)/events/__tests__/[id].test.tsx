/**
 * Edit Event Screen Tests
 *
 * Tests the event detail/edit screen that shows event info, linked routes,
 * and categories. Admins can edit event fields, change status, manage
 * routes and categories, and delete the event.
 *
 * Mock strategy:
 *   - expo-router: provides eventId via useLocalSearchParams
 *   - useEvents hooks: control data + capture mutation calls
 *   - useAuth: provide stable admin user
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock expo-router ────────────────────────────────────────────────
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1", homeGymId: "gym-1" },
    role: "gym_admin",
  }),
}));

// ── Mock useEvents hooks ────────────────────────────────────────────
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockAddCategoryMutate = jest.fn();
const mockDeleteCategoryMutate = jest.fn();
const mockRemoveRouteMutate = jest.fn();

jest.mock("@/hooks/useEvents", () => {
  const mockEventData = {
    event: null as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  const mockRoutesData = {
    eventRoutes: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  const mockCategoriesData = {
    categories: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useEvent: () => mockEventData,
    useEventRoutes: () => mockRoutesData,
    useEventCategories: () => mockCategoriesData,
    useUpdateEvent: () => ({ mutate: mockUpdateMutate, isPending: false }),
    useDeleteEvent: () => ({ mutate: mockDeleteMutate, isPending: false }),
    useAddCategory: () => ({ mutate: mockAddCategoryMutate, isPending: false }),
    useDeleteCategory: () => ({
      mutate: mockDeleteCategoryMutate,
      isPending: false,
    }),
    useRemoveRouteFromEvent: () => ({
      mutate: mockRemoveRouteMutate,
      isPending: false,
    }),
    __mockEventData: mockEventData,
    __mockRoutesData: mockRoutesData,
    __mockCategoriesData: mockCategoriesData,
  };
});

// ── Mock useScores hooks (useEventScores is used for score count) ────
jest.mock("@/hooks/useScores", () => ({
  useEventScores: () => ({ scores: [], isLoading: false, error: null }),
}));

// ── Mock lucide-react-native ────────────────────────────────────────
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Trash2: (props: any) => <View testID="icon-trash" {...props} />,
    X: (props: any) => <View testID="icon-x" {...props} />,
    Plus: (props: any) => <View testID="icon-plus" {...props} />,
    Save: (props: any) => <View testID="icon-save" {...props} />,
  };
});

import EditEventScreen from "../[id]";

const { __mockEventData, __mockRoutesData, __mockCategoriesData } =
  jest.requireMock<{
    __mockEventData: { event: any | null; isLoading: boolean; error: Error | null };
    __mockRoutesData: { eventRoutes: any[]; isLoading: boolean; error: Error | null };
    __mockCategoriesData: { categories: any[]; isLoading: boolean; error: Error | null };
  }>("@/hooks/useEvents");

// ── Fixtures ────────────────────────────────────────────────────────

const mockEvent = {
  id: "event-1",
  gym_id: "gym-1",
  name: "Spring Comp",
  scoring_model: "tops_and_zones",
  start_date: "2026-03-01T09:00:00Z",
  end_date: "2026-03-01T18:00:00Z",
  status: "draft",
};

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockEventData.event = null;
  __mockEventData.isLoading = false;
  __mockEventData.error = null;
  __mockRoutesData.eventRoutes = [];
  __mockRoutesData.isLoading = false;
  __mockCategoriesData.categories = [];
  __mockCategoriesData.isLoading = false;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("EditEventScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    __mockEventData.isLoading = true;

    render(<EditEventScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("renders event details when loaded", () => {
    __mockEventData.event = mockEvent;

    render(<EditEventScreen />);

    // The event name should be displayed (either in an input or heading)
    expect(screen.getByDisplayValue("Spring Comp")).toBeOnTheScreen();
  });

  it("calls updateEvent mutation when save is pressed", () => {
    __mockEventData.event = mockEvent;

    render(<EditEventScreen />);

    // Change the name
    fireEvent.changeText(
      screen.getByDisplayValue("Spring Comp"),
      "Updated Comp"
    );

    // Press save
    fireEvent.press(screen.getByText("Save Changes"));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        data: expect.objectContaining({ name: "Updated Comp" }),
      }),
      expect.anything()
    );
  });

  it("calls deleteEvent mutation when delete is pressed", () => {
    __mockEventData.event = mockEvent;

    render(<EditEventScreen />);

    fireEvent.press(screen.getByText("Delete Event"));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      { eventId: "event-1" },
      expect.anything()
    );
  });

  it("renders linked routes", () => {
    __mockEventData.event = mockEvent;
    __mockRoutesData.eventRoutes = [
      {
        route_id: "r-1",
        sort_order: 0,
        route: { name: "Problem 1", canonical_grade: 10, color: "red" },
      },
    ];

    render(<EditEventScreen />);

    expect(screen.getByText("Problem 1")).toBeOnTheScreen();
  });

  it("renders categories", () => {
    __mockEventData.event = mockEvent;
    __mockCategoriesData.categories = [
      { id: "cat-1", name: "Men Open" },
    ];

    render(<EditEventScreen />);

    expect(screen.getByText("Men Open")).toBeOnTheScreen();
  });

  it("calls deleteCategory when category remove is pressed", () => {
    __mockEventData.event = mockEvent;
    __mockCategoriesData.categories = [
      { id: "cat-1", name: "Men Open" },
    ];

    render(<EditEventScreen />);

    // Press the delete button next to the category
    const deleteButtons = screen.getAllByTestId("delete-category-button");
    fireEvent.press(deleteButtons[0]);

    expect(mockDeleteCategoryMutate).toHaveBeenCalledWith({
      categoryId: "cat-1",
    });
  });

  it("shows status selector with current status", () => {
    __mockEventData.event = mockEvent;

    render(<EditEventScreen />);

    // The current status should be visible
    expect(screen.getByText("draft")).toBeOnTheScreen();
  });
});
