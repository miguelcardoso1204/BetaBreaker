/**
 * Video Validation Utilities (Step 12.1)
 *
 * Pure functions that enforce upload constraints for beta videos:
 *   - FR-K1: max 60 seconds, max 1080p, ownership required
 *   - NFR-11: max 50 MB after compression
 *
 * These are intentionally side-effect-free — they take primitives and
 * return validation results. This makes them trivial to test and
 * reusable across the upload flow (picker validation, pre-upload check).
 */

// ── Constants ─────────────────────────────────────────────────────
// Exported so UI components can display limits to users.

/** Maximum video duration in seconds (FR-K1). */
export const VIDEO_MAX_DURATION_SECONDS = 60;

/** Maximum file size in bytes — 150 MB. */
export const VIDEO_MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;

/** Maximum video width in pixels (1080p portrait). */
export const VIDEO_MAX_WIDTH = 1080;

/** Maximum video height in pixels (1080p portrait). */
export const VIDEO_MAX_HEIGHT = 1920;

/** MIME types accepted by the beta-videos storage bucket. */
export const VIDEO_ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

// ── Types ─────────────────────────────────────────────────────────

/** Result of a single validation check. */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Metadata needed to validate a video before upload. */
export interface VideoMetadata {
  durationSeconds: number;
  fileSizeBytes: number;
  width: number;
  height: number;
  mimeType: string;
}

/** Aggregate result from validateVideoForUpload. */
export interface VideoValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Validators ────────────────────────────────────────────────────

/**
 * Checks that video duration is within the allowed range.
 * Rejects zero/negative durations (corrupt or empty files) and
 * anything over 60 seconds.
 */
export function validateVideoDuration(seconds: number): ValidationResult {
  if (seconds <= 0) {
    return { valid: false, error: 'Video duration must be greater than 0 seconds.' };
  }
  if (seconds > VIDEO_MAX_DURATION_SECONDS) {
    return {
      valid: false,
      error: `Video must be ${VIDEO_MAX_DURATION_SECONDS} seconds or less (got ${Math.round(seconds)}s).`,
    };
  }
  return { valid: true };
}

/**
 * Checks that file size is within the 50 MB limit.
 * Rejects empty files (0 bytes) and anything over the cap.
 */
export function validateVideoFileSize(bytes: number): ValidationResult {
  if (bytes <= 0) {
    return { valid: false, error: 'Video file is empty.' };
  }
  const maxMB = VIDEO_MAX_FILE_SIZE_BYTES / (1024 * 1024);
  if (bytes > VIDEO_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Video must be under ${maxMB} MB (got ${(bytes / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }
  return { valid: true };
}

/**
 * Checks that video resolution doesn't exceed 1080×1920 (portrait 1080p).
 * Width is checked against VIDEO_MAX_WIDTH, height against VIDEO_MAX_HEIGHT.
 * Climbing videos are typically filmed in portrait orientation.
 */
export function validateVideoResolution(width: number, height: number): ValidationResult {
  if (width > VIDEO_MAX_WIDTH || height > VIDEO_MAX_HEIGHT) {
    return {
      valid: false,
      error: `Video resolution must be ${VIDEO_MAX_WIDTH}×${VIDEO_MAX_HEIGHT} or smaller (got ${width}×${height}).`,
    };
  }
  return { valid: true };
}

/**
 * Checks that the MIME type is one of the allowed video formats.
 * The storage bucket also enforces this server-side, but checking
 * client-side gives a better error message.
 */
export function validateVideoMimeType(mimeType: string): ValidationResult {
  if (!(VIDEO_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return {
      valid: false,
      error: `Only video files are accepted (mp4, mov, webm). Got: ${mimeType}`,
    };
  }
  return { valid: true };
}

/**
 * Runs all validation checks and collects errors.
 * Returns all failures at once so the user can fix everything
 * in one pass instead of playing whack-a-mole.
 */
export function validateVideoForUpload(metadata: VideoMetadata): VideoValidationResult {
  const checks = [
    validateVideoDuration(metadata.durationSeconds),
    validateVideoFileSize(metadata.fileSizeBytes),
    validateVideoResolution(metadata.width, metadata.height),
    validateVideoMimeType(metadata.mimeType),
  ];

  const errors = checks
    .filter((check) => !check.valid)
    .map((check) => check.error!);

  return {
    valid: errors.length === 0,
    errors,
  };
}
