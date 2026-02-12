/**
 * Media Hooks — TanStack Query Wrappers for Beta Video Uploads
 *
 * These hooks provide reactive data and mutations for the video
 * upload feature on route detail and ascent form screens.
 *
 * HOOK BREAKDOWN:
 *   - `useRouteMedia(routeId)` — QUERY: fetches all media for a route
 *   - `useUploadVideo(routeId)` — MUTATION: upload file → link to route
 *   - `useDeleteMedia(routeId)` — MUTATION: remove file + DB row
 *
 * All mutations invalidate the ["routeMedia", routeId] query key on
 * completion, causing useRouteMedia to refetch fresh data. This keeps
 * the media list consistent after every upload or deletion.
 *
 * UPLOAD FLOW (three steps chained in one mutation):
 *   1. Upload blob to Supabase Storage (beta-videos bucket)
 *   2. Get the public URL for the uploaded file
 *   3. Insert a route_media row linking the URL to the route
 * If any step fails, the mutation throws and the UI shows the error.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mediaService } from '@/services/media.service';
import { useAuth } from '@/hooks/useAuth';

/**
 * Fetch all media for a route (videos + images).
 *
 * Returns a reactive list of media items with uploader profile info.
 * The query auto-refetches when the cache is invalidated by upload
 * or delete mutations.
 *
 * @param routeId - The route to fetch media for
 */
export function useRouteMedia(routeId: string) {
  const query = useQuery({
    queryKey: ['routeMedia', routeId],
    queryFn: async () => {
      const result = await mediaService.getRouteMedia(routeId);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });

  return {
    media: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Mutation to upload a video and link it to a route.
 *
 * The mutation chains three service calls:
 *   1. uploadVideoFile — sends the blob to Storage
 *   2. getPublicUrl — resolves the public URL for playback
 *   3. createRouteMedia — inserts the DB row linking video to route
 *
 * The caller provides { blob, storagePath, mimeType }. The userId
 * comes from the auth context automatically.
 *
 * @param routeId - The route to associate the video with
 */
export function useUploadVideo(routeId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      blob,
      storagePath,
      mimeType,
    }: {
      blob: Blob;
      storagePath: string;
      mimeType: string;
    }) => {
      if (!user?.id) throw new Error('Must be logged in to upload');

      // Step 1: Upload the file to Supabase Storage
      const uploadResult = await mediaService.uploadVideoFile(
        blob,
        storagePath,
        mimeType
      );
      if (uploadResult.error) throw uploadResult.error;

      // Step 2: Get the public URL for the uploaded file
      const publicUrl = mediaService.getPublicUrl(storagePath);

      // Step 3: Create the route_media DB row
      const dbResult = await mediaService.createRouteMedia({
        routeId,
        userId: user.id,
        url: publicUrl,
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
 * Mutation to delete a video (Storage file + DB row).
 *
 * The caller provides { mediaId, storagePath }. The service handles
 * the two-step deletion: remove file first, then delete DB row.
 *
 * @param routeId - Used for cache invalidation after deletion
 */
export function useDeleteMedia(routeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      mediaId,
      storagePath,
    }: {
      mediaId: string;
      storagePath: string;
    }) => {
      const result = await mediaService.deleteMedia(mediaId, storagePath);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['routeMedia', routeId] });
    },
  });
}
