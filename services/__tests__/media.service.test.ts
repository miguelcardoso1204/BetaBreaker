/**
 * Media Service Tests (Step 12.1)
 *
 * Tests the mediaService methods that handle video uploads, retrieval,
 * and deletion for beta videos. The service wraps both Supabase Storage
 * (file upload/delete) and the route_media database table.
 *
 * Mock strategy: same as feedback.service.test.ts — mock @/lib/supabase
 * inside the jest.mock() factory (hoisting-safe), then configure chain
 * mocks per test.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  },
}));

import { mediaService } from '../media.service';

const { supabase } = jest.requireMock<{
  supabase: {
    from: jest.Mock;
    storage: { from: jest.Mock };
  };
}>('@/lib/supabase');

describe('mediaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getRouteMedia ───────────────────────────────────────────────

  describe('getRouteMedia', () => {
    it('fetches media for a route with profile join, ordered by newest first', async () => {
      // Media list shows uploader name + timestamp, so we need the
      // profile join. Newest videos first so fresh content is at the top.
      const mockMedia = [
        {
          id: 'media-1',
          route_id: 'route-1',
          user_id: 'user-1',
          url: 'https://example.com/video.mp4',
          type: 'video',
          ownership_affirmed: true,
          created_at: '2026-02-12T00:00:00Z',
          profile: { display_name: 'Alex', avatar_url: null },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockMedia,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await mediaService.getRouteMedia('route-1');

      expect(supabase.from).toHaveBeenCalledWith('route_media');
      expect(chainMock.select).toHaveBeenCalledWith(
        '*, profile:profiles(display_name, avatar_url)'
      );
      expect(chainMock.eq).toHaveBeenCalledWith('route_id', 'route-1');
      expect(chainMock.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(result.data).toEqual(mockMedia);
    });
  });

  // ── uploadVideoFile ─────────────────────────────────────────────

  describe('uploadVideoFile', () => {
    it('uploads a blob to the beta-videos bucket at the given path', async () => {
      // The service uploads the raw file to Supabase Storage using the
      // beta-videos bucket. The path includes the user ID for policy enforcement.
      const mockBlob = new Blob(['fake-video-data'], { type: 'video/mp4' });

      const uploadMock = jest.fn().mockResolvedValueOnce({
        data: { path: 'user-1/route-1/12345.mp4' },
        error: null,
      });
      supabase.storage.from.mockReturnValueOnce({ upload: uploadMock });

      const result = await mediaService.uploadVideoFile(
        mockBlob,
        'user-1/route-1/12345.mp4',
        'video/mp4'
      );

      expect(supabase.storage.from).toHaveBeenCalledWith('beta-videos');
      expect(uploadMock).toHaveBeenCalledWith(
        'user-1/route-1/12345.mp4',
        mockBlob,
        { contentType: 'video/mp4' }
      );
      expect(result.data).toEqual({ path: 'user-1/route-1/12345.mp4' });
    });

    it('returns error on upload failure', async () => {
      const mockBlob = new Blob(['data']);
      const uploadMock = jest.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Payload too large' },
      });
      supabase.storage.from.mockReturnValueOnce({ upload: uploadMock });

      const result = await mediaService.uploadVideoFile(
        mockBlob,
        'path.mp4',
        'video/mp4'
      );

      expect(result.error).toEqual({ message: 'Payload too large' });
    });
  });

  // ── getPublicUrl ────────────────────────────────────────────────

  describe('getPublicUrl', () => {
    it('returns the public URL for a storage path', () => {
      // Public URLs don't need auth — the bucket is public, so anyone
      // can load the video for playback.
      const getPublicUrlMock = jest.fn().mockReturnValueOnce({
        data: { publicUrl: 'https://storage.example.com/beta-videos/user-1/route-1/12345.mp4' },
      });
      supabase.storage.from.mockReturnValueOnce({ getPublicUrl: getPublicUrlMock });

      const result = mediaService.getPublicUrl('user-1/route-1/12345.mp4');

      expect(supabase.storage.from).toHaveBeenCalledWith('beta-videos');
      expect(getPublicUrlMock).toHaveBeenCalledWith('user-1/route-1/12345.mp4');
      expect(result).toBe(
        'https://storage.example.com/beta-videos/user-1/route-1/12345.mp4'
      );
    });
  });

  // ── createRouteMedia ────────────────────────────────────────────

  describe('createRouteMedia', () => {
    it('inserts a route_media row linking the video to the route', async () => {
      // After uploading the file to Storage, we need a DB row to
      // associate it with the route. ownership_affirmed is always true
      // because the user confirmed via the OwnershipModal.
      const chainMock = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: {
            id: 'media-1',
            route_id: 'route-1',
            user_id: 'user-1',
            url: 'https://example.com/video.mp4',
            type: 'video',
            ownership_affirmed: true,
          },
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await mediaService.createRouteMedia({
        routeId: 'route-1',
        userId: 'user-1',
        url: 'https://example.com/video.mp4',
        type: 'video',
      });

      expect(supabase.from).toHaveBeenCalledWith('route_media');
      expect(chainMock.insert).toHaveBeenCalledWith({
        route_id: 'route-1',
        user_id: 'user-1',
        url: 'https://example.com/video.mp4',
        type: 'video',
        ownership_affirmed: true,
      });
      expect(result.data?.id).toBe('media-1');
    });
  });

  // ── deleteMedia ─────────────────────────────────────────────────

  describe('deleteMedia', () => {
    it('removes file from storage then deletes the DB row', async () => {
      // Deletion is a two-step process: remove the physical file from
      // Storage, then delete the metadata row from route_media.
      // We do storage first because losing the DB reference to an
      // orphaned file is worse than a DB row pointing to a missing file.
      const removeMock = jest.fn().mockResolvedValueOnce({
        data: [{ name: 'user-1/route-1/12345.mp4' }],
        error: null,
      });
      supabase.storage.from.mockReturnValueOnce({ remove: removeMock });

      const dbChainMock = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(dbChainMock);

      const result = await mediaService.deleteMedia(
        'media-1',
        'user-1/route-1/12345.mp4'
      );

      // Storage removal first
      expect(supabase.storage.from).toHaveBeenCalledWith('beta-videos');
      expect(removeMock).toHaveBeenCalledWith(['user-1/route-1/12345.mp4']);

      // Then DB deletion
      expect(supabase.from).toHaveBeenCalledWith('route_media');
      expect(dbChainMock.delete).toHaveBeenCalled();
      expect(dbChainMock.eq).toHaveBeenCalledWith('id', 'media-1');
      expect(result.error).toBeNull();
    });

    it('returns storage error if file removal fails', async () => {
      const removeMock = jest.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'File not found' },
      });
      supabase.storage.from.mockReturnValueOnce({ remove: removeMock });

      const result = await mediaService.deleteMedia('media-1', 'bad/path.mp4');

      // Should return the storage error without attempting DB deletion
      expect(result.error).toEqual({ message: 'File not found' });
      // DB delete should NOT have been called
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // ── getWeeklyUploadCount ────────────────────────────────────────

  describe('getWeeklyUploadCount', () => {
    it('counts uploads from the last 7 days using exact count query', async () => {
      // Beta limit enforcement: free users are capped at 5 uploads/week.
      // We use Supabase's `count: 'exact', head: true` for an efficient
      // COUNT query — no rows are transferred, just the count.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValueOnce({ count: 3, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      // Freeze time so we can assert the date threshold
      const now = new Date('2026-02-16T12:00:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());

      const result = await mediaService.getWeeklyUploadCount('user-1');

      expect(supabase.from).toHaveBeenCalledWith('route_media');
      // head: true + count: 'exact' tells PostgREST to return only the count
      expect(chainMock.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
      expect(chainMock.eq).toHaveBeenCalledWith('user_id', 'user-1');
      // Should filter to uploads from 7 days ago
      const expectedDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      expect(chainMock.gte).toHaveBeenCalledWith('created_at', expectedDate);
      expect(result.count).toBe(3);

      jest.restoreAllMocks();
    });
  });

  // ── extractStoragePath ──────────────────────────────────────────

  describe('extractStoragePath', () => {
    it('extracts the storage path from a full public URL', () => {
      // When deleting, we have the full public URL from the DB row
      // but need just the path portion for the Storage API.
      const url =
        'https://nuffoxarlcxnllatycdu.supabase.co/storage/v1/object/public/beta-videos/user-1/route-1/12345.mp4';
      const path = mediaService.extractStoragePath(url);
      expect(path).toBe('user-1/route-1/12345.mp4');
    });

    it('handles local dev URLs', () => {
      const url =
        'http://127.0.0.1:54321/storage/v1/object/public/beta-videos/user-1/route-1/12345.mp4';
      const path = mediaService.extractStoragePath(url);
      expect(path).toBe('user-1/route-1/12345.mp4');
    });
  });
});
