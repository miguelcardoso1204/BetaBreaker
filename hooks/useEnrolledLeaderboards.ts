// hooks/useEnrolledLeaderboards.ts
//
// Stub hook for the Leaderboards tab. Returns an empty array so the screen
// renders its empty state in practice. Phase 9 (Gamification) will replace
// this with a real TanStack Query hook that fetches from leaderboard_entries.
//
// WHY A STUB?
// The Leaderboards tab needs to render now (Phase 4), but the leaderboard
// service/hook that queries the DB won't be built until Phase 9. By creating
// this stub with the correct return shape, the screen can be fully tested
// and functional — it just always shows the empty state until Phase 9 wires
// up the real data fetching.

/**
 * Shape of a single leaderboard entry displayed on the Leaderboards tab.
 * Each entry represents the user's standing at one gym for a given period.
 *
 * Phase 9 will use this same interface when querying leaderboard_entries
 * joined with gyms to get the gym_name.
 */
export interface EnrolledLeaderboard {
  /** Unique identifier for this leaderboard entry */
  id: string;
  /** The gym this leaderboard belongs to */
  gym_id: string;
  /** Display name of the gym (joined from gyms table) */
  gym_name: string;
  /** ISO week period string, e.g. "2026-W06" */
  period: string;
  /** User's rank position in this leaderboard (1 = first place) */
  rank: number;
  /** User's total score for this period */
  score: number;
  /** How many climbers are in this leaderboard */
  total_participants: number;
}

/**
 * Stub hook — always returns empty data.
 *
 * The return shape matches what TanStack Query's useQuery returns
 * (data, isLoading, error) so the screen code won't need to change
 * when Phase 9 swaps in the real implementation.
 */
export function useEnrolledLeaderboards() {
  return {
    data: [] as EnrolledLeaderboard[],
    isLoading: false,
    error: null,
  };
}
