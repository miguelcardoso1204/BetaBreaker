/**
 * Social Hooks — TanStack Query Wrappers for Follow System & Activity Feed
 *
 * HOOK BREAKDOWN:
 *   - useIsFollowing(targetUserId) — QUERY: checks if the current user
 *     follows the target. Returns { isFollowing: boolean, isLoading }.
 *   - useToggleFollow(targetUserId) — combined hook: reads isFollowing
 *     state + provides a toggleFollow mutation that follows or unfollows
 *     accordingly. Invalidates related query keys on success.
 *   - useFollowCounts(userId) — QUERY: returns { followers, following }
 *     counts for any user's profile.
 *   - useActivityFeed() — QUERY: two-step fetch — get followed user IDs,
 *     then fetch their recent ascents. Returns empty array when following
 *     nobody. Only enabled when authenticated.
 *
 * QUERY KEY STRUCTURE:
 *   ["follows", "status", targetUserId] — follow relationship check
 *   ["follows", "counts", userId]       — follower/following counts
 *   ["activity-feed"]                   — activity feed data
 *
 * All mutations invalidate the status + counts + activity-feed keys
 * so the UI stays consistent after follow/unfollow actions.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { socialService } from "@/services/social.service";
import { useAuth } from "@/hooks/useAuth";

/**
 * Check if the current user follows a target user.
 * maybeSingle() returns null when no row exists, so
 * we convert to a boolean for easy consumption.
 */
export function useIsFollowing(targetUserId: string) {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["follows", "status", targetUserId],
    queryFn: async () => {
      if (!userId) return null;
      const result = await socialService.isFollowing(userId, targetUserId);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!userId,
  });

  return {
    isFollowing: !!query.data,
    isLoading: query.isLoading,
  };
}

/**
 * Combined follow state + toggle mutation.
 * Reads the isFollowing cache to decide whether to follow or unfollow.
 * Returns both the current state and a toggleFollow function.
 */
export function useToggleFollow(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isFollowing, isLoading } = useIsFollowing(targetUserId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Must be logged in to follow users");

      if (isFollowing) {
        const result = await socialService.unfollow(user.id, targetUserId);
        if (result.error) throw result.error;
      } else {
        const result = await socialService.follow(user.id, targetUserId);
        if (result.error) throw result.error;
      }
    },
    onSettled: () => {
      // Invalidate all related queries so counts and feed update
      queryClient.invalidateQueries({
        queryKey: ["follows", "status", targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ["follows", "counts", targetUserId],
      });
      // The target's followers list changed — they gained / lost the
      // current user as a follower.
      queryClient.invalidateQueries({
        queryKey: ["follows", "followers", targetUserId],
      });
      // Also invalidate current user's counts + their following list
      // (their "following" count just changed).
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: ["follows", "counts", user.id],
        });
        queryClient.invalidateQueries({
          queryKey: ["follows", "following-list", user.id],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
    },
  });

  return {
    isFollowing,
    isLoading,
    toggleFollow: () => mutation.mutate(),
    isPending: mutation.isPending,
  };
}

/**
 * Fetch follower + following counts for a user profile.
 * Works for any userId — not just the current user.
 */
export function useFollowCounts(userId: string) {
  const query = useQuery({
    queryKey: ["follows", "counts", userId],
    queryFn: () => socialService.getFollowCounts(userId),
  });

  return {
    followers: query.data?.followers ?? 0,
    following: query.data?.following ?? 0,
    isLoading: query.isLoading,
  };
}

/**
 * Activity feed: recent ascents from followed users.
 *
 * Two-step fetch:
 * 1. Get IDs of users the current user follows
 * 2. Fetch recent ascents for those IDs
 *
 * Returns empty array early when following nobody — no need
 * to hit route_ascents with an empty IN clause.
 */
/**
 * Fetch recent ascents for a single user.
 * Used on the public profile screen to show a "Recent Sends" section.
 * Returns the 10 most recent ascents with route and profile data.
 *
 * Disabled when userId is null/undefined — won't fire until a valid
 * userId is available.
 */
export function useUserRecentAscents(userId: string | undefined | null) {
  return useQuery({
    queryKey: ["ascents", "recent", userId],
    queryFn: async () => {
      const result = await socialService.getUserRecentAscents(userId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!userId,
  });
}

/**
 * List of users that follow userId, with profile data.
 * Backs the followers list screen at /profile/[userId]/followers.
 *
 * Returns an empty array (not undefined) when nobody follows the user,
 * so the consumer doesn't have to handle the loading-vs-empty distinction
 * separately from the standard isLoading flag.
 */
export function useFollowers(userId: string) {
  const query = useQuery({
    queryKey: ["follows", "followers", userId],
    queryFn: async () => {
      const result = await socialService.getFollowers(userId);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!userId,
  });

  return {
    followers: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * List of users that userId follows, with profile data.
 * Backs the following list screen at /profile/[userId]/following.
 *
 * Reuses socialService.getFollowing — useActivityFeed already calls
 * that under the hood, but this hook surfaces the raw list directly
 * (rather than as a step in the activity-feed pipeline).
 */
export function useFollowingList(userId: string) {
  const query = useQuery({
    queryKey: ["follows", "following-list", userId],
    queryFn: async () => {
      const result = await socialService.getFollowing(userId);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!userId,
  });

  return {
    following: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Search climbers by display name. The query is the debounced text the
 * user typed into the search screen.
 *
 * Disabled when the trimmed query is empty so an empty input doesn't
 * spam the network. The current user's id is part of the query key so
 * cached results don't bleed across accounts (we exclude self in the
 * service layer).
 */
export function useSearchClimbers(query: string) {
  const { user } = useAuth();
  const userId = user?.id;
  const trimmed = query.trim();

  const result = useQuery({
    queryKey: ["search-climbers", userId, trimmed],
    queryFn: async () => {
      if (!userId) return [];
      const res = await socialService.searchClimbers(trimmed, userId);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    enabled: !!userId && trimmed.length > 0,
  });

  return {
    results: result.data ?? [],
    isLoading: result.isLoading && trimmed.length > 0,
    error: result.error,
  };
}

export function useActivityFeed() {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["activity-feed"],
    queryFn: async () => {
      if (!userId) return [];

      // Step 1: who does the user follow?
      const followingResult = await socialService.getFollowing(userId);
      if (followingResult.error) throw followingResult.error;

      const followingIds = (followingResult.data ?? []).map(
        (f: { following_id: string }) => f.following_id
      );

      // No one followed — return empty feed immediately
      if (followingIds.length === 0) return [];

      // Step 2: fetch their recent ascents
      const feedResult = await socialService.getActivityFeed(followingIds);
      if (feedResult.error) throw feedResult.error;

      return feedResult.data ?? [];
    },
    enabled: !!userId,
  });

  return {
    feed: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
