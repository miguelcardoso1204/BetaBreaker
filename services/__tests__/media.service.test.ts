/**
 * Media Service Tests (Step 12.1)
 *
 * Tests the mediaService methods that handle route_media database operations.
 * Video files are uploaded directly to Cloudinary (see lib/cloudinary.ts) —
 * this service only manages the DB rows that link Cloudinary URLs to routes.
 *
 * Mock strategy: same as feedback.service.test.ts — mock @/lib/supabase
 * inside the jest.mock() factory (hoisting-safe), then configure chain
 * mocks per test.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { mediaService } from '../media.service';

const { supabase } = jest.requireMock<{
  supabase: {
    from: jest.Mock;
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
          url: 'https://res.cloudinary.com/degmzs0et/video/upload/v123/beta-videos/video.mp4',
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
        '*, profile:profiles!route_media_user_id_fkey(display_name, avatar_url)'
      );
      expect(chainMock.eq).toHaveBeenCalledWith('route_id', 'route-1');
      expect(chainMock.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(result.data).toEqual(mockMedia);
    });
  });

  // ── createRouteMedia ────────────────────────────────────────────

  describe('createRouteMedia', () => {
    it('inserts a route_media row linking the video to the route', async () => {
      // After uploading the file to Cloudinary, we need a DB row to
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
            url: 'https://res.cloudinary.com/degmzs0et/video/upload/v123/beta-videos/video.mp4',
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
        url: 'https://res.cloudinary.com/degmzs0et/video/upload/v123/beta-videos/video.mp4',
        type: 'video',
      });

      expect(supabase.from).toHaveBeenCalledWith('route_media');
      expect(chainMock.insert).toHaveBeenCalledWith({
        route_id: 'route-1',
        user_id: 'user-1',
        url: 'https://res.cloudinary.com/degmzs0et/video/upload/v123/beta-videos/video.mp4',
        type: 'video',
        ownership_affirmed: true,
      });
      expect(result.data?.id).toBe('media-1');
    });
  });

  // ── deleteMedia ─────────────────────────────────────────────────

  describe('deleteMedia', () => {
    it('deletes the route_media DB row', async () => {
      // Deletion only removes the DB row. The Cloudinary file is left
      // in place — cleanup via Cloudinary admin API can happen later.
      const dbChainMock = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(dbChainMock);

      const result = await mediaService.deleteMedia('media-1');

      expect(supabase.from).toHaveBeenCalledWith('route_media');
      expect(dbChainMock.delete).toHaveBeenCalled();
      expect(dbChainMock.eq).toHaveBeenCalledWith('id', 'media-1');
      expect(result.error).toBeNull();
    });

    it('returns error if DB deletion fails', async () => {
      const dbChainMock = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Not found' },
        }),
      };
      supabase.from.mockReturnValueOnce(dbChainMock);

      const result = await mediaService.deleteMedia('media-1');

      expect(result.error).toEqual({ message: 'Not found' });
    });
  });

  // ── getUserLikes ───────────────────────────────────────────────

  describe('getUserLikes', () => {
    it('fetches user likes for given media IDs', async () => {
      // The route detail screen needs to know which videos the current
      // user has liked so it can show filled hearts. This method fetches
      // that in one batched query using `.in()`.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: [{ media_id: 'media-1' }],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await mediaService.getUserLikes(
        ['media-1', 'media-2'],
        'user-1'
      );

      expect(supabase.from).toHaveBeenCalledWith('route_media_likes');
      expect(chainMock.select).toHaveBeenCalledWith('media_id');
      expect(chainMock.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chainMock.in).toHaveBeenCalledWith('media_id', [
        'media-1',
        'media-2',
      ]);
      expect(result.data).toEqual([{ media_id: 'media-1' }]);
    });
  });

  // ── likeMedia ─────────────────────────────────────────────────

  describe('likeMedia', () => {
    it('inserts a like row (trigger handles likes_count)', async () => {
      // The service just inserts into route_media_likes. A Postgres
      // trigger (SECURITY DEFINER) automatically updates likes_count
      // on route_media — the client can't do it due to RLS.
      const insertChain = {
        insert: jest.fn().mockResolvedValueOnce({ error: null }),
      };
      supabase.from.mockReturnValueOnce(insertChain);

      const result = await mediaService.likeMedia('media-1', 'user-1');

      expect(supabase.from).toHaveBeenCalledWith('route_media_likes');
      expect(insertChain.insert).toHaveBeenCalledWith({
        media_id: 'media-1',
        user_id: 'user-1',
      });
      expect(result.error).toBeNull();
    });

    it('returns error if insert fails', async () => {
      const insertChain = {
        insert: jest.fn().mockResolvedValueOnce({
          error: { message: 'Duplicate' },
        }),
      };
      supabase.from.mockReturnValueOnce(insertChain);

      const result = await mediaService.likeMedia('media-1', 'user-1');

      expect(result.error).toEqual({ message: 'Duplicate' });
    });
  });

  // ── unlikeMedia ───────────────────────────────────────────────

  describe('unlikeMedia', () => {
    it('deletes the like row (trigger handles likes_count)', async () => {
      // The service just deletes from route_media_likes. The trigger
      // recalculates likes_count automatically.
      const deleteChain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      deleteChain.eq
        .mockReturnValueOnce(deleteChain) // first .eq('media_id')
        .mockResolvedValueOnce({ error: null }); // second .eq('user_id')

      supabase.from.mockReturnValueOnce(deleteChain);

      const result = await mediaService.unlikeMedia('media-1', 'user-1');

      expect(supabase.from).toHaveBeenCalledWith('route_media_likes');
      expect(deleteChain.delete).toHaveBeenCalled();
      expect(result.error).toBeNull();
    });

    it('returns error if delete fails', async () => {
      const deleteChain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      deleteChain.eq
        .mockReturnValueOnce(deleteChain)
        .mockResolvedValueOnce({ error: { message: 'Not found' } });

      supabase.from.mockReturnValueOnce(deleteChain);

      const result = await mediaService.unlikeMedia('media-1', 'user-1');

      expect(result.error).toEqual({ message: 'Not found' });
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
});
