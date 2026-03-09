/**
 * Notification Center Screen — In-App Notification List
 *
 * Displays the user's notifications in a scrollable list, newest first.
 * Three visual states:
 *   1. Loading — spinner while fetching
 *   2. Empty — friendly message when caught up
 *   3. Data — FlatList of NotificationItem components
 *
 * Header includes:
 *   - Back button (← arrow) to return to previous screen
 *   - "Notifications" title
 *   - Gear icon → notification preferences
 *   - "Mark all read" button
 *
 * REALTIME:
 *   Calls useNotificationRealtime() which subscribes to Supabase
 *   postgres_changes on the notifications table. When the backend
 *   inserts a new notification (via dispatch-push Edge Function),
 *   the TanStack Query cache is automatically invalidated and the
 *   list refreshes without manual pull-to-refresh.
 *
 * NAVIGATION:
 *   This screen is at `app/notifications/index.tsx` — a standalone
 *   route reached via the bell icon, not a tab. Deep linking from
 *   notification taps is deferred to a later step.
 */

import React from "react";
import { View, Text, FlatList, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Settings, ArrowLeft } from "lucide-react-native";
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useNotificationRealtime,
} from "@/hooks/useNotifications";
import {
  NotificationItem,
} from "@/components/notifications/NotificationItem";
import type { NotificationItemData } from "@/components/notifications/NotificationItem";
import { IconButton } from "@/components/ui/IconButton";

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { notifications, isLoading } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  // Subscribe to Realtime — new notifications appear without polling
  useNotificationRealtime();

  /**
   * Handle tapping a notification: mark it as read.
   * Deep linking to the relevant screen (e.g., badge detail, profile)
   * will be added in a future step using the notification's `data` field.
   */
  function handleNotificationPress(id: string) {
    markAsRead.mutate({ notificationId: id });
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-2">
        {/* Top row: back button, title, gear icon */}
        <View className="flex-row items-center justify-between">
          <IconButton
            icon={ArrowLeft}
            label={t("common.goBack")}
            onPress={() => router.back()}
            size={24}
            color="#FFFFFF"
          />
          <Text className="text-text-primary text-xl font-bold flex-1 ml-3">
            {t("notifications.title")}
          </Text>
          <IconButton
            icon={Settings}
            label={t("notifications.notificationSettings")}
            onPress={() => router.push("/settings/notification-preferences")}
            size={22}
            color="#9CA3AF"
          />
        </View>

        {/* Mark all read button */}
        <Pressable
          onPress={() => markAllAsRead.mutate()}
          className="self-end mt-2"
        >
          <Text className="text-primary text-sm font-medium">
            {t("notifications.markAllRead")}
          </Text>
        </Pressable>
      </View>

      {/* Content area — loading, empty, or list */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator testID="loading-indicator" size="large" />
        </View>
      ) : notifications.length > 0 ? (
        <FlatList<NotificationItemData>
          data={notifications as NotificationItemData[]}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem
              item={item}
              onPress={handleNotificationPress}
            />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-text-secondary text-base text-center">
            {t("notifications.noNotifications")}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
