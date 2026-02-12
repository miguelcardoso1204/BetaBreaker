/**
 * Events Service Tests
 *
 * Tests the eventsService methods that manage competition/event CRUD —
 * the admin workflow for creating events, linking routes, and managing
 * competition categories.
 *
 * DATA MODEL (from migration 20260206060000_competitions.sql):
 *   events:           { id, gym_id, name, scoring_model, start_date, end_date, status, created_by }
 *   event_routes:     { event_id, route_id, sort_order } — composite PK
 *   event_categories: { id, event_id, name } — UNIQUE(event_id, name)
 *
 * KEY DESIGN DECISIONS:
 *   - createEvent does NOT use RETURNING — same RLS + INSERT RETURNING
 *     gotcha as other services. The admin's SELECT policy passes, but we
 *     keep it consistent with the pattern used elsewhere.
 *   - getEvent uses PostgREST resource embedding to fetch routes and
 *     categories in a single query (avoids N+1).
 *   - addRouteToEvent/removeRouteFromEvent use INSERT/DELETE (no UPDATE)
 *     because the event_routes RLS has no UPDATE policy.
 *
 * Mock strategy: same as moderation.service.test.ts — mock @/lib/supabase
 * inside the jest.mock() factory, then configure chain mocks per test.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { eventsService } from "../events.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("eventsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getEvents ──────────────────────────────────────────────────────

  describe("getEvents", () => {
    it("fetches events for a gym ordered by start_date desc", async () => {
      // Admin event list shows all events at their gym, newest first.
      const mockEvents = [
        { id: "event-1", name: "Spring Comp", status: "draft" },
      ];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValueOnce({ data: mockEvents, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await eventsService.getEvents("gym-1");

      expect(supabase.from).toHaveBeenCalledWith("events");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenCalledWith("gym_id", "gym-1");
      expect(chainMock.order).toHaveBeenCalledWith("start_date", {
        ascending: false,
      });
      expect(result.data).toEqual(mockEvents);
    });
  });

  // ── getEvent ───────────────────────────────────────────────────────

  describe("getEvent", () => {
    it("fetches a single event with embedded routes and categories", async () => {
      // The detail screen needs event info plus linked routes and
      // categories in one query. PostgREST resource embedding handles this.
      const mockEvent = {
        id: "event-1",
        name: "Spring Comp",
        event_routes: [{ route_id: "r-1", sort_order: 0 }],
        event_categories: [{ id: "cat-1", name: "Men Open" }],
      };
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValueOnce({ data: mockEvent, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await eventsService.getEvent("event-1");

      expect(supabase.from).toHaveBeenCalledWith("events");
      // The select string should embed event_routes with route details
      // and event_categories
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, event_routes(route_id, sort_order, route:routes(name, canonical_grade, color)), event_categories(id, name)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("id", "event-1");
      expect(chainMock.single).toHaveBeenCalled();
      expect(result.data).toEqual(mockEvent);
    });
  });

  // ── createEvent ────────────────────────────────────────────────────

  describe("createEvent", () => {
    it("inserts an event with all required fields", async () => {
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const eventData = {
        gym_id: "gym-1",
        name: "Spring Comp",
        scoring_model: "tops_and_zones" as const,
        start_date: "2026-03-01T09:00:00Z",
        end_date: "2026-03-01T18:00:00Z",
        created_by: "admin-1",
      };

      await eventsService.createEvent(eventData);

      expect(supabase.from).toHaveBeenCalledWith("events");
      expect(chainMock.insert).toHaveBeenCalledWith(eventData);
    });

    it("does not use RETURNING (no .select() chain)", async () => {
      // Per the RLS + INSERT RETURNING lesson: avoid chaining .select()
      // after .insert() on tables where SELECT policy might differ.
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await eventsService.createEvent({
        gym_id: "gym-1",
        name: "Test",
        scoring_model: "points" as const,
        start_date: "2026-03-01T09:00:00Z",
        end_date: "2026-03-01T18:00:00Z",
        created_by: "admin-1",
      });

      expect(chainMock.insert).toHaveBeenCalledTimes(1);
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });
  });

  // ── updateEvent ────────────────────────────────────────────────────

  describe("updateEvent", () => {
    it("updates an event by id", async () => {
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        update: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await eventsService.updateEvent("event-1", {
        name: "Updated Name",
        status: "ongoing",
      });

      expect(supabase.from).toHaveBeenCalledWith("events");
      expect(chainMock.update).toHaveBeenCalledWith({
        name: "Updated Name",
        status: "ongoing",
      });
      expect(eqMock).toHaveBeenCalledWith("id", "event-1");
    });
  });

  // ── deleteEvent ────────────────────────────────────────────────────

  describe("deleteEvent", () => {
    it("deletes an event by id", async () => {
      // CASCADE handles cleaning up event_routes, event_categories,
      // and competition_scores automatically.
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await eventsService.deleteEvent("event-1");

      expect(supabase.from).toHaveBeenCalledWith("events");
      expect(chainMock.delete).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "event-1");
    });
  });

  // ── getEventRoutes ─────────────────────────────────────────────────

  describe("getEventRoutes", () => {
    it("fetches routes for an event with embedded route data", async () => {
      const mockRoutes = [
        {
          route_id: "r-1",
          sort_order: 0,
          route: { name: "Problem 1", canonical_grade: 10, color: "red" },
        },
      ];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValueOnce({ data: mockRoutes, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await eventsService.getEventRoutes("event-1");

      expect(supabase.from).toHaveBeenCalledWith("event_routes");
      expect(chainMock.select).toHaveBeenCalledWith(
        "route_id, sort_order, route:routes(name, canonical_grade, color)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("event_id", "event-1");
      expect(chainMock.order).toHaveBeenCalledWith("sort_order", {
        ascending: true,
      });
      expect(result.data).toEqual(mockRoutes);
    });
  });

  // ── addRouteToEvent ────────────────────────────────────────────────

  describe("addRouteToEvent", () => {
    it("inserts a route-event link with sort order", async () => {
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await eventsService.addRouteToEvent("event-1", "route-1", 3);

      expect(supabase.from).toHaveBeenCalledWith("event_routes");
      expect(chainMock.insert).toHaveBeenCalledWith({
        event_id: "event-1",
        route_id: "route-1",
        sort_order: 3,
      });
    });
  });

  // ── removeRouteFromEvent ───────────────────────────────────────────

  describe("removeRouteFromEvent", () => {
    it("deletes a route-event link by composite key", async () => {
      // event_routes has a composite PK (event_id, route_id), so we
      // need to filter on both columns to target the correct row.
      const eqRoute = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const eqEvent = jest.fn().mockReturnValueOnce({ eq: eqRoute });
      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: eqEvent }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await eventsService.removeRouteFromEvent("event-1", "route-1");

      expect(supabase.from).toHaveBeenCalledWith("event_routes");
      expect(chainMock.delete).toHaveBeenCalled();
      expect(eqEvent).toHaveBeenCalledWith("event_id", "event-1");
      expect(eqRoute).toHaveBeenCalledWith("route_id", "route-1");
    });
  });

  // ── getEventCategories ─────────────────────────────────────────────

  describe("getEventCategories", () => {
    it("fetches categories for an event", async () => {
      const mockCategories = [{ id: "cat-1", name: "Men Open" }];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockResolvedValueOnce({ data: mockCategories, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await eventsService.getEventCategories("event-1");

      expect(supabase.from).toHaveBeenCalledWith("event_categories");
      expect(chainMock.select).toHaveBeenCalledWith("id, name");
      expect(chainMock.eq).toHaveBeenCalledWith("event_id", "event-1");
      expect(result.data).toEqual(mockCategories);
    });
  });

  // ── addCategory ────────────────────────────────────────────────────

  describe("addCategory", () => {
    it("inserts a new category for an event", async () => {
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await eventsService.addCategory("event-1", "Women Open");

      expect(supabase.from).toHaveBeenCalledWith("event_categories");
      expect(chainMock.insert).toHaveBeenCalledWith({
        event_id: "event-1",
        name: "Women Open",
      });
    });
  });

  // ── deleteCategory ─────────────────────────────────────────────────

  describe("deleteCategory", () => {
    it("deletes a category by id", async () => {
      const eqMock = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: eqMock }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await eventsService.deleteCategory("cat-1");

      expect(supabase.from).toHaveBeenCalledWith("event_categories");
      expect(chainMock.delete).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "cat-1");
    });
  });
});
