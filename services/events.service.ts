/**
 * Events Service — Thin Wrapper for Competition/Event CRUD
 *
 * This service manages three tables that power the competition system:
 *   - events:           Competition definitions (name, dates, scoring model, status)
 *   - event_routes:     Junction table linking routes to events (with sort order)
 *   - event_categories: Competition brackets (e.g., "Men Open", "Women U18")
 *
 * ADMIN WORKFLOW:
 *   1. Admin creates an event (draft status) → sets name, dates, scoring model
 *   2. Admin links routes to the event → these are the competition problems
 *   3. Admin adds categories → brackets for fair grouping (age, gender, etc.)
 *   4. Admin changes status → draft → registration_open → ongoing → completed
 *
 * RLS POLICIES (from 20260206060000_competitions.sql):
 *   - SELECT: any authenticated user (athletes browse events and leaderboards)
 *   - INSERT/UPDATE/DELETE: gym_admin+ only (role check via get_user_role)
 *   - event_routes has no UPDATE policy — to change sort_order, delete + re-insert
 *
 * IMPORTANT: createEvent and addRouteToEvent/addCategory do NOT use RETURNING
 * (.select().single()) to avoid the RLS + INSERT RETURNING gotcha. The admin's
 * SELECT policy would pass, but we keep the pattern consistent across services.
 */

import { supabase } from "@/lib/supabase";

/** Scoring models supported by the events table CHECK constraint. */
export type ScoringModel =
  | "tops_and_zones"
  | "points"
  | "thousand_divide_by"
  | "redpoint";

/** Event statuses from the events table CHECK constraint. */
export type EventStatus =
  | "draft"
  | "registration_open"
  | "ongoing"
  | "completed"
  | "cancelled";

/** Shape for creating a new event. Matches events.Insert minus auto-fields. */
export interface CreateEventData {
  gym_id: string;
  name: string;
  scoring_model: ScoringModel;
  start_date: string;
  end_date: string;
  created_by: string;
}

/** Shape for updating an existing event. All fields optional. */
export interface UpdateEventData {
  name?: string;
  scoring_model?: ScoringModel;
  start_date?: string;
  end_date?: string;
  status?: EventStatus;
}

export const eventsService = {
  /**
   * Fetch all events for a gym, newest first.
   *
   * The admin event list shows all events at their home gym regardless of
   * status (draft, ongoing, completed, etc.). Ordered by start_date DESC
   * so upcoming/recent events appear first.
   */
  getEvents(gymId: string) {
    return supabase
      .from("events")
      .select("*")
      .eq("gym_id", gymId)
      .order("start_date", { ascending: false });
  },

  /**
   * Fetch a single event with embedded routes and categories.
   *
   * Uses PostgREST resource embedding to fetch everything the detail/edit
   * screen needs in one query:
   *   - event_routes → includes sort_order + route details (name, grade, color)
   *   - event_categories → id + name for the category list
   *
   * The route embedding uses the FK relationship: event_routes.route_id → routes.id
   * PostgREST resolves the `route:routes(...)` syntax to a LEFT JOIN.
   */
  getEvent(eventId: string) {
    return supabase
      .from("events")
      .select(
        "*, event_routes(route_id, sort_order, route:routes(name, canonical_grade, color)), event_categories(id, name)"
      )
      .eq("id", eventId)
      .single();
  },

  /**
   * Create a new event.
   *
   * Inserts into the events table with status defaulting to 'draft' (set by DB).
   * Does NOT chain .select() — see RLS + INSERT RETURNING lesson in MEMORY.md.
   */
  createEvent(data: CreateEventData) {
    return supabase.from("events").insert(data);
  },

  /**
   * Update an existing event.
   *
   * Supports partial updates — only the provided fields are changed.
   * Used for editing event info (name, dates, scoring model) and
   * advancing the status (draft → registration_open → ongoing → completed).
   */
  updateEvent(eventId: string, data: UpdateEventData) {
    return supabase.from("events").update(data).eq("id", eventId);
  },

  /**
   * Delete an event.
   *
   * CASCADE on the events table automatically cleans up:
   *   - event_routes (all route links)
   *   - event_categories (all brackets)
   *   - competition_scores (all athlete scores)
   * This is a significant action — the admin screen should confirm first.
   */
  deleteEvent(eventId: string) {
    return supabase.from("events").delete().eq("id", eventId);
  },

  // ── Event Routes (junction table) ──────────────────────────────────

  /**
   * Fetch routes linked to an event, ordered by sort_order.
   *
   * Embeds the route table to get display info (name, grade, color)
   * without a separate query. Used by the event detail screen to show
   * which problems are in the competition.
   */
  getEventRoutes(eventId: string) {
    return supabase
      .from("event_routes")
      .select(
        "route_id, sort_order, route:routes(name, canonical_grade, color)"
      )
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true });
  },

  /**
   * Link a route to an event.
   *
   * Adds a row to the junction table. sort_order controls display
   * position — routes are typically ordered easiest to hardest.
   * No RETURNING for consistency with INSERT pattern.
   */
  addRouteToEvent(eventId: string, routeId: string, sortOrder: number) {
    return supabase.from("event_routes").insert({
      event_id: eventId,
      route_id: routeId,
      sort_order: sortOrder,
    });
  },

  /**
   * Unlink a route from an event.
   *
   * Deletes by composite PK (event_id + route_id). Any competition_scores
   * for this route remain — they reference the route directly, not through
   * event_routes.
   */
  removeRouteFromEvent(eventId: string, routeId: string) {
    return supabase
      .from("event_routes")
      .delete()
      .eq("event_id", eventId)
      .eq("route_id", routeId);
  },

  // ── Event Categories ───────────────────────────────────────────────

  /**
   * Fetch categories for an event.
   *
   * Returns id + name for each bracket. The event detail screen shows
   * these in a list with delete buttons.
   */
  getEventCategories(eventId: string) {
    return supabase
      .from("event_categories")
      .select("id, name")
      .eq("event_id", eventId);
  },

  /**
   * Add a category to an event.
   *
   * Categories represent competition brackets (e.g., "Men Open", "Women U18").
   * The UNIQUE(event_id, name) constraint prevents duplicates — the DB will
   * return an error if the same category name is added twice to one event.
   */
  addCategory(eventId: string, name: string) {
    return supabase.from("event_categories").insert({
      event_id: eventId,
      name,
    });
  },

  /**
   * Delete a category.
   *
   * Competition scores referencing this category will have category_id
   * set to NULL (ON DELETE SET NULL) — the scores are preserved but
   * lose their bracket assignment.
   */
  deleteCategory(categoryId: string) {
    return supabase.from("event_categories").delete().eq("id", categoryId);
  },
};
