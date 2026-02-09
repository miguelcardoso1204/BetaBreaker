// app/(tabs)/leaderboards.tsx
//
// Leaderboards tab — shows the user's enrolled leaderboard entries across
// all gyms they've competed at. Each card shows rank, score, gym name, and
// the competition period. Tapping a card navigates to the full leaderboard
// detail for that gym.
//
// THREE STATES:
//   1. Loading — spinner while data is being fetched
//   2. Empty — encouraging message + "Find Gyms" CTA when no entries exist
//   3. Data — FlatList of leaderboard entry cards
//
// WHY A STUB HOOK?
// The real leaderboard data fetching (TanStack Query + service layer) is
// built in Phase 9 (Gamification). For now, the stub hook always returns
// empty data, so this screen renders the empty state in practice. Tests
// can override the mock to verify all three states work correctly.

import { useRouter } from "expo-router";
import { Trophy, ChevronRight } from "lucide-react-native";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import {
  useEnrolledLeaderboards,
  EnrolledLeaderboard,
} from "@/hooks/useEnrolledLeaderboards";

/**
 * Format a score number with commas for readability.
 * e.g. 1250 → "1,250", 2100 → "2,100"
 *
 * WHY toLocaleString?
 * It handles thousands separators automatically based on locale,
 * making large scores easier to read at a glance.
 */
function formatScore(score: number): string {
  return score.toLocaleString();
}

export default function LeaderboardsScreen() {
  const router = useRouter();
  const { data, isLoading } = useEnrolledLeaderboards();

  // ── Loading state ─────────────────────────────────────────────
  // Show a centered spinner while data is being fetched.
  // testID="loading-indicator" lets tests verify this state.
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

  // ── Empty state ───────────────────────────────────────────────
  // When no leaderboard entries exist, show a friendly message and
  // a CTA button to navigate to the Map tab to find gyms.
  if (!data || data.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="px-4 pt-14 pb-4">
          <Text className="text-text-primary text-2xl font-bold">
            Leaderboards
          </Text>
        </View>

        {/* Empty state content — centered in remaining space */}
        <View className="flex-1 items-center justify-center px-8">
          {/* Decorative trophy icon — visually reinforces the leaderboard theme */}
          <Trophy size={64} color="#6B7280" />

          <Text className="text-text-primary text-lg font-semibold mt-4 text-center">
            No enrolled leaderboards
          </Text>
          <Text className="text-text-secondary text-sm mt-2 text-center">
            Log climbs at a gym to join their weekly leaderboard
          </Text>

          {/* CTA button — sends user to the Map tab to discover gyms */}
          <View className="mt-6 w-full">
            <Button
              label="Find Gyms"
              onPress={() => router.push("/(tabs)/map" as any)}
              size="lg"
            />
          </View>
        </View>
      </View>
    );
  }

  // ── Data state ────────────────────────────────────────────────
  // Render a FlatList of leaderboard entry cards. Each card is a
  // Pressable that navigates to the gym's full leaderboard detail.
  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 pt-14 pb-4">
        <Text className="text-text-primary text-2xl font-bold">
          Leaderboards
        </Text>
      </View>

      <FlatList
        testID="leaderboard-list"
        data={data}
        // keyExtractor tells FlatList how to uniquely identify each item.
        // Using the entry ID ensures stable keys across re-renders.
        keyExtractor={(item) => item.id}
        // contentContainerStyle adds horizontal padding to the list content
        // without affecting the scroll indicator position.
        contentContainerClassName="px-4 pb-4"
        renderItem={({ item }: { item: EnrolledLeaderboard }) => (
          <Pressable
            // Navigate to the gym's leaderboard detail page.
            // The route doesn't exist yet — Phase 9 will create it.
            onPress={() =>
              router.push(`/gym/${item.gym_id}/leaderboard` as any)
            }
            className="bg-card rounded-xl p-4 mb-3 flex-row items-center"
          >
            {/* Rank badge — prominently displays the user's position */}
            <View className="bg-accent rounded-lg w-12 h-12 items-center justify-center mr-3">
              <Text className="text-white font-bold text-lg">
                #{item.rank}
              </Text>
            </View>

            {/* Middle column — gym name and period label */}
            <View className="flex-1 mr-3">
              <Text className="text-text-primary font-semibold text-base">
                {item.gym_name}
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                {item.period}
              </Text>
            </View>

            {/* Score — right-aligned for quick scanning */}
            <Text className="text-text-primary font-bold text-lg mr-2">
              {formatScore(item.score)}
            </Text>

            {/* Chevron — visual affordance indicating the card is tappable */}
            <ChevronRight size={20} color="#6B7280" />
          </Pressable>
        )}
      />
    </View>
  );
}
