/**
 * Route Service — Thin Wrapper Around Supabase Route Queries
 *
 * This service builds PostgREST query chains for fetching climbing routes.
 * Routes are the core browsable entity in Beta Breaker — every gym has a set
 * of routes that climbers filter by grade, status, and name, then tap into
 * for detailed views, ascent logging, and beta sharing.
 *
 * Why is this a thin wrapper instead of putting logic here?
 * - The service layer's ONLY job is translating function calls into Supabase
 *   query chains. No business logic, no validation, no state management.
 * - Authorization is handled by Postgres RLS policies — the service doesn't
 *   need to check permissions because the database enforces them.
 * - Business logic (grade conversion, scoring) lives in utils/.
 * - Caching and mutation state live in TanStack Query hooks (Step 4.2).
 *
 * Each method returns a Supabase "thenable" — an object that acts like a
 * Promise (has .then()) but doesn't fire the HTTP request until awaited.
 * This lets callers chain additional PostgREST filters if needed.
 */

import { supabase } from "@/lib/supabase";
import type { RouteStatus } from "@/lib/constants";
import type { CandidateRoute } from "@/utils/suggestions";

/**
 * Data needed to create a new route. gym_id and canonical_grade are required;
 * everything else is optional because not every gym tracks all fields.
 */
export interface CreateRouteData {
  gym_id: string;
  name?: string;
  canonical_grade: number;
  color?: string;
  wall_section?: string;
  setter_id?: string;
}

/**
 * Partial update shape for editing a route. All fields optional — the service
 * sends only the changed fields, and Supabase's .update() ignores undefined keys.
 * Includes status and retired_at for lifecycle transitions.
 */
export interface UpdateRouteData {
  name?: string;
  canonical_grade?: number;
  color?: string;
  wall_section?: string;
  setter_id?: string | null;
  status?: RouteStatus;
  retired_at?: string | null;
}

/**
 * Shape returned by getGymSetters — a user with a setter-capable role
 * plus their profile display name for the setter assignment dropdown.
 */
export interface GymSetter {
  user_id: string;
  role: string;
  profile: { id: string; display_name: string | null };
}

/**
 * Filters that control which routes are returned and how they're sorted.
 *
 * All fields except gymId are optional — sensible defaults are applied in
 * the service method (e.g., default status filters to active routes only).
 *
 * Why an interface instead of inline params?
 * - Makes the hook layer cleaner: `useRoutes(filters)` instead of many args
 * - Easy to extend later (e.g., add `wallSection`, `holdColor`, `setterId`)
 * - Can be exported for use in filter UI components and Zustand store typing
 */
export interface RouteFilters {
  /** Only required field — routes always belong to exactly one gym. */
  gymId: string;
  /** Minimum canonical grade (inclusive). 0–30 scale; undefined = no lower bound. */
  gradeMin?: number;
  /** Maximum canonical grade (inclusive). 0–30 scale; undefined = no upper bound. */
  gradeMax?: number;
  /** Which lifecycle statuses to include. Defaults to ["active", "retiring_soon"]. */
  status?: RouteStatus[];
  /** Sort order: "newest" (default) sorts by creation date, "grade" by difficulty. */
  sortBy?: "newest" | "grade";
  /** Case-insensitive substring search on route name. */
  search?: string;
}

export const routeService = {
  /**
   * Fetch a filtered, sorted list of routes for a specific gym.
   *
   * Builds a PostgREST query chain that translates roughly to:
   *   SELECT * FROM routes
   *   WHERE gym_id = $gymId
   *     AND status IN ('active', 'retiring_soon')  -- or custom statuses
   *     AND canonical_grade >= $gradeMin            -- if provided
   *     AND canonical_grade <= $gradeMax            -- if provided
   *     AND name ILIKE '%search%'                   -- if provided
   *   ORDER BY created_at DESC                      -- or canonical_grade ASC
   *
   * @param filters - Filter options including gymId (required) and optional grade, status, search, sort
   */
  getRoutes(filters: RouteFilters) {
    // Start the query chain: target the "routes" table and select all columns.
    // `supabase.from("routes")` creates a PostgREST query builder instance.
    // `.select("*")` tells PostgREST to return every column from the routes table.
    let query = supabase.from("routes").select("*").eq("gym_id", filters.gymId);

    // Status filter: defaults to only showing routes that climbers can actually
    // attempt. "archived" routes are hidden by default because they've been
    // taken off the wall — climbers shouldn't see them unless they explicitly
    // ask (e.g., gym admins reviewing old routes).
    // `.in()` generates SQL: WHERE status IN ('active', 'retiring_soon')
    query = query.in("status", filters.status ?? ["active", "retiring_soon"]);

    // Grade range filters: only applied when the caller provides bounds.
    // This conditional chaining pattern is idiomatic for Supabase — you build
    // up the query incrementally based on which filters are present.
    // `.gte()` = "greater than or equal" → SQL: WHERE canonical_grade >= value
    if (filters.gradeMin !== undefined) {
      query = query.gte("canonical_grade", filters.gradeMin);
    }
    // `.lte()` = "less than or equal" → SQL: WHERE canonical_grade <= value
    if (filters.gradeMax !== undefined) {
      query = query.lte("canonical_grade", filters.gradeMax);
    }

    // Text search: case-insensitive pattern match on the route name.
    // `.ilike()` maps to PostgreSQL's ILIKE operator — the `%` wildcards
    // on both sides mean "match anywhere in the string" (not just prefix).
    // Example: search="crimp" → WHERE name ILIKE '%crimp%'
    if (filters.search) {
      query = query.ilike("name", `%${filters.search}%`);
    }

    // Sorting: the `.order()` call is the terminal method in this chain —
    // it returns a thenable that fires the HTTP request when awaited.
    // "newest" (default): newest routes first so fresh sets are prominent.
    // "grade": ascending difficulty so climbers can scan from easy to hard.
    if (filters.sortBy === "grade") {
      return query.order("canonical_grade", { ascending: true });
    }
    // Default sort: newest first (descending created_at)
    return query.order("created_at", { ascending: false });
  },

  /**
   * Fetch candidate routes for the suggestion engine.
   *
   * Queries routes in a specific gym within a canonical grade range,
   * including their crowd-sourced style tags via nested resource embedding.
   * Only active and retiring_soon routes are included — archived routes
   * have been taken off the wall and shouldn't be suggested.
   *
   * The nested PostgREST embedding:
   *   "route_style_tags(tag:style_tags(name))"
   * performs a server-side double JOIN:
   *   routes → route_style_tags → style_tags
   * returning the tag names nested under each route.
   *
   * The service flattens this nested structure into a simple `tags: string[]`
   * array so the scoring algorithm doesn't need to know about the DB schema.
   *
   * @param gymId - The gym to fetch routes from
   * @param gradeMin - Minimum canonical grade (inclusive, clamped to 0)
   * @param gradeMax - Maximum canonical grade (inclusive, clamped to 30)
   * @returns Array of candidate routes with flattened style tag names
   */
  async getCandidateRoutes(
    gymId: string,
    gradeMin: number,
    gradeMax: number
  ): Promise<CandidateRoute[]> {
    // Clamp grade bounds to the valid canonical range (0–30).
    // Without clamping, a negative gradeMin or gradeMax > 30 would silently
    // return no results because no route has a grade outside this range.
    const clampedMin = Math.max(0, gradeMin);
    const clampedMax = Math.min(30, gradeMax);

    const { data, error } = await supabase
      .from("routes")
      .select(
        "id, name, canonical_grade, color, status, route_style_tags(tag:style_tags(name))"
      )
      .eq("gym_id", gymId)
      .gte("canonical_grade", clampedMin)
      .lte("canonical_grade", clampedMax)
      .in("status", ["active", "retiring_soon"]);

    if (error) throw error;

    // Flatten the nested tag structure into simple string arrays.
    // PostgREST returns: { route_style_tags: [{ tag: { name: "slab" } }, ...] }
    // We want: { tags: ["slab", ...] }
    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      canonical_grade: row.canonical_grade,
      color: row.color,
      status: row.status,
      tags: (row.route_style_tags ?? [])
        .map((rst: any) => rst.tag?.name)
        .filter((name: string | undefined): name is string => !!name),
    }));
  },

  /**
   * Fetch a single route by ID, including the setter's profile info.
   *
   * Uses Supabase's "resource embedding" — a PostgREST feature that performs
   * a server-side JOIN without writing raw SQL. The select string syntax:
   *
   *   "*, setter:profiles!setter_id(display_name, avatar_url)"
   *
   * Breaks down as:
   *   `*`                    — all columns from the routes table
   *   `setter:`              — alias the joined data as "setter" in the response JSON
   *   `profiles!setter_id`   — JOIN the profiles table using the setter_id FK
   *                            (the `!setter_id` disambiguates because routes might
   *                            have multiple FKs pointing to profiles)
   *   `(display_name, avatar_url)` — only fetch these two profile columns
   *
   * The result shape is: { ...routeFields, setter: { display_name, avatar_url } }
   *
   * `.single()` enforces exactly-one-row semantics — if the route ID doesn't
   * exist, Supabase returns an error with code 'PGRST116' instead of an
   * empty array. This is safer than checking `data.length === 0` manually.
   *
   * @param routeId - The UUID of the route to fetch
   */
  getRouteById(routeId: string) {
    return supabase
      .from("routes")
      .select("*, setter:profiles!setter_id(display_name, avatar_url)")
      .eq("id", routeId)
      .single();
  },

  /**
   * Create a new route.
   *
   * Inserts into the routes table. Does NOT chain .select() — same
   * INSERT-without-RETURNING pattern as eventsService to avoid the
   * RLS + INSERT RETURNING gotcha.
   *
   * @param data - Route fields: gym_id + canonical_grade required, rest optional
   */
  createRoute(data: CreateRouteData) {
    return supabase.from("routes").insert(data);
  },

  /**
   * Update an existing route.
   *
   * Supports partial updates — only provided fields are changed.
   * Used for editing route info (name, grade, color, wall section, setter)
   * and advancing lifecycle status (active → retiring_soon → archived).
   *
   * @param routeId - UUID of the route to update
   * @param data - Partial fields to change
   */
  updateRoute(routeId: string, data: UpdateRouteData) {
    return supabase.from("routes").update(data).eq("id", routeId);
  },

  /**
   * Delete a route.
   *
   * RLS restricts this to gym_admin+ roles. Related data (ascents, etc.)
   * may CASCADE depending on migration policies.
   *
   * @param routeId - UUID of the route to delete
   */
  deleteRoute(routeId: string) {
    return supabase.from("routes").delete().eq("id", routeId);
  },

  /**
   * Fetch users who can be assigned as route setters at a gym.
   *
   * Queries user_gym_roles for users with setter, gym_admin, or super_admin
   * roles, and joins the profiles table to get display names for the
   * setter assignment dropdown in the admin route form.
   *
   * @param gymId - The gym to fetch setters for
   */
  getGymSetters(gymId: string) {
    return supabase
      .from("user_gym_roles")
      .select("user_id, role, profile:profiles(id, display_name)")
      .eq("gym_id", gymId)
      .in("role", ["setter", "gym_admin", "super_admin"]);
  },

  /**
   * Generate a signed QR token for a route via the sign-qr Edge Function.
   *
   * The Edge Function creates a signed JWT containing the route ID. This
   * token can be encoded into a QR code and displayed at the physical
   * wall, allowing climbers to scan and quickly navigate to the route.
   *
   * @param routeId - UUID of the route to generate a QR token for
   */
  generateQrToken(routeId: string) {
    return supabase.functions.invoke("sign-qr", {
      body: { route_id: routeId },
    });
  },
};
