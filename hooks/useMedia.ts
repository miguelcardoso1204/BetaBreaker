/**
 * Media Hooks — TanStack Query Wrappers for Beta Video Uploads
 *
 * These hooks provide reactive data and mutations for the video
 * upload feature on route detail and ascent form screens.
 *
 * HOOK BREAKDOWN:
 *   - `useRouteMedia(routeId)` — QUERY: fetches all media for a route
 *   - `useUploadVideo(routeId)` — MUTATION: upload to Cloudinary → link to route
 *   - `useDeleteMedia(routeId)` — MUTATION: remove DB row
 *
 * All mutations invalidate the ["routeMedia", routeId] query key on
 * completion, causing useRouteMedia to refetch fresh data. This keeps
 * the media list consistent after every upload or deletion.
 *
 * UPLOAD FLOW (two steps chained in one mutation):
 *   1. Upload video to Cloudinary via unsigned preset (lib/cloudinary.ts)
 *   2. Insert a route_media row linking the Cloudinary URL to the route
 * If either step fails, the mutation throws and the UI shows the error.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mediaService } from '@/services/media.service';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { useAuth } from '@/hooks/useAuth';

/**
 * Fetch all media for a route (videos + images), plus the current
 * user's likes.
 *
 * Returns a reactive list of media items with uploader profile info,
 * and a Set<string> of media IDs the current user has liked. The like
 * set enables the UI to show filled/outlined hearts without a separate
 * query per video.
 *
 * @param routeId - The route to fetch media for
 */
export function useRouteMedia(routeId: string) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['routeMedia', routeId],
    queryFn: async () => {
      // Fetch media items with uploader profile info
      const result = await mediaService.getRouteMedia(routeId);
      if (result.error) throw result.error;
      const media = result.data ?? [];

      // Fetch which of these media the current user has liked.
      // Skip if no media or no user (avoids an empty `.in()` call).
      //
      // WHY a plain array instead of a Set?
      // TanStack Query's structuralSharing (enabled by default) uses
      // replaceEqualDeep to compare old and new cache values. This works
      // for plain objects and arrays but corrupts Set instances — it can't
      // deep-compare them and may replace or mangle them. Storing liked IDs
      // as string[] in the cache avoids this. We convert to Set in the
      // return value for O(1) lookups in the UI.
      let likedIds: string[] = [];
      if (media.length > 0 && user?.id) {
        const likesResult = await mediaService.getUserLikes(
          media.map((m: any) => m.id),
          user.id
        );
        if (likesResult.data) {
          likedIds = likesResult.data.map((l: any) => l.media_id);
        }
      }

      return { media, likedIds };
    },
  });

  return {
    media: query.data?.media ?? [],
    userLikes: new Set(query.data?.likedIds ?? []),
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Mutation to upload a video and link it to a route.
 *
 * The mutation chains two steps:
 *   1. uploadToCloudinary — sends the file to Cloudinary's upload API
 *   2. createRouteMedia — inserts the DB row linking video URL to route
 *
 * The caller provides { uri, mimeType }. The userId comes from the
 * auth context automatically.
 *
 * @param routeId - The route to associate the video with
 */
export function useUploadVideo(routeId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      uri,
      mimeType,
    }: {
      uri: string;
      mimeType: string;
    }) => {
      if (!user?.id) throw new Error('Must be logged in to upload');

      // Step 1: Upload the video file to Cloudinary
      const { url } = await uploadToCloudinary(uri, mimeType);

      // Step 2: Create the route_media DB row with the Cloudinary URL
      const dbResult = await mediaService.createRouteMedia({
        routeId,
        userId: user.id,
        url,
        type: 'video',
      });
      if (dbResult.error) throw dbResult.error;

      return dbResult.data;
    },
    // Refetch the media list after upload so the new video appears
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['routeMedia', routeId] });
    },
  });
}

/**
 * Mutation to delete a video (DB row only).
 *
 * The Cloudinary file is left in place — cleanup can be done later
 * via Cloudinary's admin API if needed.
 *
 * @param routeId - Used for cache invalidation after deletion
 */
export function useDeleteMedia(routeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mediaId }: { mediaId: string }) => {
      const result = await mediaService.deleteMedia(mediaId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['routeMedia', routeId] });
    },
  });
}

/**
 * Mutation to like or unlike a video.
 *
 * Takes `{ mediaId, liked }` — if `liked` is true the video is already
 * liked and this call will unlike it; if false, this call will like it.
 * This toggle pattern matches the heart button behavior in the UI.
 *
 * Uses an optimistic update for instant heart feedback, then refetches
 * on settle to reconcile with the server (picks up other users' likes
 * and corrects any failed optimistic update).
 *
 * @param routeId - Used for cache invalidation after the mutation
 */
export function useLikeMedia(routeId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mediaId, liked }: { mediaId: string; liked: boolean }) => {
      if (!user?.id) throw new Error('Must be logged in to like');

      // Toggle: if already liked → unlike, otherwise → like
      const result = liked
        ? await mediaService.unlikeMedia(mediaId, user.id)
        : await mediaService.likeMedia(mediaId, user.id);

      if (result.error) throw result.error;
    },

    // Optimistic update: immediately flip the heart and adjust the count
    // so the user sees instant feedback when they tap.
    onMutate: async ({ mediaId, liked }) => {
      // Cancel in-flight refetches so they don't overwrite our optimistic state
      await queryClient.cancelQueries({ queryKey: ['routeMedia', routeId] });

      queryClient.setQueryData(['routeMedia', routeId], (old: any) => {
        if (!old) return old;
        return {
          media: old.media.map((m: any) =>
            m.id === mediaId
              ? { ...m, likes_count: liked ? Math.max(0, (m.likes_count ?? 0) - 1) : (m.likes_count ?? 0) + 1 }
              : m
          ),
          likedIds: liked
            ? (old.likedIds ?? []).filter((id: string) => id !== mediaId)
            : [...(old.likedIds ?? []), mediaId],
        };
      });
    },

    // Refetch after the mutation (success or error) so the server's
    // likes_count and liked state replace the optimistic values. This
    // picks up other users' likes and corrects any failed optimistic update.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['routeMedia', routeId] });
    },
  });
}
