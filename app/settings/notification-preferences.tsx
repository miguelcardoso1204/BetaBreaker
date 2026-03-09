/**
 * Notification Preferences Screen — Per-Category Toggle Controls
 *
 * Lets users opt out of specific notification categories. This is
 * an OPT-OUT model: all categories are enabled by default, and only
 * explicit disables create preference rows in the database.
 *
 * Four categories:
 *   - friends: Friend requests, follows, social activity
 *   - routes: New routes, retirements, gym updates
 *   - comps: Competition invites, results, schedule changes
 *   - achievements: Badge unlocks, streak milestones, rank changes
 *
 * The `useNotificationPreferences` hook returns a `Record<string, boolean>`
 * map. Missing keys default to `true` (enabled) in the UI via the
 * `preferences[category] ?? true` pattern.
 *
 * Toggle changes are persisted immediately via `useUpdatePreference`,
 * which upserts into the notification_preferences table using the
 * UNIQUE(user_id, category) constraint for idempotent writes.
 */

import React from "react";
import { View, Text, ScrollView, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import {
  useNotificationPreferences,
  useUpdatePreference,
} from "@/hooks/useNotifications";
import { IconButton } from "@/components/ui/IconButton";

/**
 * Category definitions — each entry maps to a row in the preferences table.
 * The key matches the `category` column. labelKey/descKey are i18n keys
 * resolved at render time via t() (since this array is defined outside
 * the component where hooks aren't available).
 */
const CATEGORIES = [
  {
    key: "friends",
    labelKey: "notifications.categorySocial",
    descKey: "notifications.categorySocialDesc",
  },
  {
    key: "routes",
    labelKey: "notifications.categoryRoutes",
    descKey: "notifications.categoryRoutesDesc",
  },
  {
    key: "comps",
    labelKey: "notifications.categoryCompetitions",
    descKey: "notifications.categoryCompetitionsDesc",
  },
  {
    key: "achievements",
    labelKey: "notifications.categoryAchievements",
    descKey: "notifications.categoryAchievementsDesc",
  },
] as const;

export default function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { preferences } = useNotificationPreferences();
  const updatePreference = useUpdatePreference();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Header with back button and title */}
      <View className="px-4 pt-2 pb-4 flex-row items-center">
        <IconButton
          icon={ArrowLeft}
          label={t("common.goBack")}
          onPress={() => router.back()}
          size={24}
          color="#FFFFFF"
        />
        <Text className="text-text-primary text-xl font-bold ml-3">
          {t("notifications.preferencesTitle")}
        </Text>
      </View>

      <Text className="text-text-secondary text-sm px-4 mb-4">
        {t("notifications.preferencesBody")}
      </Text>

      {/* Category toggles */}
      {CATEGORIES.map((cat) => (
        <View
          key={cat.key}
          className="flex-row items-center justify-between px-4 py-4 border-b border-surface"
        >
          <View className="flex-1 mr-4">
            <Text className="text-text-primary text-base font-medium">
              {t(cat.labelKey)}
            </Text>
            <Text className="text-text-secondary text-sm mt-1">
              {t(cat.descKey)}
            </Text>
          </View>

          {/* Switch: missing preference defaults to enabled (opt-out model) */}
          <Switch
            value={preferences[cat.key] ?? true}
            onValueChange={(enabled: boolean) => {
              updatePreference.mutate({ category: cat.key, enabled });
            }}
            accessibilityLabel={t(cat.labelKey)}
          />
        </View>
      ))}
    </ScrollView>
    </SafeAreaView>
  );
}
