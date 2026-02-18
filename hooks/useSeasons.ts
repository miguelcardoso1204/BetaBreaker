/**
 * Season Hooks — TanStack Query Wrappers for Season Management (Step 15.6)
 *
 * These hooks power the admin season management screen.
 *
 *   Queries:
 *     - useSeasons(gymId) → ["seasons", gymId]
 *
 *   Mutations (all invalidate relevant query keys on settle):
 *     - useCreateSeason()  — create a new season
 *     - useCloseSeason()   — close season + batch-archive routes (compound)
 *     - useDeleteSeason()  — remove a season
 *
 * WHY useCloseSeason IS A COMPOUND MUTATION:
 * Closing a season involves two steps: (1) mark the season as 'closed',
 * (2) batch-archive all active/retiring routes for the gym. Both calls
 * are idempotent, so if the second fails the admin can retry. The hook
 * orchestrates the sequence and invalidates both ["seasons"] and
 * ["adminRoutes"] so both views refresh.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { seasonsService } from "@/services/seasons.service";
import type { CreateSeasonData } from "@/services/seasons.service";

// ── Queries ──────────────────────────────────────────────────────────

/**
 * Fetch all seasons for a gym, ordered newest-first.
 *
 * Returns seasons with id, name, start_date, end_date, status.
 * Powers the admin season management screen.
 *
 * @param gymId - The gym to fetch seasons for (null/undefined disables the query)
 */
export function useSeasons(gymId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["seasons", gymId],
    queryFn: async () => {
      const result = await seasonsService.getSeasonsByGym(gymId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    // Disable if gymId isn't available (profile still loading)
    enabled: !!gymId,
  });

  return {
    seasons: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── Mutations ────────────────────────────────────────────────────────

/**
 * Mutation to create a new season for a gym.
 *
 * Invalidates the ["seasons"] query key so the list refreshes.
 */
export function useCreateSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSeasonData) => {
      const result = await seasonsService.createSeason(data);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
    },
  });
}

/**
 * Compound mutation to close a season and archive all gym routes.
 *
 * Two sequential steps:
 *   1. closeSeason(seasonId) — marks the season as 'closed'
 *   2. archiveGymRoutes(gymId) — batch-sets active/retiring routes to 'archived'
 *
 * If step 1 fails, step 2 is skipped (routes stay as-is). Both operations
 * are idempotent so the admin can retry safely.
 *
 * Invalidates ["seasons"] (season list updates) and ["adminRoutes"]
 * (route statuses changed to archived).
 */
export function useCloseSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ seasonId, gymId }: { seasonId: string; gymId: string }) => {
      // Step 1: Close the season
      const closeResult = await seasonsService.closeSeason(seasonId);
      if (closeResult.error) throw closeResult.error;

      // Step 2: Archive all active/retiring routes for the gym
      const archiveResult = await seasonsService.archiveGymRoutes(gymId);
      if (archiveResult.error) throw archiveResult.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      queryClient.invalidateQueries({ queryKey: ["adminRoutes"] });
    },
  });
}

/**
 * Mutation to delete a season.
 *
 * Only gym admins can delete seasons per the RLS DELETE policy.
 * Invalidates ["seasons"] so the list refreshes.
 */
export function useDeleteSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ seasonId }: { seasonId: string }) => {
      const result = await seasonsService.deleteSeason(seasonId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
    },
  });
}
