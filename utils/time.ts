/**
 * Time Formatting Utilities — utils/time.ts
 *
 * Pure functions for formatting time durations. These are used by the
 * SessionTimer component (Step 5.5) to display live elapsed time during
 * a climbing session.
 *
 * WHY A SEPARATE UTILITY?
 * The formatting logic is pure (no side effects, no dependencies) and
 * used by multiple components — the live SessionTimer during a session
 * and the SessionSummary card afterwards. Extracting it into utils/
 * follows the same pattern as grades.ts and scoring.ts: pure functions
 * live in utils/, making them trivially testable without mocking.
 */

/**
 * Formats a duration in milliseconds into "HH:MM:SS" display format.
 *
 * Design decisions:
 *   - Negative values are clamped to 0 (defensive — Date.now() math
 *     can briefly go negative during clock adjustments)
 *   - Sub-second remainders are truncated (floor), not rounded. This
 *     means 999ms still shows "00:00:00", which is correct — you
 *     haven't completed a full second yet.
 *   - Hours can exceed 24 — no day rollover. A marathon session at
 *     the gym should show "25:00:00", not "01:00:00".
 *   - Each segment is zero-padded to 2 digits with padStart for
 *     consistent width in the timer display.
 *
 * @param ms - Duration in milliseconds (e.g., Date.now() - startTime)
 * @returns Formatted string like "00:00:00", "01:30:45", "25:00:00"
 *
 * @example
 * formatElapsedTime(0)         // "00:00:00"
 * formatElapsedTime(5000)      // "00:00:05"
 * formatElapsedTime(3661000)   // "01:01:01"
 * formatElapsedTime(-100)      // "00:00:00" (clamped)
 */
export function formatElapsedTime(ms: number): string {
  // Clamp negatives to 0 — this can happen if the system clock adjusts
  // backward between startTime capture and the current Date.now() call.
  const clamped = Math.max(0, ms);

  // Convert ms to whole seconds by flooring (truncate, don't round).
  // 4999ms → 4 seconds, not 5. The timer should only tick forward
  // when a full second has elapsed.
  const totalSeconds = Math.floor(clamped / 1000);

  // Extract hours, minutes, seconds via modular arithmetic.
  // Hours = integer division by 3600 (seconds per hour).
  // Minutes = remainder after removing hours, divided by 60.
  // Seconds = remainder after removing hours and minutes.
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Zero-pad each segment to 2 digits for consistent timer width.
  // String() converts the number, then padStart ensures at least 2 chars.
  // Hours > 99 will naturally display with 3+ digits (no truncation).
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}
