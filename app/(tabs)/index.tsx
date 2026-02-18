/**
 * Home Tab — Activity Feed + Suggestions + Notification Bell
 *
 * The main screen users see after logging in. Shows:
 *   - Welcome header with notification bell
 *   - Personalized route suggestions (Pro-only, requires home gym)
 *   - Chronological feed of recent ascents from followed users
 *   - Empty state when not following anyone or no recent activity
 *
 * Data flow:
 *   useActivityFeed() → socialService.getFollowing() + getActivityFeed()
 *   → FeedItem components render each ascent
 *   useUnreadCount() → notificationsService.getUnreadCount()
 *   → NotificationBell badge overlay
 *   useRouteSuggestions() → scoring engine → SuggestionsCard
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useActivityFeed } from "@/hooks/useSocial";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useRouteSuggestions } from "@/hooks/useRouteSuggestions";
import { FeedItem } from "@/components/social/FeedItem";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SuggestionsCard } from "@/components/analytics/SuggestionsCard";
import type { ActivityFeedItem } from "@/components/social/FeedItem";
import type { GradeSystem } from "@/utils/grades";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { feed, isLoading } = useActivityFeed();
  const { count } = useUnreadCount();
  const router = useRouter();

  // Route suggestions: Pro-gated, requires home gym.
  // The hook handles all the gating internally — we just check
  // hasAccess and noHomeGym to decide whether to render the card.
  const suggestions = useRouteSuggestions();

  // Whether to show the suggestions section. Hidden when:
  // - User is on free tier (hasAccess: false)
  // - User has no home gym set (noHomeGym: true)
  const showSuggestions = suggestions.hasAccess && !suggestions.noHomeGym;

  return (
    <View className="flex-1 bg-background">
      {/* Welcome header with notification bell */}
      <View className="px-4 pt-14 pb-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-text-primary text-2xl font-bold flex-1">
            {t("home.welcomeBack")}
          </Text>
          {/* Bell icon — tapping opens the notification center */}
          <NotificationBell
            count={count}
            onPress={() => router.push("/notifications")}
          />
        </View>
        <Text className="text-text-secondary text-base mt-1">
          {user?.displayName
            ? t("home.whileAwayUser", { name: user.displayName })
            : t("home.whileAway")}
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
          ListHeaderComponent={
            // Suggestions card sits above the feed so it scrolls with it.
            // Placed inside ListHeaderComponent so the horizontal FlatList
            // inside SuggestionsCard doesn't conflict with the outer vertical list.
            showSuggestions ? (
              <SuggestionsCard
                suggestions={suggestions.suggestions ?? []}
                gradeSystem={(user?.preferredGradeSystem ?? "v-scale") as GradeSystem}
                onRoutePress={(routeId) => router.push(`/routes/${routeId}` as any)}
                onRefresh={suggestions.refresh}
                hasMore={suggestions.hasMore}
                isLoading={suggestions.isLoading}
                testID="home-suggestions"
              />
            ) : null
          }
        />
      ) : (
        /* Empty state — shown when not following anyone or no activity */
        <View className="flex-1 px-8">
          {/* Show suggestions even in the empty feed state */}
          {showSuggestions && (
            <SuggestionsCard
              suggestions={suggestions.suggestions ?? []}
              gradeSystem={(user?.preferredGradeSystem ?? "v-scale") as GradeSystem}
              onRoutePress={(routeId) => router.push(`/routes/${routeId}` as any)}
              onRefresh={suggestions.refresh}
              hasMore={suggestions.hasMore}
              isLoading={suggestions.isLoading}
              testID="home-suggestions"
            />
          )}
          <View className="flex-1 items-center justify-center">
            <Text className="text-text-secondary text-base text-center">
              {t("home.followPrompt")}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
