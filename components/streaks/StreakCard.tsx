// components/streaks/StreakCard.tsx
//
// Enhanced streak display component that replaces the plain number display
// on the profile screen. Shows current + longest streaks side by side with
// a colored status badge indicating whether the streak is active, at risk,
// broken, or nonexistent.
//
// WHY A DEDICATED COMPONENT?
// The profile screen's streak section was previously inline JSX showing
// raw numbers with no visual status indicator. By extracting it into a
// reusable component, we:
//   1. Keep the profile screen focused on layout, not streak presentation
//   2. Can reuse the streak display on other screens (session summary, etc.)
//   3. Centralize the status→badge mapping in one place
//
// PRESENTATIONAL PATTERN:
// This is a pure presentational component — it receives pre-computed props
// and renders them. The profile screen (or any parent) owns the data
// fetching and status derivation (via deriveStreakStatus). This separation
// makes the component trivially testable without mocking hooks or services.

import React from "react";
import { Text, View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import type { StreakStatus } from "@/utils/streaks";

/**
 * Props for the StreakCard component.
 *
 * All values should be pre-computed by the parent (typically via
 * deriveStreakStatus). The component just renders what it receives.
 */
export interface StreakCardProps {
  /** Display-ready current streak (0 when broken, DB value otherwise) */
  currentStreak: number;
  /** All-time longest streak from the DB */
  longestStreak: number;
  /** The derived streak status controlling the badge variant */
  status: StreakStatus;
  /** Optional testID for the outer container */
  testID?: string;
}

// ── Status → Badge mapping ──────────────────────────────────────────
//
// Each streak status maps to a Badge variant and label. This creates a
// clear visual hierarchy:
//   - Active (green)  → positive reinforcement
//   - At Risk (amber) → gentle urgency to climb this week
//   - Broken (red)    → clear signal the streak ended
//   - None (purple)   → neutral, no pressure on new users
const statusBadgeMap: Record<
  StreakStatus,
  { variant: "success" | "warning" | "error" | "default"; label: string }
> = {
  active: { variant: "success", label: "Active" },
  at_risk: { variant: "warning", label: "At Risk" },
  broken: { variant: "error", label: "Broken" },
  none: { variant: "default", label: "No Streak" },
};

/**
 * StreakCard — displays current + longest streaks with a status badge.
 *
 * Layout:
 * ```
 *   [5]  Current Streak    [8]  Longest Streak
 *    weeks                   weeks
 *              [Active ✓]  ← Badge(variant=success)
 * ```
 *
 * Usage:
 * ```tsx
 * const derived = deriveStreakStatus(streak.current_streak, streak.last_active_date);
 * <StreakCard
 *   currentStreak={derived.displayStreak}
 *   longestStreak={streak.longest_streak}
 *   status={derived.status}
 * />
 * ```
 */
export function StreakCard({
  currentStreak,
  longestStreak,
  status,
  testID,
}: StreakCardProps) {
  const badgeInfo = statusBadgeMap[status];

  return (
    <View testID={testID} className="py-4 mx-4 border-b border-surface">
      {/* Streak numbers row — current and longest side by side */}
      <View className="flex-row justify-center gap-8">
        {/* Current streak column */}
        <View className="items-center">
          <Text className="text-text-primary text-2xl font-bold">
            {currentStreak}
          </Text>
          <Text className="text-text-secondary text-sm">Current Streak</Text>
          <Text className="text-text-secondary text-xs">weeks</Text>
        </View>

        {/* Longest streak column */}
        <View className="items-center">
          <Text className="text-text-primary text-2xl font-bold">
            {longestStreak}
          </Text>
          <Text className="text-text-secondary text-sm">Longest Streak</Text>
          <Text className="text-text-secondary text-xs">weeks</Text>
        </View>
      </View>

      {/* Status badge — centered below the numbers */}
      <View className="items-center mt-2">
        <Badge label={badgeInfo.label} variant={badgeInfo.variant} />
      </View>
    </View>
  );
}
