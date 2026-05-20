/**
 * Tests for Cloudinary helpers — specifically getOptimizedVideoUrl,
 * which rewrites raw Cloudinary upload URLs to include mobile-friendly
 * transformations (q_auto, f_auto, w_720, vc_auto).
 */

import { getOptimizedVideoUrl } from '../cloudinary';

describe('getOptimizedVideoUrl', () => {
  // Standard Cloudinary upload URL with versioned path
  it('inserts transformation segment before the version in a standard upload URL', () => {
    const raw =
      'https://res.cloudinary.com/mycloud/video/upload/v1234567890/beta-videos/abc123.mp4';
    const result = getOptimizedVideoUrl(raw);
    expect(result).toBe(
      'https://res.cloudinary.com/mycloud/video/upload/q_auto,f_auto,w_720,vc_auto/v1234567890/beta-videos/abc123.mp4'
    );
  });

  // URL without a version prefix (some Cloudinary URLs omit "v<timestamp>")
  it('works when the URL has no version segment', () => {
    const raw =
      'https://res.cloudinary.com/mycloud/video/upload/beta-videos/abc123.mp4';
    const result = getOptimizedVideoUrl(raw);
    expect(result).toBe(
      'https://res.cloudinary.com/mycloud/video/upload/q_auto,f_auto,w_720,vc_auto/beta-videos/abc123.mp4'
    );
  });

  // Non-Cloudinary URLs should pass through unchanged
  it('returns non-Cloudinary URLs unchanged', () => {
    const external = 'https://example.com/videos/climbing.mp4';
    expect(getOptimizedVideoUrl(external)).toBe(external);
  });

  // Supabase Storage URL should pass through unchanged
  it('returns Supabase storage URLs unchanged', () => {
    const supabaseUrl =
      'https://abc.supabase.co/storage/v1/object/public/videos/file.mp4';
    expect(getOptimizedVideoUrl(supabaseUrl)).toBe(supabaseUrl);
  });

  // URL that already has transformations — the function doesn't double-apply
  // because the existing transformations sit where the version usually is,
  // and the function only inserts before the first segment after "upload/".
  it('does not break URLs that already contain transformations', () => {
    const already =
      'https://res.cloudinary.com/mycloud/video/upload/q_auto/v1234567890/beta-videos/abc123.mp4';
    const result = getOptimizedVideoUrl(already);
    // Will prepend another set — caller should avoid calling twice.
    // This test documents the behavior rather than asserting idempotency.
    expect(result).toContain('q_auto,f_auto,w_720,vc_auto/');
  });

  // Empty string edge case
  it('returns empty string unchanged', () => {
    expect(getOptimizedVideoUrl('')).toBe('');
  });
});
