/**
 * useMedia Hook Tests (Step 12.1)
 *
 * Tests the TanStack Query hooks that orchestrate video upload, retrieval,
 * and deletion. These hooks wrap mediaService and manage cache invalidation.
 *
 * Mock strategy (matching useFeedback.test.tsx):
 *   - Mock mediaService (not Supabase) — hooks don't know about PostgREST
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
    uploadVideoFile: jest.fn(),
    getPublicUrl: jest.fn(),
    createRouteMedia: jest.fn(),
    deleteMedia: jest.fn(),
    extractStoragePath: jest.fn(),
  },
}));

// ── Mock useAuth ──────────────────────────────────────────────────
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: { user: { id: 'user-1' } },
    isAuthenticated: true,
  }),
}));

import { useRouteMedia, useUploadVideo, useDeleteMedia } from '../useMedia';

const { mediaService } = jest.requireMock<{
  mediaService: {
    getRouteMedia: jest.Mock;
    uploadVideoFile: jest.Mock;
    getPublicUrl: jest.Mock;
    createRouteMedia: jest.Mock;
    deleteMedia: jest.Mock;
    extractStoragePath: jest.Mock;
  };
}>('@/services/media.service');

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

  it('returns media data from service', async () => {
    // The hook should fetch media for the route and expose
    // it as a reactive array.
    const mockMedia = [
      {
        id: 'media-1',
        route_id: 'route-1',
        user_id: 'user-2',
        url: 'https://example.com/video.mp4',
        type: 'video',
        created_at: '2026-02-12T00:00:00Z',
        profile: { display_name: 'Alex', avatar_url: null },
      },
    ];

    mediaService.getRouteMedia.mockResolvedValueOnce({
      data: mockMedia,
      error: null,
    });

    const { result } = renderHook(() => useRouteMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.media).toEqual(mockMedia);
    expect(mediaService.getRouteMedia).toHaveBeenCalledWith('route-1');
  });

  it('returns empty array when no media exists', async () => {
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

  it('chains upload → getPublicUrl → createRouteMedia', async () => {
    // The upload mutation is a three-step process:
    // 1. Upload file to Storage
    // 2. Get the public URL
    // 3. Create a route_media DB row linking the video to the route
    mediaService.uploadVideoFile.mockResolvedValueOnce({
      data: { path: 'user-1/route-1/12345.mp4' },
      error: null,
    });
    mediaService.getPublicUrl.mockReturnValueOnce(
      'https://example.com/storage/beta-videos/user-1/route-1/12345.mp4'
    );
    mediaService.createRouteMedia.mockResolvedValueOnce({
      data: { id: 'media-1' },
      error: null,
    });

    const { result } = renderHook(() => useUploadVideo('route-1'), {
      wrapper: createWrapper(),
    });

    const mockBlob = new Blob(['video']);

    await act(async () => {
      result.current.mutate({
        blob: mockBlob,
        storagePath: 'user-1/route-1/12345.mp4',
        mimeType: 'video/mp4',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify the three-step chain
    expect(mediaService.uploadVideoFile).toHaveBeenCalledWith(
      mockBlob,
      'user-1/route-1/12345.mp4',
      'video/mp4'
    );
    expect(mediaService.getPublicUrl).toHaveBeenCalledWith(
      'user-1/route-1/12345.mp4'
    );
    expect(mediaService.createRouteMedia).toHaveBeenCalledWith({
      routeId: 'route-1',
      userId: 'user-1',
      url: 'https://example.com/storage/beta-videos/user-1/route-1/12345.mp4',
      type: 'video',
    });
  });

  it('throws if storage upload fails', async () => {
    mediaService.uploadVideoFile.mockResolvedValueOnce({
      data: null,
      error: { message: 'Payload too large' },
    });

    const { result } = renderHook(() => useUploadVideo('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        blob: new Blob(['data']),
        storagePath: 'path.mp4',
        mimeType: 'video/mp4',
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // getPublicUrl and createRouteMedia should NOT have been called
    expect(mediaService.getPublicUrl).not.toHaveBeenCalled();
    expect(mediaService.createRouteMedia).not.toHaveBeenCalled();
  });

  it('throws if createRouteMedia fails', async () => {
    mediaService.uploadVideoFile.mockResolvedValueOnce({
      data: { path: 'path.mp4' },
      error: null,
    });
    mediaService.getPublicUrl.mockReturnValueOnce('https://example.com/path.mp4');
    mediaService.createRouteMedia.mockResolvedValueOnce({
      data: null,
      error: { message: 'RLS violation' },
    });

    const { result } = renderHook(() => useUploadVideo('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        blob: new Blob(['data']),
        storagePath: 'path.mp4',
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

  it('calls deleteMedia with mediaId and storagePath', async () => {
    mediaService.deleteMedia.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteMedia('route-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        mediaId: 'media-1',
        storagePath: 'user-1/route-1/12345.mp4',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mediaService.deleteMedia).toHaveBeenCalledWith(
      'media-1',
      'user-1/route-1/12345.mp4'
    );
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
      result.current.mutate({
        mediaId: 'media-1',
        storagePath: 'path.mp4',
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
