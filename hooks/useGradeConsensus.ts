/**
 * useGradeConsensus — TanStack Query Hooks for Grade Consensus (Step 15.4)
 *
 * Two query hooks that wrap the consensus service RPCs:
 *   1. useRoutesGradeConsensus(gymId) — all routes at a gym with consensus data
 *   2. useGradeSubmissions(routeId) — perceived_grade distribution for one route
 *
 * DATA FLOW:
 *   Screen → useRoutesGradeConsensus("gym-uuid")
 *     → TanStack Query → consensusService.getRoutesGradeConsensus
 *     → supabase.rpc('get_routes_grade_consensus')
 *     → returns cached/stale-while-revalidate data
 *
 * Both hooks are disabled when their key param is falsy — prevents firing
 * queries before the gym/route id is known (e.g., while useAuth loads).
 */

import { useQuery } from "@tanstack/react-query";
import { consensusService } from "@/services/consensus.service";

/**
 * Fetches all active/retiring_soon routes at a gym with consensus data:
 * canonical_grade, consensus_grade, submission_count, and divergence.
 *
 * Ordered by divergence DESC NULLS LAST — most "off" routes first.
 * Disabled when gymId is null (avoids firing before auth loads).
 */
export function useRoutesGradeConsensus(gymId: string | null) {
  const query = useQuery({
    // Query key includes gymId so cache is per-gym
    queryKey: ["routesGradeConsensus", gymId],
    queryFn: async () => {
      const { data, error } = await consensusService.getRoutesGradeConsensus(
        gymId!
      );
      if (error) throw error;
      return data;
    },
    // Don't fire the query until we have a gym id
    enabled: !!gymId,
  });

  return {
    routes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetches the perceived_grade distribution for a single route.
 * Returns an array of { perceived_grade, submission_count } rows.
 *
 * Disabled when routeId is null — the card only fetches distribution
 * when the user expands it (on press).
 */
export function useGradeSubmissions(routeId: string | null) {
  const query = useQuery({
    queryKey: ["gradeSubmissions", routeId],
    queryFn: async () => {
      const { data, error } = await consensusService.getGradeSubmissions(
        routeId!
      );
      if (error) throw error;
      return data;
    },
    enabled: !!routeId,
  });

  return {
    submissions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
