/**
 * Badge & Streak Hooks — TanStack Query Wrappers for Gamification Data
 *
 * These hooks provide cached, reactive access to badge definitions, earned
 * badges, and streak data. They wrap gamificationService methods with
 * TanStack Query's useQuery, giving screens automatic loading/error states,
 * background refetching, and deduplication.
 *
 * QUERY KEYS:
 *   ["badges"]                — all badge definitions (badge gallery)
 *   ["badges", "user", id]   — badges earned by a specific user
 *   ["badges", "pinned", id] — pinned badge IDs from a user's profile
 *   ["streaks", id]          — a user's weekly climbing streak
 *
 * Why separate keys for badges vs user badges?
 * Badge definitions rarely change (only when we add new badge types via
 * migration). User badges change on every ascent insert (triggers may
 * award new badges). Using different query keys means we can invalidate
 * user badges after logging an ascent without refetching the full badge
 * catalog.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gamificationService } from "@/services/gamification.service";

/**
 * Fetch all badge definitions.
 *
 * Used by the badge gallery screen to show every achievable badge with
 * its name, description, and icon. Results are sorted by criteria_type
 * then criteria_value (grade badges first, then volume, then streak).
 */
export function useBadges() {
  return useQuery({
    queryKey: ["badges"],
    queryFn: async () => {
      const result = await gamificationService.getBadges();
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Fetch badges earned by a specific user.
 *
 * Includes the full badge definition via resource embedding (name, icon_key,
 * etc.), so the UI can render each earned badge without a second query.
 * Sorted newest-first so the most recently earned badge appears at the top.
 *
 * Disabled when userId is undefined — prevents fetching before the user
 * is authenticated. TanStack Query won't fire the request until enabled
 * becomes true.
 *
 * @param userId - The UUID of the user, or undefined if not yet known
 */
export function useUserBadges(userId: string | undefined) {
  return useQuery({
    queryKey: ["badges", "user", userId],
    queryFn: async () => {
      // userId is guaranteed to be defined here because `enabled: !!userId`
      // prevents this function from running when userId is undefined.
      const result = await gamificationService.getUserBadges(userId!);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!userId,
  });
}

/**
 * Fetch a user's weekly climbing streak.
 *
 * The streak data includes current_streak (consecutive weeks of climbing),
 * longest_streak (all-time best), and last_active_week. Used by the profile
 * screen and session summary to show climbing consistency.
 *
 * Returns null (not an error) when the user has no streak row — this
 * happens for new users who haven't logged any ascents yet. The service
 * uses maybeSingle() to handle this gracefully.
 *
 * @param userId - The UUID of the user, or undefined if not yet known
 */
export function useUserStreak(userId: string | undefined) {
  return useQuery({
    queryKey: ["streaks", userId],
    queryFn: async () => {
      const result = await gamificationService.getUserStreak(userId!);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!userId,
  });
}

/**
 * Fetch a user's pinned badge IDs from their profile.
 *
 * The pinned_badge_ids column stores an array of badge UUIDs that the user
 * has chosen to display prominently on their profile. The UI resolves these
 * IDs against the earned badges list to get full badge objects (name, icon, etc.).
 *
 * Disabled when userId is undefined — same guard as other user hooks.
 *
 * @param userId - The UUID of the user, or undefined if not yet known
 */
export function usePinnedBadges(userId: string | undefined) {
  return useQuery({
    queryKey: ["badges", "pinned", userId],
    queryFn: async () => {
      const result = await gamificationService.getPinnedBadges(userId!);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!userId,
  });
}

/**
 * Mutation to update a user's pinned badge IDs.
 *
 * On success, invalidates the pinned badges cache so the profile screen
 * immediately reflects the new selection. The DB trigger enforces tier
 * limits (free: 1, pro: 3) — if the mutation tries to exceed the limit,
 * the Supabase response will contain an error from the trigger.
 *
 * Usage:
 * ```tsx
 * const { mutateAsync } = useSetPinnedBadges();
 * await mutateAsync({ userId: user.id, badgeIds: ["uuid-1", "uuid-2"] });
 * ```
 */
export function useSetPinnedBadges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      badgeIds,
    }: {
      userId: string;
      badgeIds: string[];
    }) => {
      const result = await gamificationService.setPinnedBadges(userId, badgeIds);
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      // Invalidate pinned badges cache so the profile screen refetches
      // with the updated selection. Using a partial key ["badges", "pinned"]
      // invalidates all user-specific pinned badge queries.
      queryClient.invalidateQueries({ queryKey: ["badges", "pinned"] });
    },
  });
}
