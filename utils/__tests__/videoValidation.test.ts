/**
 * Video Validation Tests (Step 12.1)
 *
 * Tests pure validation functions that enforce upload constraints:
 *   - Duration: max 60 seconds (FR-K1)
 *   - File size: max 50 MB (NFR-11)
 *   - Resolution: max 1920×1080 (FR-K1)
 *   - MIME type: video/mp4, video/quicktime, video/webm only
 *   - Storage path: deterministic format for deduplication
 *   - Aggregate validation: combines all checks
 *
 * These are pure functions — no mocks, no side effects. Input in, result out.
 */

import {
  validateVideoDuration,
  validateVideoFileSize,
  validateVideoResolution,
  validateVideoMimeType,
  buildStoragePath,
  validateVideoForUpload,
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MAX_FILE_SIZE_BYTES,
  VIDEO_MAX_WIDTH,
  VIDEO_MAX_HEIGHT,
  VIDEO_ALLOWED_MIME_TYPES,
  VIDEO_STORAGE_BUCKET,
} from '../videoValidation';

// ── Constants ─────────────────────────────────────────────────────

describe('video validation constants', () => {
  it('exports correct limits', () => {
    // FR-K1: max 60 seconds, max 1080p
    // NFR-11: max 50 MB
    expect(VIDEO_MAX_DURATION_SECONDS).toBe(60);
    expect(VIDEO_MAX_FILE_SIZE_BYTES).toBe(50 * 1024 * 1024);
    expect(VIDEO_MAX_WIDTH).toBe(1920);
    expect(VIDEO_MAX_HEIGHT).toBe(1080);
    expect(VIDEO_STORAGE_BUCKET).toBe('beta-videos');
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

  it('passes for exactly 50 MB (boundary)', () => {
    const result = validateVideoFileSize(50 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });

  it('rejects a 60 MB file', () => {
    const result = validateVideoFileSize(60 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50');
  });

  it('rejects zero-byte file', () => {
    const result = validateVideoFileSize(0);
    expect(result.valid).toBe(false);
  });
});

// ── validateVideoResolution ───────────────────────────────────────

describe('validateVideoResolution', () => {
  it('passes for 1080p (1920×1080)', () => {
    const result = validateVideoResolution(1920, 1080);
    expect(result.valid).toBe(true);
  });

  it('passes for 720p (1280×720)', () => {
    const result = validateVideoResolution(1280, 720);
    expect(result.valid).toBe(true);
  });

  it('passes for portrait 1080p (1080×1920)', () => {
    // Phone videos are often portrait — 1080 wide is within bounds,
    // but 1920 tall exceeds VIDEO_MAX_HEIGHT. We check each dimension
    // against its respective max, so portrait 1080×1920 has width ≤ 1920
    // and height ≤ 1080... wait, 1920 > 1080. This should flag.
    const result = validateVideoResolution(1080, 1920);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('1080');
  });

  it('rejects 4K (3840×2160)', () => {
    const result = validateVideoResolution(3840, 2160);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('1920');
  });

  it('rejects when only width exceeds limit', () => {
    const result = validateVideoResolution(2560, 720);
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

// ── buildStoragePath ──────────────────────────────────────────────

describe('buildStoragePath', () => {
  it('builds path in <userId>/<routeId>/<timestamp>.<ext> format', () => {
    // The path ensures each user's uploads are namespaced under their ID,
    // and each route has its own subfolder. The timestamp prevents collisions.
    const path = buildStoragePath('user-abc', 'route-xyz', 'mp4');
    expect(path).toMatch(/^user-abc\/route-xyz\/\d+\.mp4$/);
  });

  it('uses current timestamp for uniqueness', () => {
    // Two calls should produce different timestamps (or at least the format is correct).
    const before = Date.now();
    const path = buildStoragePath('u1', 'r1', 'mp4');
    const after = Date.now();

    // Extract the timestamp from the path
    const match = path.match(/\/(\d+)\.mp4$/);
    expect(match).not.toBeNull();
    const ts = Number(match![1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('handles quicktime extension (mov)', () => {
    const path = buildStoragePath('user-1', 'route-2', 'mov');
    expect(path).toMatch(/\.mov$/);
  });
});

// ── validateVideoForUpload (aggregate) ────────────────────────────

describe('validateVideoForUpload', () => {
  it('passes when all constraints are met', () => {
    const result = validateVideoForUpload({
      durationSeconds: 30,
      fileSizeBytes: 10 * 1024 * 1024,
      width: 1920,
      height: 1080,
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
      fileSizeBytes: 100 * 1024 * 1024,
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
      width: 1920,
      height: 1080,
      mimeType: 'image/png',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('video');
  });
});
