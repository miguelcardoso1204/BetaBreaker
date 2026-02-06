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
    // routeService.getRoutes returns { data, error } from Supabase.
    // We unwrap it here: throw on error (so TanStack Query catches it),
    // return just the data array on success.
    queryFn: async () => {
      const result = await routeService.getRoutes(filters);
      if (result.error) throw result.error;
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
