/**
 * Other User Profile Screen
 *
 * Displays another user's public profile when navigated to via
 * /profile/[userId]. Used when tapping a user in the activity feed,
 * leaderboard, or elsewhere.
 *
 * Sections:
 *   1. Header — back button + FollowButton
 *   2. Avatar + display name + tier badge
 *   3. Follow counts (X followers · Y following)
 *   4. Stats — total sends + max grade (via get_profile_stats RPC)
 *   5. Streak — current/longest via StreakCard with status badge
 *   6. Pinned badges — inline BadgeIcon row (no Edit button)
 *   7. Recent sends — last 10 ascents as FeedItem entries
 *
 * All data is fetched via dedicated hooks that accept an arbitrary
 * userId — no special logic needed for "other user" vs "self."
 */

import React from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { BadgeIcon } from "@/components/ui/BadgeIcon";
import { FollowButton } from "@/components/social/FollowButton";
import { FeedItem } from "@/components/social/FeedItem";
import { StreakCard } from "@/components/streaks/StreakCard";
import { useFollowCounts, useUserRecentAscents } from "@/hooks/useSocial";
import { useUserBadges, useUserStreak, usePinnedBadges } from "@/hooks/useBadges";
import { useProfileStats } from "@/hooks/useProfile";
import { profileService } from "@/services/profile.service";
import { canonicalToDisplay } from "@/utils/grades";
import { deriveStreakStatus } from "@/utils/streakStatus";

export default function UserProfileScreen() {
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();

  // ── Data fetching ────────────────────────────────────────────────
  // Each hook handles its own loading/error state and is disabled
  // when userId is undefined. TanStack Query deduplicates requests
  // if multiple components use the same query key.

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const result = await profileService.getById(userId);
      if (result.error) throw result.error;
      return result.data;
    },
  });

  const { followers, following } = useFollowCounts(userId);
  const { data: statsData } = useProfileStats(userId);
  const { data: streakData } = useUserStreak(userId);
  const { data: userBadges } = useUserBadges(userId);
  const { data: pinnedData } = usePinnedBadges(userId);
  const { data: recentAscents } = useUserRecentAscents(userId);

  // ── Derived values ───────────────────────────────────────────────

  // Stats: first element of the RPC result array
  const stats = statsData?.[0] ?? null;
  const totalSends = stats?.total_sends ?? 0;
  const maxGrade =
    stats?.max_grade != null
      ? canonicalToDisplay(stats.max_grade, "v-scale")
      : "—";

  // Streak: derive real-time status from DB data
  const streak = streakData
    ? deriveStreakStatus(streakData.current_streak, streakData.last_active_date)
    : null;

  // Pinned badges: resolve pinned IDs against earned badges list
  const pinnedIds = pinnedData?.pinned_badge_ids ?? [];
  const pinnedBadges = (userBadges ?? [])
    .filter((ub: any) => pinnedIds.includes(ub.badge_id))
    .map((ub: any) => ub.badge);

  // Tier label: capitalize first letter for display
  const tierLabel = profile?.tier
    ? profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)
    : null;

  // ── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator testID="loading-indicator" size="large" />
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <View
        testID="error-state"
        className="flex-1 items-center justify-center bg-background px-4"
      >
        <Text className="text-red-500 text-center">
          {error instanceof Error ? error.message : t("profile.failedToLoad")}
        </Text>
      </View>
    );
  }

  // ── Profile loaded ─────────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background">
      {/* Header: back button + follow button */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
        <Pressable
          testID="back-button"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.goBack")}
          className="p-2"
        >
          <ArrowLeft size={24} color="#FFFFFF" />
        </Pressable>
        <FollowButton targetUserId={userId} />
      </View>

      {/* Avatar + name + tier badge */}
      <View className="items-center px-4 pb-4">
        <Avatar
          uri={profile?.avatar_url ?? undefined}
          name={profile?.display_name ?? "User"}
          size="lg"
          testID="profile-avatar"
        />
        <View className="flex-row items-center mt-3 gap-2">
          <Text className="text-text-primary text-xl font-bold">
            {profile?.display_name ?? t("common.unknownUser")}
          </Text>
          {tierLabel && <Badge label={tierLabel} />}
        </View>
      </View>

      {/* Follow counts */}
      <View className="flex-row justify-center px-4 pb-6">
        <Text className="text-text-secondary text-sm">
          <Text className="text-text-primary font-bold">{followers}</Text>
          {" "}{t("profile.followers")}{" · "}
          <Text className="text-text-primary font-bold">{following}</Text>
          {" "}{t("profile.following")}
        </Text>
      </View>

      {/* Stats section — total sends + max grade */}
      <View className="flex-row justify-center gap-8 py-4 mx-4 border-b border-surface">
        <View className="items-center">
          <Text className="text-text-primary text-2xl font-bold">
            {totalSends}
          </Text>
          <Text className="text-text-secondary text-sm">{t("profile.totalSends")}</Text>
        </View>
        <View className="items-center">
          <Text className="text-text-primary text-2xl font-bold">
            {maxGrade}
          </Text>
          <Text className="text-text-secondary text-sm">{t("profile.maxGrade")}</Text>
        </View>
      </View>

      {/* Streak section */}
      {streak && (
        <StreakCard
          testID="streak-card"
          currentStreak={streak.displayStreak}
          longestStreak={streakData!.longest_streak}
          status={streak.status}
        />
      )}

      {/* Pinned badges */}
      <View className="py-4 mx-4 border-b border-surface">
        <Text className="text-text-secondary text-sm font-semibold mb-3">
          {t("profile.pinnedBadges")}
        </Text>
        {pinnedBadges.length > 0 ? (
          <View className="flex-row gap-4">
            {pinnedBadges.map((badge: any) => (
              <BadgeIcon
                key={badge.id}
                iconKey={badge.icon_key}
                name={badge.name}
                size="sm"
              />
            ))}
          </View>
        ) : (
          <Text className="text-text-secondary text-sm">
            {t("profile.noPinnedBadges")}
          </Text>
        )}
      </View>

      {/* Recent sends */}
      <View className="py-4">
        <Text className="text-text-secondary text-sm font-semibold mb-2 mx-4">
          {t("profile.recentSends")}
        </Text>
        {recentAscents && recentAscents.length > 0 ? (
          recentAscents.map((ascent: any) => (
            <FeedItem key={ascent.id} item={ascent} />
          ))
        ) : (
          <Text className="text-text-secondary text-sm mx-4">
            {t("profile.noRecentSends")}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
