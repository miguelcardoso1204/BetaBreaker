/**
 * useMedia Hook Tests (Step 12.1)
 *
 * Tests the TanStack Query hooks that orchestrate video upload, retrieval,
 * and deletion. These hooks wrap mediaService and manage cache invalidation.
 *
 * Mock strategy:
 *   - Mock mediaService (not Supabase) — hooks don't know about PostgREST
 *   - Mock uploadToCloudinary (not the network) — hooks call it as a function
 *   - Mock useAuth to provide a stable user ID
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mock mediaService ─────────────────────────────────────────────
jest.mock('@/services/media.service', () => ({
  mediaService: {
    getRouteMedia: jest.fn(),
    createRouteMedia: jest.fn(),
    deleteMedia: jest.fn(),
    getUserLikes: jest.fn(),
    likeMedia: jest.fn(),
    unlikeMedia: jest.fn(),
  },
}));

// ── Mock Cloudinary upload ────────────────────────────────────────
jest.mock('@/lib/cloudinary', () => ({
  uploadToCloudinary: jest.fn(),
}));

// ── Mock useAuth ──────────────────────────────────────────────────
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: { user: { id: 'user-1' } },
    isAuthenticated: true,
  }),
}));

import { useRouteMedia, useUploadVideo, useDeleteMedia, useLikeMedia } from '../useMedia';

const { mediaService } = jest.requireMock<{
  mediaService: {
    getRouteMedia: jest.Mock;
    createRouteMedia: jest.Mock;
    deleteMedia: jest.Mock;
    getUserLikes: jest.Mock;
    likeMedia: jest.Mock;
    unlikeMedia: jest.Mock;
  };
}>('@/services/media.service');

const { uploadToCloudinary } = jest.requireMock<{
  uploadToCloudinary: jest.Mock;
}>('@/lib/cloudinary');

// ── Test wrapper ──────────────────────────────────────────────────
// TanStack Query hooks need a QueryClientProvider. Fresh client per
// test prevents cache leakage between tests.

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// ── useRouteMedia ─────────────────────────────────────────────────

describe('useRouteMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns media data and user likes from service', async () => {
    // The hook fetches media + which ones the current user has liked.
    // Both are combined in a single query function so the UI gets
    // everything it needs in one render cycle.
    const mockMedia = [
      {
        id: 'media-1',
        route_id: 'route-1',
        user_id: 'user-2',
        url: 'https://res.cloudinary.com/degmzs0et/video/upload/v123/beta-videos/video.mp4',
        type: 'video',
        likes_count: 2,
        created_at: '2026-02-12T00:00:00Z',
        profile: { display_name: 'Alex', avatar_url: null },
      },
    ];

    mediaService.getRouteMedia.mockResolvedValueOnce({
      data: mockMedia,
      error: null,
    });
    // getUserLikes returns the media IDs the user has liked
    mediaService.getUserLikes.mockResolvedValueOnce({
      data: [{ media_id: 'media-1' }],
      error: null,
    });

    const { result } = renderHook(() => useRouteMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.media).toEqual(mockMedia);
    // userLikes is a Set built from the likedIds array in the cache.
    // The hook converts the plain array to a Set for O(1) lookups.
    expect(result.current.userLikes).toBeInstanceOf(Set);
    expect(result.current.userLikes.has('media-1')).toBe(true);
    expect(mediaService.getRouteMedia).toHaveBeenCalledWith('route-1');
    expect(mediaService.getUserLikes).toHaveBeenCalledWith(
      ['media-1'],
      'user-1'
    );
  });

  it('returns empty array and empty set when no media exists', async () => {
    mediaService.getRouteMedia.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useRouteMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.media).toEqual([]);
    expect(result.current.userLikes.size).toBe(0);
    // getUserLikes should NOT be called when there's no media
    expect(mediaService.getUserLikes).not.toHaveBeenCalled();
  });

  it('exposes error from service failure', async () => {
    mediaService.getRouteMedia.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network error' },
    });

    const { result } = renderHook(() => useRouteMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});

// ── useUploadVideo ────────────────────────────────────────────────

describe('useUploadVideo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chains Cloudinary upload → createRouteMedia', async () => {
    // The upload mutation is a two-step process:
    // 1. Upload file to Cloudinary
    // 2. Create a route_media DB row linking the video URL to the route
    const cloudinaryUrl =
      'https://res.cloudinary.com/degmzs0et/video/upload/v123/beta-videos/abc.mp4';

    uploadToCloudinary.mockResolvedValueOnce({
      url: cloudinaryUrl,
      publicId: 'beta-videos/abc',
    });

    mediaService.createRouteMedia.mockResolvedValueOnce({
      data: { id: 'media-1' },
      error: null,
    });

    const { result } = renderHook(() => useUploadVideo('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        uri: 'file:///video.mp4',
        mimeType: 'video/mp4',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify the two-step chain
    expect(uploadToCloudinary).toHaveBeenCalledWith(
      'file:///video.mp4',
      'video/mp4'
    );
    expect(mediaService.createRouteMedia).toHaveBeenCalledWith({
      routeId: 'route-1',
      userId: 'user-1',
      url: cloudinaryUrl,
      type: 'video',
    });
  });

  it('throws if Cloudinary upload fails', async () => {
    uploadToCloudinary.mockRejectedValueOnce(
      new Error('Cloudinary upload failed: 400')
    );

    const { result } = renderHook(() => useUploadVideo('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        uri: 'file:///video.mp4',
        mimeType: 'video/mp4',
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // createRouteMedia should NOT have been called
    expect(mediaService.createRouteMedia).not.toHaveBeenCalled();
  });

  it('throws if createRouteMedia fails', async () => {
    uploadToCloudinary.mockResolvedValueOnce({
      url: 'https://res.cloudinary.com/degmzs0et/video/upload/v123/beta-videos/abc.mp4',
      publicId: 'beta-videos/abc',
    });
    mediaService.createRouteMedia.mockResolvedValueOnce({
      data: null,
      error: { message: 'RLS violation' },
    });

    const { result } = renderHook(() => useUploadVideo('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        uri: 'file:///video.mp4',
        mimeType: 'video/mp4',
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ── useDeleteMedia ────────────────────────────────────────────────

describe('useDeleteMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls deleteMedia with mediaId', async () => {
    mediaService.deleteMedia.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ mediaId: 'media-1' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mediaService.deleteMedia).toHaveBeenCalledWith('media-1');
  });

  it('throws if deleteMedia returns an error', async () => {
    mediaService.deleteMedia.mockResolvedValueOnce({
      data: null,
      error: { message: 'Not found' },
    });

    const { result } = renderHook(() => useDeleteMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ mediaId: 'media-1' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ── useLikeMedia ──────────────────────────────────────────────────

describe('useLikeMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls likeMedia when liked is false (not yet liked)', async () => {
    // When the video is not liked, the mutation should call likeMedia
    // to add the like.
    mediaService.likeMedia.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useLikeMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ mediaId: 'media-1', liked: false });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mediaService.likeMedia).toHaveBeenCalledWith('media-1', 'user-1');
    expect(mediaService.unlikeMedia).not.toHaveBeenCalled();
  });

  it('calls unlikeMedia when liked is true (already liked)', async () => {
    // When the video is already liked, the mutation should call unlikeMedia
    // to remove the like (toggle behavior).
    mediaService.unlikeMedia.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useLikeMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ mediaId: 'media-1', liked: true });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mediaService.unlikeMedia).toHaveBeenCalledWith('media-1', 'user-1');
    expect(mediaService.likeMedia).not.toHaveBeenCalled();
  });

  it('throws if the service returns an error', async () => {
    mediaService.likeMedia.mockResolvedValueOnce({
      data: null,
      error: { message: 'RLS violation' },
    });

    const { result } = renderHook(() => useLikeMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ mediaId: 'media-1', liked: false });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
