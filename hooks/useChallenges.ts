/**
 * Challenge Hooks — TanStack Query Wrappers for Challenge Data (Step 8.4)
 *
 * These hooks provide cached, reactive access to challenge definitions and
 * user progress. They wrap challengesService methods with TanStack Query's
 * useQuery, giving screens automatic loading/error states, background
 * refetching, and deduplication.
 *
 * QUERY KEYS:
 *   ["challenges", "active", gymId]      — active challenges for a gym
 *   ["challenges", "all", gymId]         — all challenges for a gym (admin)
 *   ["challenges", "progress", uid, gid] — user's progress at a gym
 *   ["challenges", "single", uid, cid]   — user's progress for one challenge
 *
 * Why separate keys for active vs all?
 * Active challenges change frequently as challenges start and expire.
 * The "all" query is used by admins and includes past/future challenges.
 * Separate keys let us invalidate active challenges on timer ticks without
 * refetching the full admin list.
 */

import { useQuery } from "@tanstack/react-query";
import { challengesService } from "@/services/challenges.service";

/**
 * Fetch active challenges for a gym.
 *
 * Active = started and not yet ended. Used by the profile screen and
 * challenge list to show what the user can currently work toward.
 * Disabled when gymId is undefined (no home gym set).
 *
 * @param gymId - The gym UUID, or undefined to disable the query
 */
export function useActiveChallenges(gymId: string | undefined) {
  return useQuery({
    queryKey: ["challenges", "active", gymId],
    queryFn: async () => {
      // gymId is guaranteed defined here because `enabled: !!gymId`
      const result = await challengesService.getActiveChallenges(gymId!);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!gymId,
  });
}

/**
 * Fetch all challenges for a gym (past, active, and future).
 *
 * Used by the admin panel to manage the full challenge lifecycle.
 * Sorted by start_date descending (newest first).
 *
 * @param gymId - The gym UUID, or undefined to disable the query
 */
export function useAllChallenges(gymId: string | undefined) {
  return useQuery({
    queryKey: ["challenges", "all", gymId],
    queryFn: async () => {
      const result = await challengesService.getAllChallenges(gymId!);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!gymId,
  });
}

/**
 * Fetch a user's progress for all challenges at a specific gym.
 *
 * Includes embedded challenge details (name, criteria, reward badge)
 * so the UI can render progress cards without additional queries.
 * Disabled when either userId or gymId is undefined.
 *
 * @param userId - The user UUID, or undefined to disable
 * @param gymId  - The gym UUID, or undefined to disable
 */
export function useChallengeProgress(
  userId: string | undefined,
  gymId: string | undefined,
) {
  return useQuery({
    queryKey: ["challenges", "progress", userId, gymId],
    queryFn: async () => {
      const result = await challengesService.getUserChallengeProgress(
        userId!,
        gymId!,
      );
      if (result.error) throw result.error;
      return result.data;
    },
    // Both IDs required — disable if either is missing
    enabled: !!userId && !!gymId,
  });
}

/**
 * Fetch a user's progress for a single challenge.
 *
 * Returns null when the user hasn't started the challenge (no progress
 * row exists). Used by challenge detail screens to show per-challenge progress.
 *
 * @param userId      - The user UUID, or undefined to disable
 * @param challengeId - The challenge UUID, or undefined to disable
 */
export function useSingleChallengeProgress(
  userId: string | undefined,
  challengeId: string | undefined,
) {
  return useQuery({
    queryKey: ["challenges", "single", userId, challengeId],
    queryFn: async () => {
      const result = await challengesService.getUserProgressForChallenge(
        userId!,
        challengeId!,
      );
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!userId && !!challengeId,
  });
}
