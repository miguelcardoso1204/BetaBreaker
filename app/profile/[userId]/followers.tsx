/**
 * Followers List Screen — /profile/[userId]/followers
 *
 * Shows the list of climbers who follow the user identified by [userId].
 * Reached by tapping the "X followers" count on /profile/[userId].
 *
 * Each row is tappable and navigates to that follower's own profile.
 * The list always renders (including when zero followers exist) so the
 * count on the parent profile stays a working affordance regardless of
 * how empty the list is.
 *
 * The data flow is the same pattern as the rest of the profile screens:
 * useFollowers hook → socialService.getFollowers → follows table joined
 * to profiles.
 */

import React from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight } from "lucide-react-native";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { useFollowers } from "@/hooks/useSocial";

// Shape of each row from socialService.getFollowers — the join returns the
// follower's id (as follower_id) plus a nested profile object with the
// display name and avatar URL.
type FollowerRow = {
  follower_id: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export default function FollowersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  // Hook handles loading + error state. We always render the screen
  // chrome (header + list area) so the back button stays available
  // even when the network is slow or the list is empty.
  const { followers, isLoading } = useFollowers(userId);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header: back button + title. Mirrors the pattern from
          app/settings/index.tsx so back navigation feels consistent. */}
      <View className="px-4 pt-2 pb-4 flex-row items-center">
        <IconButton
          icon={ArrowLeft}
          label={t("common.goBack")}
          onPress={() => router.back()}
          size={24}
          color="#FFFFFF"
        />
        <Text className="text-text-primary text-xl font-bold ml-3">
          {t("profile.followersTitle")}
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <FlatList
          data={followers as FollowerRow[]}
          keyExtractor={(item) => item.follower_id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const displayName =
              item.profile?.display_name ?? t("common.unknownUser");
            return (
              <Pressable
                testID={`follower-row-${item.follower_id}`}
                onPress={() =>
                  router.push(`/profile/${item.follower_id}` as any)
                }
                className="flex-row items-center py-3"
                accessibilityRole="button"
                accessibilityLabel={displayName}
              >
                <Avatar
                  uri={item.profile?.avatar_url ?? undefined}
                  name={displayName}
                  size="md"
                />
                <Text className="text-text-primary text-base flex-1 ml-3">
                  {displayName}
                </Text>
                <ChevronRight size={20} color="#6B7280" />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text className="text-text-secondary text-center mt-8">
              {t("profile.noFollowers")}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
