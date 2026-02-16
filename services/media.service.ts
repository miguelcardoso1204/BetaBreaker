/**
 * Media Service — Supabase Storage + route_media Table
 *
 * Handles the full lifecycle of beta video uploads:
 *   1. Upload: file → Supabase Storage (beta-videos bucket)
 *   2. Link: Storage URL → route_media DB row (ties video to route)
 *   3. Read: fetch all media for a route (with uploader profile)
 *   4. Delete: remove from Storage, then delete DB row
 *
 * The service separates Storage operations (file bytes) from DB operations
 * (metadata rows) because they use different Supabase APIs:
 *   - `supabase.storage.from('beta-videos')` — file upload/delete/URL
 *   - `supabase.from('route_media')` — PostgREST CRUD
 *
 * BUCKET PATH FORMAT: <user_id>/<route_id>/<timestamp>.<ext>
 * The user_id prefix is enforced by the Storage INSERT policy — users
 * can only upload to their own folder. This prevents impersonation.
 */

import { supabase } from '@/lib/supabase';
import { VIDEO_STORAGE_BUCKET } from '@/utils/videoValidation';

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
      .select('*, profile:profiles(display_name, avatar_url)')
      .eq('route_id', routeId)
      .order('created_at', { ascending: false });
  },

  /**
   * Upload a video file (as a Blob) to the beta-videos Storage bucket.
   *
   * The storagePath must start with the authenticated user's ID, or the
   * Storage INSERT policy will reject it. The caller is responsible for
   * building the path via `buildStoragePath()`.
   *
   * @param blob - The video file data
   * @param storagePath - Path within the bucket (e.g., "user-1/route-1/123.mp4")
   * @param mimeType - MIME type for the Content-Type header
   */
  uploadVideoFile(blob: Blob, storagePath: string, mimeType: string) {
    return supabase.storage
      .from(VIDEO_STORAGE_BUCKET)
      .upload(storagePath, blob, { contentType: mimeType });
  },

  /**
   * Get the public URL for an uploaded video.
   *
   * The beta-videos bucket is public, so the returned URL works without
   * auth headers — anyone can load the video for playback.
   *
   * @param storagePath - Path within the bucket
   * @returns The full public URL string
   */
  getPublicUrl(storagePath: string): string {
    const { data } = supabase.storage
      .from(VIDEO_STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    return data.publicUrl;
  },

  /**
   * Insert a route_media row linking an uploaded video to a route.
   *
   * Called after a successful Storage upload. The ownership_affirmed flag
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
   * Delete a video — removes the file from Storage, then the DB row.
   *
   * Order matters: we delete the file first because an orphaned file
   * (no DB row) is worse than a DB row pointing to a missing file.
   * If Storage deletion fails, we abort without touching the DB.
   *
   * @param mediaId - The route_media row ID
   * @param storagePath - Path within the bucket for file removal
   */
  async deleteMedia(mediaId: string, storagePath: string) {
    // Step 1: Remove the physical file from Storage
    const { error: storageError } = await supabase.storage
      .from(VIDEO_STORAGE_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      return { data: null, error: storageError };
    }

    // Step 2: Delete the metadata row from route_media
    const { error: dbError } = await supabase
      .from('route_media')
      .delete()
      .eq('id', mediaId);

    return { data: null, error: dbError };
  },

  /**
   * Extract the storage path from a full public URL.
   *
   * When deleting, we have the URL from the DB row but need just the
   * bucket-relative path for `supabase.storage.from().remove()`.
   *
   * URL format: https://<host>/storage/v1/object/public/beta-videos/<path>
   * We split on the bucket name and take everything after it.
   *
   * @param url - Full public URL from the route_media row
   * @returns The bucket-relative storage path
   */
  extractStoragePath(url: string): string {
    const marker = `${VIDEO_STORAGE_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return url;
    return url.slice(idx + marker.length);
  },
};
