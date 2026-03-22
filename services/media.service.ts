/**
 * Media Service — Route Media Database Operations
 *
 * Handles the database side of beta video management:
 *   1. Link: Cloudinary URL → route_media DB row (ties video to route)
 *   2. Read: fetch all media for a route (with uploader profile)
 *   3. Delete: remove the DB row (Cloudinary cleanup via admin API later)
 *
 * Video files are uploaded directly to Cloudinary from the client
 * (see lib/cloudinary.ts). This service only manages the route_media
 * table that links Cloudinary URLs to routes.
 */

import { supabase } from '@/lib/supabase';

export const mediaService = {
  /**
   * Fetch all media for a route, with uploader profile info.
   *
   * Uses PostgREST resource embedding to join profiles in a single query.
   * Ordered newest-first so fresh content appears at the top of the list.
   *
   * @param routeId - The route to fetch media for
   */
  getRouteMedia(routeId: string) {
    return supabase
      .from('route_media')
      // Disambiguate the profiles join: route_media_likes created a second
      // path (many-to-many) between route_media and profiles. The hint
      // tells PostgREST to use the direct FK (uploader), not the likes path.
      .select('*, profile:profiles!route_media_user_id_fkey(display_name, avatar_url)')
      .eq('route_id', routeId)
      .order('created_at', { ascending: false });
  },

  /**
   * Insert a route_media row linking an uploaded video to a route.
   *
   * Called after a successful Cloudinary upload. The ownership_affirmed flag
   * is always true here because the OwnershipModal must be confirmed
   * before the upload flow reaches this point (FR-K1 compliance).
   *
   * @param params - Route/user/URL/type for the new media row
   */
  createRouteMedia(params: {
    routeId: string;
    userId: string;
    url: string;
    type: string;
  }) {
    return supabase
      .from('route_media')
      .insert({
        route_id: params.routeId,
        user_id: params.userId,
        url: params.url,
        type: params.type,
        ownership_affirmed: true,
      })
      .select()
      .single();
  },

  /**
   * Count how many videos a user uploaded in the last 7 days.
   *
   * Used for beta limit enforcement: free-tier users are capped at
   * `FREE_TIER.betaPerWeek` (5) uploads per rolling 7-day window.
   * The Paywall shows when this limit is reached.
   *
   * Uses `head: true` with `count: 'exact'` for an efficient COUNT query —
   * no row data is transferred over the wire, just the count value.
   *
   * @param userId - The user to count uploads for
   */
  getWeeklyUploadCount(userId: string) {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return supabase
      .from('route_media')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneWeekAgo);
  },

  /**
   * Fetch which media IDs the given user has liked.
   *
   * Used by useRouteMedia to build a Set<string> of liked media IDs
   * so the UI can show filled/outlined hearts. The `.in()` filter
   * fetches likes for all media in one query (batch, not N+1).
   *
   * @param mediaIds - Array of route_media IDs to check
   * @param userId - The current user's ID
   */
  getUserLikes(mediaIds: string[], userId: string) {
    return supabase
      .from('route_media_likes')
      .select('media_id')
      .eq('user_id', userId)
      .in('media_id', mediaIds);
  },

  /**
   * Like a video — insert a row into route_media_likes, then update
   * the denormalized likes_count on route_media.
   *
   * The count is recalculated via a real COUNT query rather than
   * incrementing, which avoids drift if concurrent likes happen.
   *
   * @param mediaId - The route_media row to like
   * @param userId - The user doing the liking
   */
  async likeMedia(mediaId: string, userId: string) {
    // Insert the like row (composite PK prevents duplicates).
    // The likes_count on route_media is updated automatically by a
    // Postgres trigger (SECURITY DEFINER), which bypasses RLS — the
    // client can't update other users' route_media rows directly.
    const { error } = await supabase
      .from('route_media_likes')
      .insert({ media_id: mediaId, user_id: userId });

    return { data: null, error };
  },

  /**
   * Unlike a video — delete the like row, then recalculate likes_count.
   *
   * Mirror of likeMedia: remove the row, recount, update. The recount
   * approach is safer than decrementing because it handles edge cases
   * (double-unlike, concurrent operations) without going negative.
   *
   * @param mediaId - The route_media row to unlike
   * @param userId - The user removing their like
   */
  async unlikeMedia(mediaId: string, userId: string) {
    // Delete the like row. The trigger on route_media_likes automatically
    // decrements likes_count on route_media.
    const { error } = await supabase
      .from('route_media_likes')
      .delete()
      .eq('media_id', mediaId)
      .eq('user_id', userId);

    return { data: null, error };
  },

  /**
   * Delete a video's DB row.
   *
   * Only removes the route_media metadata row. The actual video file
   * lives on Cloudinary and can be cleaned up later via Cloudinary's
   * admin API if needed (e.g., a scheduled cleanup job).
   *
   * @param mediaId - The route_media row ID
   */
  async deleteMedia(mediaId: string) {
    const { error } = await supabase
      .from('route_media')
      .delete()
      .eq('id', mediaId);

    return { data: null, error };
  },
};
