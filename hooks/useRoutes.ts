/**
 * Route Hooks — TanStack Query Wrappers for Route Data
 *
 * These hooks are the primary API screens use to fetch route data.
 * They wrap routeService methods with TanStack Query's useQuery, which
 * provides automatic caching, loading/error states, and background refetch.
 *
 * WHY TanStack Query instead of plain useEffect + useState?
 * Without TanStack Query, every screen would need:
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState(null);
 *   useEffect(() => { fetchData().then(setData).catch(setError)... }, [deps]);
 * That's 10+ lines of boilerplate PER data fetch. TanStack Query replaces
 * all of it with one `useQuery()` call AND adds caching for free.
 *
 * QUERY KEYS:
 * TanStack Query identifies cache entries by "query keys" — arrays that
 * uniquely describe what data was fetched. When the key changes, TanStack
 * Query knows the old cache is for a different query and fetches fresh data.
 *
 * Our key structure:
 *   ["routes", { gymId, gradeMin, gradeMax, ... }]  — route list
 *   ["routes", routeId]                              — single route detail
 *
 * This means:
 *   - Two screens fetching routes for the same gym + filters share one cache
 *   - Changing a filter (e.g., gradeMin) creates a new cache entry and refetches
 *   - Route detail is cached per-route, so navigating back is instant
 */

import { useQuery } from "@tanstack/react-query";
import { routeService } from "@/services/routes.service";
import type { RouteFilters } from "@/services/routes.service";
import { cacheRoutes, getCachedRoutes } from "@/lib/routeCache";
import { supabase } from "@/lib/supabase";

/**
 * Fetch a filtered list of routes for a gym.
 *
 * @param filters — gymId (required) + optional grade, status, search, sort
 * @returns TanStack Query result: { data, isLoading, error, refetch, ... }
 *
 * The query key includes the entire filters object. When any filter value
 * changes (e.g., user selects a different grade range), TanStack Query
 * sees a different key and triggers a new fetch. The old data stays in
 * cache so switching back to previous filters is instant.
 */
export function useRoutes(filters: RouteFilters) {
  return useQuery({
    // Query key: ["routes", { gymId, gradeMin, ... }]
    // TanStack Query deeply compares objects in keys, so { gymId: "1" }
    // and { gymId: "1" } are treated as the same key (cache hit).
    queryKey: ["routes", filters],
    // queryFn: the async function that fetches the data.
    // This implements a "write-through cache with fallback" pattern:
    //   1. Try fetching from Supabase (the source of truth)
    //   2. On SUCCESS → write data to SQLite cache, then return it
    //   3. On ERROR → check SQLite cache for fresh data to serve offline
    //   4. If no cache → re-throw so TanStack Query enters error state
    queryFn: async () => {
      const result = await routeService.getRoutes(filters);

      if (result.error) {
        // Network fetch failed — attempt offline fallback.
        // getCachedRoutes returns null if the cache is empty or expired
        // (older than ROUTE_CACHE_TTL_MS = 24 hours).
        // We cast the result to match the Supabase return type — the cache
        // stores the exact same objects that were returned by the service,
        // just round-tripped through JSON serialization.
        const cached = getCachedRoutes(filters.gymId) as typeof result.data;
        if (cached) {
          return cached;
        }
        // No usable cache — propagate the original error so the UI
        // can show an appropriate error message to the user.
        throw result.error;
      }

      // Success path: write through to SQLite so this data is available
      // if the next fetch fails (e.g., user enters a dead zone at the gym).
      // We fire-and-forget — cacheRoutes is synchronous (SQLite sync API),
      // so there's no async overhead or risk of unhandled rejections.
      if (result.data) {
        cacheRoutes(filters.gymId, result.data);
      }

      return result.data;
    },
  });
}

/**
 * Fetch a single route by ID with setter profile info.
 *
 * @param routeId — the UUID of the route to fetch
 * @returns TanStack Query result: { data, isLoading, error, ... }
 *
 * Used by the route detail screen. The query is cached per routeId,
 * so navigating to the same route twice doesn't refetch (within staleTime).
 */
export function useRouteDetail(routeId: string) {
  return useQuery({
    queryKey: ["routes", routeId],
    queryFn: async () => {
      const result = await routeService.getRouteById(routeId);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Fetch the average quality/enjoyment rating for a route.
 *
 * Queries all non-null `rating` values from route_ascents and computes
 * the average client-side. Returns null when no ratings exist.
 *
 * @param routeId — the route to get the average rating for
 */
export function useRouteRating(routeId: string) {
  const query = useQuery({
    queryKey: ["route-rating", routeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_ascents")
        .select("rating")
        .eq("route_id", routeId)
        .not("rating", "is", null);
      if (error) throw error;

      const ratings = (data ?? []).map((r: { rating: number | null }) => r.rating!).filter(Boolean);
      if (ratings.length === 0) return { average: null, count: 0 };

      const sum = ratings.reduce((a: number, b: number) => a + b, 0);
      return {
        average: Number((sum / ratings.length).toFixed(1)),
        count: ratings.length,
      };
    },
  });

  return {
    averageRating: query.data?.average ?? null,
    ratingCount: query.data?.count ?? 0,
    isLoading: query.isLoading,
  };
}
