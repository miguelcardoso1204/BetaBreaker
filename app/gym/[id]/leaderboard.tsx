/**
 * Gym Leaderboard Screen — Ranked Entries for a Specific Gym
 *
 * Shows weekly leaderboard rankings for a gym under different scoring models.
 * Users reach this screen from:
 *   1. The gym main page (Leaderboards card)
 *   2. The enrolled leaderboards tab (tapping a leaderboard card)
 *
 * DATA FLOW:
 *   useLocalSearchParams() → gymId
 *   useGym(gymId)          → gym name for header
 *   useAuth()              → current user ID (row highlighting) + grade system
 *   useLeaderboard(gymId, period, model) → ranked entries with embedded profiles
 *
 * SCORING MODEL DISPLAY:
 *   - hardest_grade: canonical int → human grade via canonicalToDisplay()
 *   - flash_rate: decimal 0–1 → percentage like "85%"
 *   - volume: integer count → displayed as-is
 *
 * PERIOD SELECTION:
 *   - "This Week" = current ISO week (e.g., "2026-W07")
 *   - "Last Week" = previous ISO week (e.g., "2026-W06")
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  FlatList,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useGym } from "@/hooks/useGyms";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/ui/Avatar";
import { canonicalToDisplay, type GradeSystem } from "@/utils/grades";
import {
  getCurrentISOWeekLabel,
  getPreviousISOWeekLabel,
} from "@/utils/isoWeek";
import type { ScoringModel } from "@/lib/constants";

// ── Period / Model chip definitions ───────────────────────────────

/** Period options for the time filter chips. */
// NOTE: Labels are set to translation keys here and resolved via t()
// at render time. This lets us keep the static array outside the component
// while still supporting i18n — the t() call happens in the JSX, not here.
const PERIOD_OPTIONS = [
  { key: "this-week", labelKey: "gym.leaderboard.thisWeek", getValue: getCurrentISOWeekLabel },
  { key: "last-week", labelKey: "gym.leaderboard.lastWeek", getValue: getPreviousISOWeekLabel },
] as const;

/** Scoring model options for the model filter chips.
 *  Like PERIOD_OPTIONS, labels are translation keys resolved via t() at render. */
const MODEL_OPTIONS: { key: ScoringModel; labelKey: string }[] = [
  { key: "hardest_grade", labelKey: "gym.leaderboard.grade" },
  { key: "flash_rate", labelKey: "gym.leaderboard.flashRate" },
  { key: "volume", labelKey: "gym.leaderboard.volume" },
];

// ── Score formatting ──────────────────────────────────────────────

/**
 * Format a leaderboard score based on the active scoring model.
 *
 * Each model stores scores differently in the DB:
 *   - hardest_grade: canonical grade integer (0–30) → display grade
 *   - flash_rate: decimal ratio (0.0–1.0) → percentage string
 *   - volume: route count integer → plain number
 */
function formatScore(
  score: number,
  model: ScoringModel,
  gradeSystem: GradeSystem,
): string {
  switch (model) {
    case "hardest_grade":
      // Convert canonical integer to human-readable grade in the user's
      // preferred system (e.g., 15 → "V6" in v-scale, "6c+" in font).
      return canonicalToDisplay(score, gradeSystem);
    case "flash_rate":
      // Multiply decimal by 100 and round for display: 0.85 → "85%"
      return `${Math.round(score * 100)}%`;
    case "volume":
      // Volume is a plain count — display as-is
      return `${score}`;
  }
}

// ── Component ─────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  // i18n hook — provides t() for translating hardcoded strings.
  const { t } = useTranslation();

  // Extract gymId from the URL path (/gym/[id]/leaderboard)
  const { id: gymId } = useLocalSearchParams<{ id: string }>();

  // Gym name for the header
  const { data: gym } = useGym(gymId);

  // Current user for row highlighting and grade system preference
  const { user } = useAuth();
  const gradeSystem = (user?.preferredGradeSystem ?? "v-scale") as GradeSystem;

  // ── Filter state ─────────────────────────────────────────────
  // Default: current ISO week + hardest_grade scoring model
  const [periodKey, setPeriodKey] = useState<string>("this-week");
  const [model, setModel] = useState<ScoringModel>("hardest_grade");

  // Compute the actual period string from the selected key.
  // This calls getCurrentISOWeekLabel() or getPreviousISOWeekLabel()
  // each render, ensuring the label is always up-to-date.
  const periodOption = PERIOD_OPTIONS.find((p) => p.key === periodKey)!;
  const period = periodOption.getValue();

  // Fetch leaderboard entries for the selected gym/period/model
  const { data: entries, isLoading } = useLeaderboard(gymId, period, model);

  // ── Loading state ────────────────────────────────────────────
  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="loading-indicator"
      >
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView>
        {/* ── Header ──────────────────────────────────────────── */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-text-primary text-2xl font-bold">
            {gym?.name ?? t("gym.leaderboard.title")}
          </Text>
        </View>

        {/* ── Period chips ────────────────────────────────────── */}
        {/* Toggle between "This Week" and "Last Week". Active chip
            gets accent background, inactive gets card background. */}
        <View className="flex-row px-4 gap-2 mb-3">
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = opt.key === periodKey;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setPeriodKey(opt.key)}
                testID={`period-chip-${opt.key}${isActive ? "-active" : ""}`}
                className={`px-4 py-2 rounded-full ${
                  isActive ? "bg-accent" : "bg-card"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isActive ? "text-white" : "text-text-secondary"
                  }`}
                >
                  {t(opt.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Model chips ─────────────────────────────────────── */}
        {/* Toggle between Grade, Flash Rate, and Volume. Same
            active/inactive pattern as period chips. */}
        <View className="flex-row px-4 gap-2 mb-4">
          {MODEL_OPTIONS.map((opt) => {
            const isActive = opt.key === model;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setModel(opt.key)}
                testID={`model-chip-${opt.key}${isActive ? "-active" : ""}`}
                className={`px-4 py-2 rounded-full ${
                  isActive ? "bg-accent" : "bg-card"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isActive ? "text-white" : "text-text-secondary"
                  }`}
                >
                  {t(opt.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Leaderboard list ────────────────────────────────── */}
        {(!entries || entries.length === 0) ? (
          // Empty state — no entries for this period/model combo.
          <View className="items-center justify-center py-16 px-8">
            <Text className="text-text-secondary text-base text-center">
              {t("gym.leaderboard.noEntries")}
            </Text>
          </View>
        ) : (
          // Ranked entries — each row shows rank, avatar, name, score.
          // Using map inside ScrollView instead of nested FlatList to
          // avoid VirtualizedList nesting warnings.
          <View className="px-4 pb-8">
            {entries.map((entry: any) => {
              const isCurrentUser = entry.user_id === user?.id;
              const displayName =
                entry.profile?.display_name ?? "Unknown Climber";
              const avatarUrl = entry.profile?.avatar_url ?? undefined;

              return (
                <View
                  key={entry.id}
                  testID={`leaderboard-row-${entry.user_id}`}
                  className={`flex-row items-center p-3 mb-2 rounded-xl ${
                    isCurrentUser ? "bg-accent/20" : "bg-card"
                  }`}
                >
                  {/* Rank number — left-aligned, fixed width for alignment */}
                  <Text className="text-text-primary font-bold text-lg w-10 text-center">
                    #{entry.rank}
                  </Text>

                  {/* Avatar — shows user photo or initials fallback */}
                  <View className="mx-2">
                    <Avatar
                      uri={avatarUrl}
                      name={displayName}
                      size="sm"
                    />
                  </View>

                  {/* Display name — takes remaining horizontal space */}
                  <Text className="text-text-primary text-base flex-1" numberOfLines={1}>
                    {displayName}
                  </Text>

                  {/* Formatted score — right-aligned */}
                  <Text className="text-text-primary font-bold text-base ml-2">
                    {formatScore(entry.score, model, gradeSystem)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
