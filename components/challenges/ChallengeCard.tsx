// components/challenges/ChallengeCard.tsx
//
// Presentational component showing a challenge's info, progress bar,
// status badge, time remaining, and optional reward badge.
//
// LAYOUT:
// ┌──────────────────────────────┐
// │ Challenge Name      [Active] │
// │ Description text...          │
// │ ████████░░░░  7 / 10         │
// │ 3 days left  🏅 Badge Name  │
// └──────────────────────────────┘
//
// STATUS BADGE MAPPING:
// Each challenge status maps to a Badge variant for clear visual hierarchy:
//   - active    → success (green)  — positive reinforcement
//   - completed → success (green)  — celebration
//   - expired   → error (red)      — clear signal it's over
//   - upcoming  → default (purple) — neutral, informational
//
// PRESENTATIONAL PATTERN:
// Like StreakCard, this is a pure presentational component. The parent
// screen (profile, challenge list) owns the data fetching and status
// derivation. This makes the component trivially testable.

import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ChallengeProgress } from "./ChallengeProgress";

/**
 * Props for the ChallengeCard component.
 *
 * All values should be pre-computed by the parent — the card just renders
 * what it receives. Status should come from deriveChallengeStatus() and
 * timeRemaining from computeTimeRemaining().
 */
export interface ChallengeCardProps {
  /** Challenge name, e.g., "Flash Five Challenge" */
  name: string;
  /** Optional description with challenge details */
  description?: string;
  /** User's current progress count */
  progress: number;
  /** Challenge target count (goal) */
  target: number;
  /** Derived challenge status for the status badge */
  status: "active" | "completed" | "expired" | "upcoming";
  /** Human-readable time remaining, e.g., "3 days left" */
  timeRemaining?: string;
  /** Optional reward badge info (name + icon) for display */
  rewardBadge?: { name: string; icon_key: string } | null;
  /** Optional testID for the outer container */
  testID?: string;
}

// ── Status → Badge mapping ──────────────────────────────────────────
// Maps each challenge status to a Badge variant and i18n key for consistent
// visual treatment across all challenge cards. The key is resolved to a
// translated string at render time via t(), so the map stays static.
const statusBadgeMap: Record<
  ChallengeCardProps["status"],
  { variant: "success" | "error" | "default"; key: string }
> = {
  active: { variant: "success", key: "challenges.active" },
  completed: { variant: "success", key: "challenges.completed" },
  expired: { variant: "error", key: "challenges.expired" },
  upcoming: { variant: "default", key: "challenges.upcoming" },
};

/**
 * ChallengeCard — displays a challenge with progress, status, and reward.
 *
 * Usage:
 * ```tsx
 * <ChallengeCard
 *   name="Flash Five"
 *   description="Flash 5 different routes this week"
 *   progress={3}
 *   target={5}
 *   status="active"
 *   timeRemaining="3 days left"
 *   rewardBadge={{ name: "Flash Master", icon_key: "badge-flash" }}
 * />
 * ```
 */
export function ChallengeCard({
  name,
  description,
  progress,
  target,
  status,
  timeRemaining,
  rewardBadge,
  testID,
}: ChallengeCardProps) {
  const { t } = useTranslation();
  const badgeInfo = statusBadgeMap[status];

  return (
    <Card variant="outlined" testID={testID} className="mx-4 mb-3">
      {/* Header row: challenge name + status badge */}
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-text-primary text-base font-semibold flex-1 mr-2">
          {name}
        </Text>
        <Badge label={t(badgeInfo.key)} variant={badgeInfo.variant} />
      </View>

      {/* Description (optional) */}
      {description ? (
        <Text className="text-text-secondary text-sm mb-2">
          {description}
        </Text>
      ) : null}

      {/* Progress bar */}
      <ChallengeProgress current={progress} target={target} />

      {/* Footer: time remaining + reward badge */}
      <View className="flex-row justify-between items-center mt-2">
        {/* Time remaining */}
        {timeRemaining ? (
          <Text className="text-text-secondary text-xs">{timeRemaining}</Text>
        ) : (
          <View />
        )}

        {/* Reward badge name */}
        {rewardBadge ? (
          <Text className="text-accent text-xs font-medium">
            {rewardBadge.name}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
