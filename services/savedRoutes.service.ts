/**
 * Saved Routes Service — Thin Wrapper for Route Bookmarking
 *
 * This service manages the saved_routes table, which stores user bookmarks
 * on climbing routes. A "saved route" can be a favorite (star toggle),
 * a project (want to work on), or a wishlist item (want to try someday).
 *
 * Why three save types instead of just "favorite"?
 * Climbers think about routes differently:
 *   - "favorite" = loved this route, want to track it
 *   - "project"  = actively working on sending this route
 *   - "wishlist" = looks cool, want to try it later
 * The save_type column lets us support all three with one table.
 * For now, only "favorite" is exposed in the UI (star toggle on Route
 * Detail screen). Project and wishlist will be added in Phase 16.
 *
 * Database constraint: (user_id, route_id, save_type) is UNIQUE, so a
 * user can't accidentally favorite the same route twice. The RLS policy
 * ensures users can only read/write their own saved routes.
 *
 * Manual type: The saved_routes table exists in migrations, but
 * database.types.ts hasn't been regenerated yet. We define the row type
 * manually here. When `supabase gen types` is next run, this can be
 * replaced with the auto-generated type.
 */

import { supabase } from "@/lib/supabase";

// Cast supabase.from() calls to `any` for the saved_routes table because
// database.types.ts hasn't been regenerated to include this table yet.
// The table exists in migrations — once `supabase gen types typescript --local`
// is run, these casts can be removed and the auto-generated types used instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromSavedRoutes = () => (supabase as any).from("saved_routes");

// ── Types ────────────────────────────────────────────────────────────

/**
 * Manually defined row type for the saved_routes table.
 *
 * This mirrors the schema defined in the SQL migration:
 *   - id: UUID primary key (auto-generated)
 *   - user_id: FK to auth.users — who saved the route
 *   - route_id: FK to routes — which route was saved
 *   - save_type: one of "project", "wishlist", "favorite"
 *   - created_at: timestamp with timezone (auto-generated)
 *
 * Once `supabase gen types typescript --local` is re-run, this interface
 * can be replaced with the auto-generated Database type.
 */
export interface SavedRoute {
  id: string;
  user_id: string;
  route_id: string;
  save_type: "project" | "wishlist" | "favorite";
  created_at: string;
}

/** The three types of route bookmarks supported by the app. */
export type SaveType = SavedRoute["save_type"];

// ── Service ──────────────────────────────────────────────────────────

export const savedRoutesService = {
  /**
   * Check if a specific bookmark exists for a user + route + save type.
   *
   * Returns the saved_route row if it exists, or null if not.
   * Uses `.maybeSingle()` instead of `.single()` because "not found"
   * is a valid state (the user simply hasn't saved this route yet),
   * not an error condition.
   *
   * @param userId - The authenticated user's ID
   * @param routeId - The route to check
   * @param saveType - Which type of bookmark to look for
   */
  getSavedRoute(userId: string, routeId: string, saveType: SaveType) {
    return fromSavedRoutes()
      .select("*")
      .eq("user_id", userId)
      .eq("route_id", routeId)
      .eq("save_type", saveType)
      .maybeSingle();
  },

  /**
   * Create a new bookmark (favorite, project, or wishlist).
   *
   * Inserts a row into saved_routes and returns the created row.
   * The database's UNIQUE constraint on (user_id, route_id, save_type)
   * prevents duplicates — if the user already saved this route with
   * the same type, Supabase returns an error (not a silent duplicate).
   *
   * `.select().single()` after `.insert()` tells PostgREST to return
   * the newly created row. Without `.select()`, INSERT returns nothing.
   *
   * @param userId - The authenticated user's ID
   * @param routeId - The route to bookmark
   * @param saveType - Type of bookmark to create
   */
  saveRoute(userId: string, routeId: string, saveType: SaveType) {
    return fromSavedRoutes()
      .insert({
        user_id: userId,
        route_id: routeId,
        save_type: saveType,
      })
      .select()
      .single();
  },

  /**
   * Remove a bookmark (un-favorite, un-project, un-wishlist).
   *
   * Deletes the matching row from saved_routes. If no row matches
   * (e.g., trying to un-favorite something that isn't favorited),
   * Supabase returns success with no rows affected — not an error.
   *
   * @param userId - The authenticated user's ID
   * @param routeId - The route to un-bookmark
   * @param saveType - Type of bookmark to remove
   */
  unsaveRoute(userId: string, routeId: string, saveType: SaveType) {
    return fromSavedRoutes()
      .delete()
      .eq("user_id", userId)
      .eq("route_id", routeId)
      .eq("save_type", saveType);
  },
};
