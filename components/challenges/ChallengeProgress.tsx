// components/challenges/ChallengeProgress.tsx
//
// Simple progress bar sub-component for challenge cards. Shows a colored
// bar indicating how far the user has progressed toward the challenge target,
// with a "current / target" text label.
//
// PRESENTATIONAL PATTERN:
// This is a pure presentational component — it receives pre-computed props
// and renders them. No hooks, no data fetching. The parent (ChallengeCard
// or any screen) owns the data and passes it down.
//
// WHY A SEPARATE COMPONENT?
// Progress bars appear in both ChallengeCard (profile screen) and the
// future challenge detail screen. Extracting it allows reuse and keeps
// each component focused on one thing.

import React from "react";
import { Text, View } from "react-native";

/**
 * Props for the ChallengeProgress component.
 *
 * current and target are raw numbers — the component handles capping
 * the visual progress at 100% internally.
 */
export interface ChallengeProgressProps {
  /** The user's current progress count */
  current: number;
  /** The challenge's target count (goal) */
  target: number;
  /** Optional testID for the outer container */
  testID?: string;
}

/**
 * ChallengeProgress — a progress bar with "current / target" label.
 *
 * The bar fills proportionally to (current / target), capped at 100%.
 * Uses the app's accent color for the filled portion against a dark
 * surface background.
 *
 * Usage:
 * ```tsx
 * <ChallengeProgress current={7} target={10} />
 * // Renders: [████████░░] 7 / 10
 * ```
 */
export function ChallengeProgress({
  current,
  target,
  testID,
}: ChallengeProgressProps) {
  // Calculate fill percentage, capped at 100% to prevent overflow.
  // Math.min ensures we don't exceed 100% even if current > target.
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return (
    <View testID={testID}>
      {/* Progress bar container — dark background, rounded corners */}
      <View className="h-3 bg-surface rounded-full overflow-hidden">
        {/* Filled portion — accent color, width set via inline style.
            NativeWind can't handle dynamic percentage widths, so we use
            inline style for the width property. */}
        <View
          className="h-3 bg-accent rounded-full"
          style={{ width: `${percentage}%` }}
          testID={testID ? `${testID}-bar` : undefined}
        />
      </View>
      {/* Text label showing "current / target" */}
      <Text className="text-text-secondary text-xs mt-1 text-right">
        {current} / {target}
      </Text>
    </View>
  );
}
