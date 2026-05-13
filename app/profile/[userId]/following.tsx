/**
 * Following List Screen — /profile/[userId]/following
 *
 * Shows the list of climbers that the user identified by [userId]
 * follows. Reached by tapping the "Y following" count on the
 * /profile/[userId] screen.
 *
 * Mirrors the followers list screen — same row layout, navigation,
 * and empty-state behavior — but reads from useFollowingList (which
 * wraps socialService.getFollowing). Kept as a separate file because
 * Expo Router maps each route to a single file and the row shape
 * differs subtly (the joined profile is keyed off following_id, not
 * follower_id).
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
import { useFollowingList } from "@/hooks/useSocial";

// Shape of each row from socialService.getFollowing.
type FollowingRow = {
  following_id: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export default function FollowingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const { following, isLoading } = useFollowingList(userId);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pt-2 pb-4 flex-row items-center">
        <IconButton
          icon={ArrowLeft}
          label={t("common.goBack")}
          onPress={() => router.back()}
          size={24}
          color="#FFFFFF"
        />
        <Text className="text-text-primary text-xl font-bold ml-3">
          {t("profile.followingTitle")}
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <FlatList
          data={following as FollowingRow[]}
          keyExtractor={(item) => item.following_id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const displayName =
              item.profile?.display_name ?? t("common.unknownUser");
            return (
              <Pressable
                testID={`following-row-${item.following_id}`}
                onPress={() =>
                  router.push(`/profile/${item.following_id}` as any)
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
              {t("profile.notFollowingAnyone")}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
