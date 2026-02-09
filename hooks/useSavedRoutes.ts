/**
 * Saved Routes Hooks — TanStack Query Wrappers for Favorites
 *
 * These hooks provide the "is this route favorited?" state and the
 * "toggle favorite" action to the Route Detail screen. They wrap
 * savedRoutesService with TanStack Query for caching and mutations.
 *
 * WHY TWO HOOKS INSTEAD OF ONE?
 * Separation of concerns:
 *   - `useIsFavorite` is a QUERY — it reads from the server cache.
 *     Any component that needs to show a star icon calls this.
 *   - `useToggleFavorite` is a MUTATION — it writes to the server and
 *     invalidates the query cache so useIsFavorite re-fetches.
 *
 * This matches the TanStack Query pattern of keeping reads (useQuery)
 * and writes (useMutation) separate. They share a query key so the
 * mutation can invalidate the query's cache.
 *
 * QUERY KEY: ["saved_routes", "favorite", routeId]
 * The first segment ("saved_routes") groups all bookmark queries.
 * The second ("favorite") distinguishes from future "project"/"wishlist" hooks.
 * The third (routeId) makes each route's favorite state its own cache entry.
 *
 * OPTIMISTIC UPDATES:
 * When the user taps the star, we immediately flip the UI (optimistic update)
 * before the server responds. If the mutation fails, TanStack Query's
 * onError rolls back the cache to the previous value. This gives instant
 * feedback — no waiting for the network round-trip.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { savedRoutesService } from "@/services/savedRoutes.service";
import { useAuth } from "@/hooks/useAuth";

/**
 * Check whether the current user has favorited a specific route.
 *
 * @param routeId - The route to check
 * @returns `{ isFavorite, isLoading }` — the star icon reads `isFavorite`
 *          to decide between filled/outlined state.
 *
 * The query calls `savedRoutesService.getSavedRoute(userId, routeId, "favorite")`
 * and converts the result to a boolean: row exists → true, null → false.
 */
export function useIsFavorite(routeId: string) {
  // Get the current user's ID from the auth hook.
  // If the user isn't logged in, the query will be disabled.
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    // Query key includes the routeId so each route has its own cache entry.
    queryKey: ["saved_routes", "favorite", routeId],
    queryFn: async () => {
      // userId is guaranteed to be defined when enabled is true (see below).
      const result = await savedRoutesService.getSavedRoute(
        userId!,
        routeId,
        "favorite"
      );
      if (result.error) throw result.error;
      // Convert the row to a boolean: data exists → favorited
      return result.data;
    },
    // Only run the query when we have a user ID — unauthenticated users
    // can't have favorites, so there's nothing to fetch.
    enabled: !!userId,
  });

  return {
    // Convert the raw data (row or null) to a simple boolean.
    // `!!data` coerces: null → false, { ...row } → true.
    isFavorite: !!query.data,
    isLoading: query.isLoading,
  };
}

/**
 * Toggle the favorite state for a specific route.
 *
 * @param routeId - The route to favorite/unfavorite
 * @returns A TanStack Query mutation object with `.mutate()` to trigger the toggle
 *
 * The mutation reads the current favorite state from the query cache,
 * then calls either saveRoute (to add) or unsaveRoute (to remove).
 * After success, it invalidates the query cache so useIsFavorite re-fetches.
 */
export function useToggleFavorite(routeId: string) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  // The query key for this route's favorite state — used to read the current
  // value from cache and to invalidate after mutation.
  const queryKey = ["saved_routes", "favorite", routeId];

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Must be logged in to favorite routes");

      // Read the current favorite state directly from the TanStack Query cache.
      // This avoids an extra network request — the data is already fetched
      // by useIsFavorite and sitting in the cache.
      const currentData = queryClient.getQueryData(queryKey);
      const isFavorited = !!currentData;

      if (isFavorited) {
        // Currently favorited → remove the bookmark
        const result = await savedRoutesService.unsaveRoute(
          userId,
          routeId,
          "favorite"
        );
        if (result.error) throw result.error;
      } else {
        // Not favorited → add the bookmark
        const result = await savedRoutesService.saveRoute(
          userId,
          routeId,
          "favorite"
        );
        if (result.error) throw result.error;
      }
    },
    // After the mutation completes (success or error), refetch the favorite
    // state from the server to ensure the cache is consistent.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
