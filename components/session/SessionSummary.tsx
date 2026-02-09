/**
 * SessionSummary — Post-Session Statistics Card
 *
 * Displays a summary of a completed climbing session: date, duration,
 * total ascents broken down by status (flash/send/attempt), and an
 * optional grade distribution bar chart.
 *
 * WHY PRESENTATIONAL (PROPS-ONLY)?
 * The same summary card serves two different data sources:
 *   1. **Immediately post-session**: Stats computed from PendingLog[]
 *      in the Zustand store (no grade info available yet).
 *   2. **Logbook detail screen**: Stats fetched from sessionsService
 *      .getSessionSummary() which includes grade distribution.
 *
 * By accepting pre-computed stats as props (instead of reading from
 * a hook), the parent component adapts the data source. This follows
 * the "presentational vs container" pattern — the card is purely a
 * visual renderer, and the parent is the data source adapter.
 *
 * GRADE DISTRIBUTION BARS:
 * Instead of pulling in a charting library (which would add bundle size
 * for a simple visualization), we use plain View elements with percentage-
 * based widths. Each bar's width is proportional to the max count:
 *   width% = (count / maxCount) * 100
 * This creates a simple horizontal bar chart that's visually clear and
 * costs zero additional dependencies.
 *
 * HOW IT CONNECTS:
 * 1. Session end → parent computes stats from pendingLogs → this card
 * 2. Logbook detail → parent fetches from sessionsService → this card
 * 3. Uses Card, Badge, Divider from components/ui/ for consistent styling
 * 4. Uses canonicalToDisplay from utils/grades.ts for grade labels
 */

import React from "react";
import { Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Divider } from "@/components/ui/Divider";
import { canonicalToDisplay } from "@/utils/grades";
import type { GradeSystem } from "@/utils/grades";

// ── Props ────────────────────────────────────────────────────────────

export interface SessionSummaryProps {
  /** Display date string (e.g., "Feb 9, 2026"). Pre-formatted by parent. */
  date: string;
  /** Session duration in whole minutes (computed by sessionStore.endSession). */
  durationMinutes: number;
  /** Total number of ascents logged during the session. */
  totalAscents: number;
  /** Number of routes sent (completed, not on first try). */
  sends: number;
  /** Number of routes flashed (completed on first try). */
  flashes: number;
  /** Number of failed attempts. */
  attempts: number;
  /**
   * Optional grade distribution map: canonical grade → ascent count.
   * Only available when viewing from the logbook (not immediately post-session).
   * When provided, renders horizontal bars showing the spread of grades climbed.
   */
  gradeDistribution?: Record<number, number>;
  /**
   * Which grade system to use for display labels (V-scale, Font, YDS).
   * Only used when gradeDistribution is provided. Defaults to 'v-scale'.
   */
  gradeSystem?: GradeSystem;
  /** Test ID for the outer card wrapper. */
  testID?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Formats a duration in minutes into a human-readable string.
 *
 * Short sessions (< 60 min) show "X min" to avoid the awkward "0h Xm".
 * Longer sessions show "Xh Ym" for compact readability. This matches
 * common fitness app conventions (Strava, Apple Fitness).
 *
 * @param minutes - Whole minutes (from sessionStore.duration)
 * @returns Formatted string like "45 min" or "1h 30m"
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * SessionSummary — a card displaying post-session statistics.
 *
 * Usage:
 * ```tsx
 * // Immediately after session (no grade data)
 * <SessionSummary
 *   date="Feb 9, 2026"
 *   durationMinutes={45}
 *   totalAscents={12}
 *   sends={5}
 *   flashes={3}
 *   attempts={4}
 * />
 *
 * // From logbook with grade distribution
 * <SessionSummary
 *   date="Feb 9, 2026"
 *   durationMinutes={90}
 *   totalAscents={20}
 *   sends={8}
 *   flashes={5}
 *   attempts={7}
 *   gradeDistribution={{ 5: 2, 10: 5, 15: 3 }}
 *   gradeSystem="v-scale"
 * />
 * ```
 */
export function SessionSummary({
  date,
  durationMinutes,
  totalAscents,
  sends,
  flashes,
  attempts,
  gradeDistribution,
  gradeSystem = "v-scale",
  testID,
}: SessionSummaryProps) {
  // Determine if we have grade data to display.
  // Object.keys returns string[], so we check length to see if there
  // are any entries. An empty object {} or undefined should hide the section.
  const gradeEntries = gradeDistribution
    ? Object.entries(gradeDistribution)
        // Sort by canonical grade (ascending) so easiest grades are at top
        .sort(([a], [b]) => Number(a) - Number(b))
    : [];
  const hasGrades = gradeEntries.length > 0;

  // Find the maximum count for scaling bar widths.
  // Each bar's width = (count / maxCount) * 100%. This ensures the
  // highest-count grade gets a full-width bar for visual reference.
  const maxCount = hasGrades
    ? Math.max(...gradeEntries.map(([, count]) => count))
    : 0;

  return (
    <Card testID={testID}>
      {/* ── Title Row ──────────────────────────────────────────── */}
      {/* "Session Summary" on the left, date on the right. flexDirection
          row + justify-between is the standard RN pattern for this layout. */}
      <View className="flex-row justify-between items-center">
        <Text className="text-lg font-bold text-white">Session Summary</Text>
        <Text className="text-sm text-text-secondary">{date}</Text>
      </View>

      <Divider className="my-3" />

      {/* ── Stats Row ──────────────────────────────────────────── */}
      {/* Duration and total ascent count side by side. */}
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-sm text-text-secondary">
          Duration: {formatDuration(durationMinutes)}
        </Text>
        <Text className="text-sm text-text-secondary">
          {totalAscents} {totalAscents === 1 ? "ascent" : "ascents"}
        </Text>
      </View>

      {/* ── Status Badges ──────────────────────────────────────── */}
      {/* Flash (success/green), Send (default/purple), Attempt (warning/amber).
          Arranged in a row with gaps between each badge. Each badge shows
          the count + label for quick scanning. */}
      <View className="flex-row gap-2">
        <Badge label={`${flashes} Flash`} variant="success" />
        <Badge label={`${sends} Send`} variant="default" />
        <Badge label={`${attempts} Attempt`} variant="warning" />
      </View>

      {/* ── Grade Distribution (optional) ──────────────────────── */}
      {/* Only rendered when gradeDistribution prop has entries.
          Uses simple View bars instead of a charting library to avoid
          extra bundle size for what's essentially a simple visualization. */}
      {hasGrades && (
        <>
          <Divider className="my-3" />
          <Text className="text-sm font-semibold text-white mb-2">
            Grade Distribution
          </Text>

          {gradeEntries.map(([canonical, count]) => {
            // Convert canonical grade integer to display string (e.g., "V4")
            const label = canonicalToDisplay(Number(canonical), gradeSystem);
            // Calculate bar width as percentage of the max count.
            // Math.max(1, ...) ensures even a count of 0 gets a tiny bar
            // visible to the user (but count 0 shouldn't appear in practice).
            const widthPercent = (count / Math.max(1, maxCount)) * 100;

            return (
              <View key={canonical} className="flex-row items-center mb-1">
                {/* Grade label — fixed width for alignment across rows */}
                <Text className="text-xs text-text-secondary w-12">
                  {label}
                </Text>

                {/* Bar container — takes remaining horizontal space */}
                <View className="flex-1 mx-2">
                  {/* Colored bar — width is a percentage of the container.
                      bg-accent (purple) matches the app's primary color. */}
                  <View
                    className="h-3 bg-accent rounded"
                    style={{ width: `${widthPercent}%` }}
                  />
                </View>

                {/* Count label — right-aligned */}
                <Text className="text-xs text-text-secondary w-6 text-right">
                  {count}
                </Text>
              </View>
            );
          })}
        </>
      )}
    </Card>
  );
}
