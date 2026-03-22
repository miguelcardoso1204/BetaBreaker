/**
 * Leaderboards Tab — User's Enrolled Leaderboards (Active / Retired)
 *
 * Shows the current user's leaderboard entries across all gyms they've
 * competed at. A segmented control at the top toggles between:
 *   - Active: leaderboards still running (ends_at > now)
 *   - Retired: leaderboards that have ended (ends_at <= now)
 *
 * Each card shows rank, leaderboard name, gym name, and score. Tapping
 * a card navigates to the full leaderboard detail for that gym.
 *
 * THREE STATES per filter:
 *   1. Loading — spinner while data is being fetched
 *   2. Empty — encouraging message + "Find Gyms" CTA when no entries exist
 *   3. Data — FlatList of leaderboard entry cards
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Trophy, ChevronRight } from "lucide-react-native";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import {
  useEnrolledLeaderboards,
  EnrolledLeaderboard,
} from "@/hooks/useEnrolledLeaderboards";

/**
 * Format a score number with commas for readability.
 * e.g. 1250 → "1,250"
 */
function formatScore(score: number): string {
  return score.toLocaleString();
}

export default function LeaderboardsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  // Toggle between active and retired leaderboards. Default to active
  // since users are most interested in ongoing competitions.
  const [showActive, setShowActive] = useState(true);

  // Fetch BOTH active and retired data simultaneously so switching tabs
  // is instant. TanStack Query deduplicates and caches both under
  // separate keys — the inactive tab's data is already warm when tapped.
  const activeQuery = useEnrolledLeaderboards(user?.id, true);
  const retiredQuery = useEnrolledLeaderboards(user?.id, false);

  const { data, isLoading } = showActive ? activeQuery : retiredQuery;

  // ── Loading state ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator
          testID="loading-indicator"
          size="large"
          color="#7C3AED"
        />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-2">
        <Text className="text-text-primary text-2xl font-bold">
          {t("leaderboards.title")}
        </Text>
      </View>

      {/* ── Active / Retired segment control ────────────────────── */}
      {/* Two-button toggle that filters the list. Active button gets
          accent styling, inactive gets card background. Both prefetch
          via TanStack Query so switching is near-instant after first load. */}
      <View className="flex-row mx-4 mb-4 bg-card rounded-lg p-1">
        <Pressable
          testID="filter-active"
          onPress={() => setShowActive(true)}
          className={`flex-1 py-2 rounded-md items-center ${
            showActive ? "bg-accent" : ""
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              showActive ? "text-white" : "text-text-secondary"
            }`}
          >
            {t("leaderboards.active")}
          </Text>
        </Pressable>
        <Pressable
          testID="filter-retired"
          onPress={() => setShowActive(false)}
          className={`flex-1 py-2 rounded-md items-center ${
            !showActive ? "bg-accent" : ""
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              !showActive ? "text-white" : "text-text-secondary"
            }`}
          >
            {t("leaderboards.retired")}
          </Text>
        </Pressable>
      </View>

      {/* ── Empty state ──────────────────────────────────────────── */}
      {(!data || data.length === 0) ? (
        <View className="flex-1 items-center justify-center px-8">
          <Trophy size={64} color="#6B7280" />
          <Text className="text-text-primary text-lg font-semibold mt-4 text-center">
            {t("leaderboards.noLeaderboards")}
          </Text>
          <Text className="text-text-secondary text-sm mt-2 text-center">
            {showActive
              ? t("leaderboards.joinPrompt")
              : t("leaderboards.noRetired")}
          </Text>
          {showActive && (
            <View className="mt-6 w-full">
              <Button
                label={t("leaderboards.findGyms")}
                onPress={() => router.push("/(tabs)/map" as any)}
                size="lg"
              />
            </View>
          )}
        </View>
      ) : (
        /* ── Data state — list of enrolled leaderboard cards ────── */
        <FlatList
          testID="leaderboard-list"
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-4"
          renderItem={({ item }: { item: EnrolledLeaderboard }) => (
            <Pressable
              testID={`leaderboard-card-${item.leaderboard_id}`}
              onPress={() =>
                router.push(`/(tabs)/gym/${item.gym_id}/leaderboard?lb=${item.leaderboard_id}` as any)
              }
              className="bg-card rounded-xl p-4 mb-3 flex-row items-center"
            >
              {/* Rank badge */}
              <View className="bg-accent rounded-lg w-12 h-12 items-center justify-center mr-3">
                <Text className="text-white font-bold text-lg">
                  #{item.rank}
                </Text>
              </View>

              {/* Middle column — leaderboard name and gym name */}
              <View className="flex-1 mr-3">
                <Text className="text-text-primary font-semibold text-base">
                  {item.leaderboard_name}
                </Text>
                <Text className="text-text-secondary text-sm mt-0.5">
                  {item.gym_name}
                </Text>
              </View>

              {/* Score — right-aligned */}
              <Text className="text-text-primary font-bold text-lg mr-2">
                {formatScore(item.score)} pts
              </Text>

              <ChevronRight size={20} color="#6B7280" />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
