/**
 * Route Cache — Business Logic for Offline Route Browsing
 *
 * This module sits between the TanStack Query hook (useRoutes) and the raw
 * SQLite CRUD layer (offlineDb). It handles:
 *   1. Serializing route objects to JSON for SQLite storage
 *   2. Deserializing cached JSON back into route objects
 *   3. TTL checking — rejecting stale cache data older than 24 hours
 *
 * WHY A SEPARATE MODULE?
 * offlineDb deals with raw SQL rows (strings, no business logic). This module
 * adds the domain knowledge: "what does a Route look like?", "is this cache
 * entry still fresh?". Keeping these concerns separate makes both easier to
 * test — offlineDb tests verify SQL, this module's tests verify serialization
 * and TTL logic with offlineDb fully mocked.
 *
 * DATA FLOW:
 *   Write path: useRoutes success → cacheRoutes() → serialize → upsertCachedRoutes()
 *   Read path:  useRoutes error   → getCachedRoutes() → TTL check → deserialize → return
 */

import { ROUTE_CACHE_TTL_MS } from '@/lib/constants';
import {
  upsertCachedRoutes,
  getCachedRoutesByGym,
  clearCachedRoutes,
} from '@/lib/offlineDb';
import type { CachedRouteRow } from '@/lib/offlineDb';

/**
 * Write routes to the local SQLite cache after a successful network fetch.
 *
 * Each route is serialized to a JSON string and stored with the current
 * timestamp. The upsertCachedRoutes function in offlineDb handles the
 * atomic replace (DELETE old + INSERT new) for the given gym.
 *
 * @param gymId  — the gym these routes belong to (scopes the cache)
 * @param routes — the route objects returned by Supabase (any shape)
 */
export function cacheRoutes(gymId: string, routes: unknown[]): void {
  const now = new Date(Date.now()).toISOString();

  // Map each route object to a CachedRouteRow for SQLite storage.
  // We store the full route as a JSON string so we can reconstruct it
  // later without knowing the exact column schema at compile time.
  const rows: CachedRouteRow[] = routes.map((route) => {
    // Type assertion: route must have an `id` field (all Supabase rows do).
    const r = route as { id: string; gym_id?: string };
    return {
      id: r.id,
      gym_id: gymId,
      route_data: JSON.stringify(route),
      cached_at: now,
    };
  });

  upsertCachedRoutes(gymId, rows);
}

/**
 * Read cached routes from SQLite, returning them only if still fresh.
 *
 * "Fresh" means the cached_at timestamp is within ROUTE_CACHE_TTL_MS
 * (24 hours) of the current time. This prevents serving extremely stale
 * data — if a user hasn't opened the app in a week, we'd rather show
 * an error than a route list where half the routes may have been archived.
 *
 * @param gymId — the gym to look up cached routes for
 * @returns Parsed route objects if the cache is fresh, null otherwise
 */
export function getCachedRoutes(gymId: string): unknown[] | null {
  const rows = getCachedRoutesByGym(gymId);

  // No cached data exists for this gym
  if (rows.length === 0) {
    return null;
  }

  // Check TTL against the first row's cached_at timestamp.
  // All rows in a gym's cache share the same cached_at (written in one batch),
  // so checking one row is sufficient.
  const cachedAt = new Date(rows[0].cached_at).getTime();
  const age = Date.now() - cachedAt;

  if (age > ROUTE_CACHE_TTL_MS) {
    // Cache is expired — return null so the caller knows there's no
    // usable fallback and should propagate the network error.
    return null;
  }

  // Deserialize each row's JSON route_data back into an object.
  // JSON.parse reverses the JSON.stringify from cacheRoutes().
  return rows.map((row) => JSON.parse(row.route_data));
}

/**
 * Clear all cached routes across all gyms.
 *
 * Delegates directly to offlineDb. Called on logout to remove
 * user-specific cached data, or for manual cache resets.
 */
export function clearRouteCache(): void {
  clearCachedRoutes();
}
