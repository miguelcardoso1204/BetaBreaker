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
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import {
  useNotificationPreferences,
  useUpdatePreference,
} from "@/hooks/useNotifications";
import { IconButton } from "@/components/ui/IconButton";

/**
 * Category definitions — each entry maps to a row in the preferences table.
 * The key matches the `category` column, and the label/description are
 * displayed in the UI.
 */
const CATEGORIES = [
  {
    key: "friends",
    label: "Friends & Social",
    description: "Friend requests, follows, and social activity",
  },
  {
    key: "routes",
    label: "Routes & Gyms",
    description: "New routes, route updates, and gym announcements",
  },
  {
    key: "comps",
    label: "Competitions",
    description: "Competition invites, results, and schedule changes",
  },
  {
    key: "achievements",
    label: "Achievements",
    description: "Badges, streak milestones, and rank changes",
  },
] as const;

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const { preferences } = useNotificationPreferences();
  const updatePreference = useUpdatePreference();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Header with back button and title */}
      <View className="px-4 pt-14 pb-4 flex-row items-center">
        <IconButton
          icon={ArrowLeft}
          label="Go back"
          onPress={() => router.back()}
          size={24}
          color="#FFFFFF"
        />
        <Text className="text-text-primary text-xl font-bold ml-3">
          Notification Preferences
        </Text>
      </View>

      <Text className="text-text-secondary text-sm px-4 mb-4">
        Choose which notifications you want to receive. Disabled categories
        will not send push notifications or appear in your notification center.
      </Text>

      {/* Category toggles */}
      {CATEGORIES.map((cat) => (
        <View
          key={cat.key}
          className="flex-row items-center justify-between px-4 py-4 border-b border-surface"
        >
          <View className="flex-1 mr-4">
            <Text className="text-text-primary text-base font-medium">
              {cat.label}
            </Text>
            <Text className="text-text-secondary text-sm mt-1">
              {cat.description}
            </Text>
          </View>

          {/* Switch: missing preference defaults to enabled (opt-out model) */}
          <Switch
            value={preferences[cat.key] ?? true}
            onValueChange={(enabled: boolean) => {
              updatePreference.mutate({ category: cat.key, enabled });
            }}
            accessibilityLabel={cat.label}
          />
        </View>
      ))}
    </ScrollView>
  );
}
