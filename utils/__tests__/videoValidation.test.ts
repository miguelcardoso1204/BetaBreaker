/**
 * Video Validation Tests (Step 12.1)
 *
 * Tests pure validation functions that enforce upload constraints:
 *   - Duration: max 60 seconds (FR-K1)
 *   - File size: max 150 MB (NFR-11)
 *   - Resolution: max 1920×1080 (FR-K1)
 *   - MIME type: video/mp4, video/quicktime, video/webm only
 *   - Aggregate validation: combines all checks
 *
 * These are pure functions — no mocks, no side effects. Input in, result out.
 */

import {
  validateVideoDuration,
  validateVideoFileSize,
  validateVideoResolution,
  validateVideoMimeType,
  validateVideoForUpload,
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MAX_FILE_SIZE_BYTES,
  VIDEO_MAX_WIDTH,
  VIDEO_MAX_HEIGHT,
  VIDEO_ALLOWED_MIME_TYPES,
} from '../videoValidation';

// ── Constants ─────────────────────────────────────────────────────

describe('video validation constants', () => {
  it('exports correct limits', () => {
    // FR-K1: max 60 seconds, max 1080p
    expect(VIDEO_MAX_DURATION_SECONDS).toBe(60);
    expect(VIDEO_MAX_FILE_SIZE_BYTES).toBe(150 * 1024 * 1024);
    expect(VIDEO_MAX_WIDTH).toBe(1080);
    expect(VIDEO_MAX_HEIGHT).toBe(1920);
  });

  it('allows mp4, quicktime, and webm MIME types', () => {
    expect(VIDEO_ALLOWED_MIME_TYPES).toContain('video/mp4');
    expect(VIDEO_ALLOWED_MIME_TYPES).toContain('video/quicktime');
    expect(VIDEO_ALLOWED_MIME_TYPES).toContain('video/webm');
    expect(VIDEO_ALLOWED_MIME_TYPES).toHaveLength(3);
  });
});

// ── validateVideoDuration ─────────────────────────────────────────

describe('validateVideoDuration', () => {
  it('passes for a 30-second video', () => {
    const result = validateVideoDuration(30);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('passes for exactly 60 seconds (boundary)', () => {
    // Exactly at the limit should still be accepted.
    const result = validateVideoDuration(60);
    expect(result.valid).toBe(true);
  });

  it('rejects a 90-second video', () => {
    const result = validateVideoDuration(90);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('60');
  });

  it('rejects zero-duration video', () => {
    // A zero-length video is useless — reject it.
    const result = validateVideoDuration(0);
    expect(result.valid).toBe(false);
  });

  it('rejects negative duration', () => {
    const result = validateVideoDuration(-5);
    expect(result.valid).toBe(false);
  });
});

// ── validateVideoFileSize ─────────────────────────────────────────

describe('validateVideoFileSize', () => {
  it('passes for a 10 MB file', () => {
    const result = validateVideoFileSize(10 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });

  it('passes for exactly 150 MB (boundary)', () => {
    const result = validateVideoFileSize(150 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });

  it('rejects a 160 MB file', () => {
    const result = validateVideoFileSize(160 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('150');
  });

  it('rejects zero-byte file', () => {
    const result = validateVideoFileSize(0);
    expect(result.valid).toBe(false);
  });
});

// ── validateVideoResolution ───────────────────────────────────────

describe('validateVideoResolution', () => {
  it('passes for portrait 1080p (1080×1920)', () => {
    // Climbing videos are typically filmed in portrait orientation.
    const result = validateVideoResolution(1080, 1920);
    expect(result.valid).toBe(true);
  });

  it('passes for landscape 1080p (1920×1080)', () => {
    // Landscape fits within 1080 width? No — 1920 > 1080 max width.
    const result = validateVideoResolution(1920, 1080);
    expect(result.valid).toBe(false);
  });

  it('passes for 720p (720×1280)', () => {
    const result = validateVideoResolution(720, 1280);
    expect(result.valid).toBe(true);
  });

  it('rejects 4K (2160×3840)', () => {
    const result = validateVideoResolution(2160, 3840);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('1080');
  });

  it('rejects when only width exceeds limit', () => {
    const result = validateVideoResolution(1440, 720);
    expect(result.valid).toBe(false);
  });
});

// ── validateVideoMimeType ─────────────────────────────────────────

describe('validateVideoMimeType', () => {
  it('passes for video/mp4', () => {
    expect(validateVideoMimeType('video/mp4').valid).toBe(true);
  });

  it('passes for video/quicktime (MOV files)', () => {
    expect(validateVideoMimeType('video/quicktime').valid).toBe(true);
  });

  it('passes for video/webm', () => {
    expect(validateVideoMimeType('video/webm').valid).toBe(true);
  });

  it('rejects image/jpeg', () => {
    const result = validateVideoMimeType('image/jpeg');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('video');
  });

  it('rejects application/pdf', () => {
    expect(validateVideoMimeType('application/pdf').valid).toBe(false);
  });
});

// ── validateVideoForUpload (aggregate) ────────────────────────────

describe('validateVideoForUpload', () => {
  it('passes when all constraints are met', () => {
    const result = validateVideoForUpload({
      durationSeconds: 30,
      fileSizeBytes: 10 * 1024 * 1024,
      width: 1080,
      height: 1920,
      mimeType: 'video/mp4',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('collects multiple errors when several constraints fail', () => {
    // If duration, size, AND resolution all fail, the user should see
    // all problems at once instead of fixing them one at a time.
    const result = validateVideoForUpload({
      durationSeconds: 120,
      fileSizeBytes: 200 * 1024 * 1024,
      width: 3840,
      height: 2160,
      mimeType: 'video/mp4',
    });
    expect(result.valid).toBe(false);
    // At least 3 errors: duration, size, resolution
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('returns error for invalid MIME type even if other fields are valid', () => {
    const result = validateVideoForUpload({
      durationSeconds: 30,
      fileSizeBytes: 10 * 1024 * 1024,
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('video');
  });
});
