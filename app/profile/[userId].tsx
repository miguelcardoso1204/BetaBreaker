/**
 * Other User Profile Screen
 *
 * Displays another user's profile when navigated to via
 * /profile/[userId]. This is the public-facing profile view
 * used when tapping on a user in the activity feed or elsewhere.
 *
 * Current version (basic):
 *   - Back button + FollowButton in header
 *   - Large avatar + display name
 *   - Follow counts (X followers · Y following)
 *   - Loading/error states
 *
 * Future enhancements will add streak display, pinned badges,
 * leaderboard position, and activity history — those require
 * wiring existing hooks for arbitrary user IDs.
 */

import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react-native";
import { Avatar } from "@/components/ui/Avatar";
import { FollowButton } from "@/components/social/FollowButton";
import { useFollowCounts } from "@/hooks/useSocial";
import { profileService } from "@/services/profile.service";

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();

  // Fetch the target user's profile data
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

  // Follow counts for this user
  const { followers, following } = useFollowCounts(userId);

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
          {error instanceof Error ? error.message : "Failed to load profile"}
        </Text>
      </View>
    );
  }

  // ── Profile loaded ─────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background">
      {/* Header: back button + follow button */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
        <Pressable
          testID="back-button"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="p-2"
        >
          <ArrowLeft size={24} color="#FFFFFF" />
        </Pressable>
        <FollowButton targetUserId={userId} />
      </View>

      {/* Avatar + name */}
      <View className="items-center px-4 pb-4">
        <Avatar
          uri={profile?.avatar_url ?? undefined}
          name={profile?.display_name ?? "User"}
          size="lg"
          testID="profile-avatar"
        />
        <Text className="text-text-primary text-xl font-bold mt-3">
          {profile?.display_name ?? "Unknown User"}
        </Text>
      </View>

      {/* Follow counts */}
      <View className="flex-row justify-center px-4 pb-6">
        <Text className="text-text-secondary text-sm">
          <Text className="text-text-primary font-bold">{followers}</Text>
          {" followers · "}
          <Text className="text-text-primary font-bold">{following}</Text>
          {" following"}
        </Text>
      </View>
    </View>
  );
}
