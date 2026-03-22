/**
 * Gym Hooks — TanStack Query Wrappers for Gym Data
 *
 * These hooks are the primary API screens use to fetch gym data and
 * manage the user's favorite gyms. They wrap gymService methods with
 * TanStack Query's useQuery (reads) and useMutation (writes).
 *
 * QUERY KEYS:
 *   ["gyms"]                    — all gyms list (gym directory)
 *   ["gyms", gymId]             — single gym detail
 *   ["favorite_gyms", userId]   — user's favorited gym IDs
 *
 * MUTATIONS:
 *   useToggleFavoriteGym — adds or removes a gym from favorites,
 *   then invalidates the favorites cache so the list updates.
 *
 * Why useMutation for toggleFavorite?
 * useQuery is for reads — it caches and refetches. useMutation is for
 * writes — it doesn't cache the result, but it lets us run side effects
 * (like cache invalidation) after the write succeeds. This is the
 * standard TanStack Query pattern for POST/DELETE operations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gymService } from "@/services/gyms.service";

/**
 * Fetch the list of all gyms.
 *
 * Used by the gym directory screen and favorites picker. Cached under
 * the ["gyms"] key — the gym list rarely changes, so TanStack Query's
 * default staleTime keeps it fresh without excessive refetches.
 */
export function useGyms() {
  return useQuery({
    queryKey: ["gyms"],
    queryFn: async () => {
      const result = await gymService.getGyms();
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Fetch a single gym by ID.
 *
 * Used by the gym detail screen. Cached per gymId so navigating back
 * to the same gym is instant.
 */
export function useGym(gymId: string) {
  return useQuery({
    queryKey: ["gyms", gymId],
    queryFn: async () => {
      const result = await gymService.getGymById(gymId);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Fetch the current user's favorited gym IDs.
 *
 * Returns a Set<string> of gym IDs for O(1) lookup when checking if a
 * specific gym is favorited (e.g., the star icon on the gym detail screen).
 * The raw gym objects are also available via the `gyms` field.
 *
 * Disabled when userId is undefined (not logged in).
 */
export function useFavoriteGyms(userId: string | undefined) {
  return useQuery({
    queryKey: ["favorite_gyms", userId],
    queryFn: async () => {
      const result = await gymService.getFavoriteGyms(userId!);
      if (result.error) throw result.error;
      // Extract gym IDs into a Set for fast lookup, and keep
      // the full gym objects for screens that need them.
      const ids = new Set((result.data ?? []).map((row: any) => row.gym_id));
      const gyms = (result.data ?? [])
        .map((row: any) => row.gyms)
        .filter(Boolean);
      return { ids, gyms };
    },
    enabled: !!userId,
  });
}

/**
 * Mutation hook to toggle a gym's favorite status.
 *
 * If the gym is currently favorited, it removes it. If not, it adds it.
 * After success, invalidates the ["favorite_gyms"] cache so
 * useFavoriteGyms() picks up the change.
 *
 * Usage:
 *   const toggle = useToggleFavoriteGym();
 *   toggle.mutate({ userId: user.id, gymId: "gym-1", isFavorited: true });
 */
export function useToggleFavoriteGym() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      gymId,
      isFavorited,
    }: {
      userId: string;
      gymId: string;
      isFavorited: boolean;
    }) => {
      // If currently favorited, remove it; otherwise add it.
      const result = isFavorited
        ? await gymService.removeFavoriteGym(userId, gymId)
        : await gymService.addFavoriteGym(userId, gymId);
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (_data, variables) => {
      // Invalidate the favorites cache so the UI updates.
      queryClient.invalidateQueries({
        queryKey: ["favorite_gyms", variables.userId],
      });
    },
  });
}
