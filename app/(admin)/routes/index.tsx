/**
 * Admin Route List Screen — Browse & Navigate to Routes
 *
 * Displays all climbing routes at the admin's gym in a FlatList.
 * Each route card shows: name, V-scale grade, status badge, and color dot.
 * Tapping a card navigates to the edit/detail screen. A create button
 * navigates to the create form.
 *
 * Unlike the climber route list, this shows ALL statuses (active, retiring_soon,
 * archived) so admins can manage the full route lifecycle.
 *
 * DATA FLOW:
 *   1. useAuth() → get adminGymId for the current admin
 *   2. useAdminRoutes(adminGymId) → routeService.getRoutes() with all statuses
 *   3. Tap route card → router.push to edit screen
 *   4. Tap create button → router.push to create form
 */

import React from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRoutes } from "@/hooks/useAdminRoutes";
import { canonicalToDisplay } from "@/utils/grades";

/** Maps route status to a color class for the status badge. */
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500",
  retiring_soon: "bg-yellow-500",
  archived: "bg-gray-500",
};

export default function RouteListScreen() {
  const { user, adminGymId } = useAuth();
  const { routes, isLoading, error } = useAdminRoutes(adminGymId);
  const router = useRouter();

  // ── Loading state ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="loading-indicator"
      >
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // ── Error state ──────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || "Failed to load routes"}
        </Text>
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (routes.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {/* Header with create button even in empty state */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-xl font-bold text-text-primary">Routes</Text>
          <Pressable
            onPress={() => router.push("/(admin)/routes/create" as any)}
            accessibilityRole="button"
            testID="create-route-button"
            className="bg-accent px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-medium">New Route</Text>
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-secondary text-center text-base">
            No routes yet
          </Text>
        </View>
      </View>
    );
  }

  // ── Route list ───────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background" testID="route-list-screen">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-text-primary">
          Routes ({routes.length})
        </Text>
        <Pressable
          onPress={() => router.push("/(admin)/routes/create" as any)}
          accessibilityRole="button"
          testID="create-route-button"
          className="bg-accent px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-medium">New Route</Text>
        </Pressable>
      </View>

      <FlatList
        data={routes}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }: { item: any }) => (
          <Pressable
            onPress={() => router.push(`/(admin)/routes/${item.id}` as any)}
            accessibilityRole="button"
            className="bg-surface rounded-lg p-4 mb-3"
          >
            {/* Name + status badge */}
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center flex-1 mr-2">
                {/* Color dot — shows the route's tape/hold color */}
                {item.color && (
                  <View
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <Text className="text-text-primary font-semibold text-base flex-1">
                  {item.name || "Unnamed Route"}
                </Text>
              </View>
              <View
                className={`px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? "bg-gray-500"}`}
              >
                <Text className="text-white text-xs font-medium">
                  {item.status}
                </Text>
              </View>
            </View>

            {/* Grade + wall section */}
            <View className="flex-row items-center justify-between">
              <Text className="text-text-secondary text-sm">
                {canonicalToDisplay(item.canonical_grade, "v-scale")}
              </Text>
              {item.wall_section && (
                <Text className="text-text-secondary text-xs">
                  {item.wall_section}
                </Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
