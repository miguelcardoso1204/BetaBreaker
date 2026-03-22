/**
 * useEvents Hook Tests — TanStack Query Wrappers for Event CRUD
 *
 * These hooks wrap eventsService with TanStack Query to provide:
 *   - useEvents(gymId) — query for the admin event list
 *   - useEvent(eventId) — query for a single event with routes/categories
 *   - useCreateEvent() — mutation to create a new event
 *   - useUpdateEvent() — mutation to edit event info or change status
 *   - useDeleteEvent() — mutation to remove an event
 *   - useEventRoutes(eventId) — query for routes linked to an event
 *   - useAddRouteToEvent() — mutation to link a route
 *   - useRemoveRouteFromEvent() — mutation to unlink a route
 *   - useEventCategories(eventId) — query for competition brackets
 *   - useAddCategory() — mutation to add a bracket
 *   - useDeleteCategory() — mutation to remove a bracket
 *
 * Mock strategy (matching useModeration.test.tsx):
 *   - Mock eventsService (not Supabase) — hooks don't know about PostgREST
 *   - Mock useAuth to provide a stable user ID + adminGymId
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock eventsService ──────────────────────────────────────────────
jest.mock("@/services/events.service", () => ({
  eventsService: {
    getEvents: jest.fn(),
    getEvent: jest.fn(),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    getEventRoutes: jest.fn(),
    addRouteToEvent: jest.fn(),
    removeRouteFromEvent: jest.fn(),
    getEventCategories: jest.fn(),
    addCategory: jest.fn(),
    deleteCategory: jest.fn(),
  },
}));

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1" },
    adminGymId: "gym-1",
    session: { user: { id: "admin-1" } },
    isAuthenticated: true,
    role: "gym_admin",
  }),
}));

import {
  useEvents,
  useEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useEventRoutes,
  useAddRouteToEvent,
  useRemoveRouteFromEvent,
  useEventCategories,
  useAddCategory,
  useDeleteCategory,
} from "../useEvents";

const { eventsService } = jest.requireMock<{
  eventsService: {
    getEvents: jest.Mock;
    getEvent: jest.Mock;
    createEvent: jest.Mock;
    updateEvent: jest.Mock;
    deleteEvent: jest.Mock;
    getEventRoutes: jest.Mock;
    addRouteToEvent: jest.Mock;
    removeRouteFromEvent: jest.Mock;
    getEventCategories: jest.Mock;
    addCategory: jest.Mock;
    deleteCategory: jest.Mock;
  };
}>("@/services/events.service");

// ── Test wrapper ────────────────────────────────────────────────────
// Fresh QueryClient per test prevents cache leakage.

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// ── useEvents tests ─────────────────────────────────────────────────

describe("useEvents", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches events for a gym and returns them", async () => {
    const mockEvents = [
      { id: "event-1", name: "Spring Comp", status: "draft" },
    ];
    eventsService.getEvents.mockResolvedValueOnce({
      data: mockEvents,
      error: null,
    });

    const { result } = renderHook(() => useEvents("gym-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.events).toEqual(mockEvents);
    expect(eventsService.getEvents).toHaveBeenCalledWith("gym-1");
  });
});

// ── useEvent tests ──────────────────────────────────────────────────

describe("useEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches a single event with routes and categories", async () => {
    const mockEvent = {
      id: "event-1",
      name: "Spring Comp",
      event_routes: [],
      event_categories: [],
    };
    eventsService.getEvent.mockResolvedValueOnce({
      data: mockEvent,
      error: null,
    });

    const { result } = renderHook(() => useEvent("event-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.event).toEqual(mockEvent);
    expect(eventsService.getEvent).toHaveBeenCalledWith("event-1");
  });
});

// ── useCreateEvent tests ────────────────────────────────────────────

describe("useCreateEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with event data and userId as created_by", async () => {
    eventsService.createEvent.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useCreateEvent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        gymId: "gym-1",
        name: "Spring Comp",
        scoringModel: "tops_and_zones",
        startDate: "2026-03-01T09:00:00Z",
        endDate: "2026-03-01T18:00:00Z",
      });
    });

    expect(eventsService.createEvent).toHaveBeenCalledWith({
      gym_id: "gym-1",
      name: "Spring Comp",
      scoring_model: "tops_and_zones",
      start_date: "2026-03-01T09:00:00Z",
      end_date: "2026-03-01T18:00:00Z",
      created_by: "admin-1", // from useAuth mock
    });
  });
});

// ── useUpdateEvent tests ────────────────────────────────────────────

describe("useUpdateEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with eventId and update data", async () => {
    eventsService.updateEvent.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useUpdateEvent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        eventId: "event-1",
        data: { name: "Updated", status: "ongoing" },
      });
    });

    expect(eventsService.updateEvent).toHaveBeenCalledWith("event-1", {
      name: "Updated",
      status: "ongoing",
    });
  });
});

// ── useDeleteEvent tests ────────────────────────────────────────────

describe("useDeleteEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with eventId", async () => {
    eventsService.deleteEvent.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteEvent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ eventId: "event-1" });
    });

    expect(eventsService.deleteEvent).toHaveBeenCalledWith("event-1");
  });
});

// ── useEventRoutes tests ────────────────────────────────────────────

describe("useEventRoutes", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches routes for an event", async () => {
    const mockRoutes = [
      { route_id: "r-1", sort_order: 0, route: { name: "P1" } },
    ];
    eventsService.getEventRoutes.mockResolvedValueOnce({
      data: mockRoutes,
      error: null,
    });

    const { result } = renderHook(() => useEventRoutes("event-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.eventRoutes).toEqual(mockRoutes);
    expect(eventsService.getEventRoutes).toHaveBeenCalledWith("event-1");
  });
});

// ── useAddRouteToEvent tests ────────────────────────────────────────

describe("useAddRouteToEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with eventId, routeId, sortOrder", async () => {
    eventsService.addRouteToEvent.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useAddRouteToEvent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        eventId: "event-1",
        routeId: "route-1",
        sortOrder: 5,
      });
    });

    expect(eventsService.addRouteToEvent).toHaveBeenCalledWith(
      "event-1",
      "route-1",
      5
    );
  });
});

// ── useRemoveRouteFromEvent tests ───────────────────────────────────

describe("useRemoveRouteFromEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with eventId and routeId", async () => {
    eventsService.removeRouteFromEvent.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useRemoveRouteFromEvent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        eventId: "event-1",
        routeId: "route-1",
      });
    });

    expect(eventsService.removeRouteFromEvent).toHaveBeenCalledWith(
      "event-1",
      "route-1"
    );
  });
});

// ── useEventCategories tests ────────────────────────────────────────

describe("useEventCategories", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches categories for an event", async () => {
    const mockCategories = [{ id: "cat-1", name: "Men Open" }];
    eventsService.getEventCategories.mockResolvedValueOnce({
      data: mockCategories,
      error: null,
    });

    const { result } = renderHook(() => useEventCategories("event-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.categories).toEqual(mockCategories);
    expect(eventsService.getEventCategories).toHaveBeenCalledWith("event-1");
  });
});

// ── useAddCategory tests ────────────────────────────────────────────

describe("useAddCategory", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with eventId and category name", async () => {
    eventsService.addCategory.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useAddCategory(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        eventId: "event-1",
        name: "Women Open",
      });
    });

    expect(eventsService.addCategory).toHaveBeenCalledWith(
      "event-1",
      "Women Open"
    );
  });
});

// ── useDeleteCategory tests ─────────────────────────────────────────

describe("useDeleteCategory", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls service with categoryId", async () => {
    eventsService.deleteCategory.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteCategory(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-1" });
    });

    expect(eventsService.deleteCategory).toHaveBeenCalledWith("cat-1");
  });

  it("invalidates categories query on success", async () => {
    // After deleting a category, the categories list should refetch
    // so the deleted category disappears from the UI.
    eventsService.deleteCategory.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    eventsService.getEventCategories.mockResolvedValue({
      data: [],
      error: null,
    });

    const { result } = renderHook(
      () => {
        const categories = useEventCategories("event-1");
        const deleteCategory = useDeleteCategory();
        return { categories, deleteCategory };
      },
      { wrapper: createWrapper() }
    );

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.categories.isLoading).toBe(false);
    });

    // Clear to track only the refetch call
    eventsService.getEventCategories.mockClear();

    await act(async () => {
      result.current.deleteCategory.mutate({ categoryId: "cat-1" });
    });

    // After mutation settles, getEventCategories should be called again
    await waitFor(() => {
      expect(eventsService.getEventCategories).toHaveBeenCalled();
    });
  });
});
