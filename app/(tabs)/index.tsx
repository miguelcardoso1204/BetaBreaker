/**
 * Home Tab — Activity Feed
 *
 * The main screen users see after logging in. Shows a chronological
 * feed of recent ascents from users they follow.
 *
 * Layout:
 *   - Welcome header with user's display name
 *   - "While you were away..." subtitle
 *   - FlatList of FeedItem components (recent ascents)
 *   - Empty state when not following anyone or no recent activity
 *
 * Data flow:
 *   useActivityFeed() → socialService.getFollowing() + getActivityFeed()
 *   → FeedItem components render each ascent
 */

import React from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { useActivityFeed } from "@/hooks/useSocial";
import { FeedItem } from "@/components/social/FeedItem";
import type { ActivityFeedItem } from "@/components/social/FeedItem";

export default function HomeScreen() {
  const { user } = useAuth();
  const { feed, isLoading } = useActivityFeed();

  return (
    <View className="flex-1 bg-background">
      {/* Welcome header */}
      <View className="px-4 pt-14 pb-2">
        <Text className="text-text-primary text-2xl font-bold">
          Welcome Back
        </Text>
        <Text className="text-text-secondary text-base mt-1">
          {user?.displayName ? `${user.displayName}, while you were away...` : "While you were away..."}
        </Text>
      </View>

      {/* Activity feed */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator testID="loading-indicator" size="large" />
        </View>
      ) : feed.length > 0 ? (
        <FlatList<ActivityFeedItem>
          data={feed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FeedItem item={item} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : (
        /* Empty state — shown when not following anyone or no activity */
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-text-secondary text-base text-center">
            Follow climbers to see their activity
          </Text>
        </View>
      )}
    </View>
  );
}
