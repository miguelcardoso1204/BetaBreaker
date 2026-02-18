/**
 * Social Service — Thin Wrapper for Follow System & Activity Feed
 *
 * Manages the `follows` table (composite PK: follower_id + following_id)
 * and provides an activity feed by querying route_ascents for followed users.
 *
 * FOLLOW MODEL:
 *   follows: { follower_id, following_id, created_at }
 *   - follower_id: the user doing the following
 *   - following_id: the user being followed
 *   - Both FK to profiles.id
 *
 * ACTIVITY FEED:
 *   Two-step approach in the hook layer:
 *   1. getFollowing() → list of followed user IDs
 *   2. getActivityFeed(ids) → recent ascents for those users
 *   This is cleaner than complex nested PostgREST embedding and
 *   keeps each query simple and independently cacheable.
 */

import { supabase } from "@/lib/supabase";

export const socialService = {
  /**
   * Create a follow relationship. The current user (follower)
   * starts following another user (following).
   */
  follow(followerId: string, followingId: string) {
    return supabase
      .from("follows")
      .insert({ follower_id: followerId, following_id: followingId });
  },

  /**
   * Remove a follow relationship. Uses two .eq() filters
   * since the table has a composite PK (no single id column).
   */
  unfollow(followerId: string, followingId: string) {
    return supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
  },

  /**
   * Check if a follow relationship exists. Uses .maybeSingle()
   * which returns null (not an error) when no row matches —
   * perfect for boolean existence checks.
   */
  isFollowing(followerId: string, followingId: string) {
    return supabase
      .from("follows")
      .select("*")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();
  },

  /**
   * Get follower + following counts for a user profile.
   * Uses { count: "exact", head: true } to get the count
   * without transferring any row data — efficient for display.
   *
   * Two separate queries because PostgREST can't do
   * bidirectional counts in a single request.
   */
  async getFollowCounts(userId: string) {
    // How many people follow this user
    const followersResult = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId);

    // How many people this user follows
    const followingResult = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId);

    return {
      followers: followersResult.count ?? 0,
      following: followingResult.count ?? 0,
    };
  },

  /**
   * Get list of users that userId follows, with profile data.
   * The PostgREST join syntax `profiles!follows_following_id_fkey`
   * tells Supabase which FK to use for the join — necessary because
   * follows has two FKs to profiles (follower + following).
   */
  getFollowing(userId: string) {
    return supabase
      .from("follows")
      .select(
        "following_id, profile:profiles!follows_following_id_fkey(display_name, avatar_url)"
      )
      .eq("follower_id", userId);
  },

  /**
   * Fetch recent ascents from a list of followed user IDs.
   * Joins routes for route metadata and profiles for display info.
   * Ordered newest-first, capped at 50 to keep the feed snappy.
   */
  getActivityFeed(followingIds: string[]) {
    return supabase
      .from("route_ascents")
      .select(
        "id, user_id, status, attempts, created_at, route:routes(name, canonical_grade, color), profile:profiles(display_name, avatar_url)"
      )
      .in("user_id", followingIds)
      .order("created_at", { ascending: false })
      .limit(50);
  },

  /**
   * Fetch recent ascents for a single user.
   * Same select shape as getActivityFeed but uses .eq() for one user
   * and limits to 10 entries. Used on the public profile screen to
   * show a "Recent Sends" section.
   */
  getUserRecentAscents(userId: string) {
    return supabase
      .from("route_ascents")
      .select(
        "id, user_id, status, attempts, created_at, route:routes(name, canonical_grade, color), profile:profiles(display_name, avatar_url)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
  },
};
