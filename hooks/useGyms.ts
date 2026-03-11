/**
 * Gym Hooks — TanStack Query Wrappers for Gym Data
 *
 * These hooks are the primary API screens use to fetch gym data and
 * set the user's home gym. They wrap gymService methods with TanStack
 * Query's useQuery (reads) and useMutation (writes).
 *
 * QUERY KEYS:
 *   ["gyms"]          — all gyms list (gym directory)
 *   ["gyms", gymId]   — single gym detail
 *
 * MUTATIONS:
 *   useSetHomeGym — writes to profiles table, then invalidates the
 *   "auth" cache so useAuth().user.homeGymId updates automatically.
 *
 * Why useMutation for setHomeGym?
 * useQuery is for reads — it caches and refetches. useMutation is for
 * writes — it doesn't cache the result, but it lets us run side effects
 * (like cache invalidation) after the write succeeds. This is the
 * standard TanStack Query pattern for POST/PUT/DELETE operations.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { gymService } from "@/services/gyms.service";
import { useAuth } from "@/hooks/useAuth";

/**
 * Fetch the list of all gyms.
 *
 * Used by the gym directory screen and home gym picker. Cached under
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
 * Mutation hook to set the user's home gym.
 *
 * After a successful write, we invalidate the "auth" query cache.
 * This makes useAuth() refetch the user's profile, which picks up
 * the new home_gym_id. Without this invalidation, the UI would show
 * stale homeGymId until the next full auth refresh.
 *
 * Usage in a screen:
 *   const setHomeGym = useSetHomeGym();
 *   const handlePress = () => {
 *     setHomeGym.mutate({ userId: session.user.id, gymId: "gym-1" });
 *   };
 */
export function useSetHomeGym() {
  const { refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, gymId }: { userId: string; gymId: string | null }) => {
      const result = await gymService.setHomeGym(userId, gymId);
      if (result.error) throw result.error;
      return result.data;
    },
    // useAuth is event-driven (not TanStack Query), so we call
    // refreshProfile() to re-read the profile row from Supabase.
    // This updates user.homeGymId in the auth state.
    onSuccess: () => {
      refreshProfile();
    },
  });
}
