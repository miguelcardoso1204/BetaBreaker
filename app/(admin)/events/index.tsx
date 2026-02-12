/**
 * Admin Event List Screen — Browse & Navigate to Events
 *
 * Displays all competition events at the admin's home gym in a FlatList.
 * Each event card shows: name, status badge, scoring model, and date range.
 * Tapping a card navigates to the edit/detail screen. A create button
 * navigates to the create form.
 *
 * DATA FLOW:
 *   1. useAuth() → get homeGymId for the current admin
 *   2. useEvents(homeGymId) → eventsService.getEvents() → PostgREST → Postgres
 *   3. Tap event card → router.push to edit screen
 *   4. Tap create button → router.push to create form
 *
 * STATES:
 *   - Loading: centered ActivityIndicator
 *   - Empty: "No events yet" message with create prompt
 *   - Error: error message
 *   - Data: FlatList of event cards
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
import { useEvents } from "@/hooks/useEvents";

/** Maps scoring model DB values to human-readable labels. */
const SCORING_LABELS: Record<string, string> = {
  tops_and_zones: "Tops & Zones",
  points: "Points",
  thousand_divide_by: "1000/Attempts",
  redpoint: "Redpoint",
};

/** Maps event status to a color class for the status badge. */
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500",
  registration_open: "bg-blue-500",
  ongoing: "bg-green-500",
  completed: "bg-purple-500",
  cancelled: "bg-red-500",
};

/**
 * Formats a timestamp to a short date string for display.
 * Shows month and day — enough context for an event list.
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function EventListScreen() {
  const { user } = useAuth();
  const { events, isLoading, error } = useEvents(user?.homeGymId);
  const router = useRouter();

  // ── Loading state ──────────────────────────────────────────────────
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

  // ── Error state ────────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || "Failed to load events"}
        </Text>
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────
  if (events.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {/* Header with create button even in empty state */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-xl font-bold text-text-primary">Events</Text>
          <Pressable
            onPress={() => router.push("/(admin)/events/create" as any)}
            accessibilityRole="button"
            testID="create-event-button"
            className="bg-accent px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-medium">New Event</Text>
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-secondary text-center text-base">
            No events yet
          </Text>
        </View>
      </View>
    );
  }

  // ── Event list ─────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background" testID="event-list-screen">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-text-primary">
          Events ({events.length})
        </Text>
        <Pressable
          onPress={() => router.push("/(admin)/events/create" as any)}
          accessibilityRole="button"
          testID="create-event-button"
          className="bg-accent px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-medium">New Event</Text>
        </Pressable>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }: { item: any }) => (
          <Pressable
            onPress={() => router.push(`/(admin)/events/${item.id}` as any)}
            accessibilityRole="button"
            className="bg-surface rounded-lg p-4 mb-3"
          >
            {/* Name + status badge */}
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-text-primary font-semibold text-base flex-1 mr-2">
                {item.name}
              </Text>
              <View
                className={`px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? "bg-gray-500"}`}
              >
                <Text className="text-white text-xs font-medium">
                  {item.status}
                </Text>
              </View>
            </View>

            {/* Scoring model + dates */}
            <View className="flex-row items-center justify-between">
              <Text className="text-text-secondary text-sm">
                {SCORING_LABELS[item.scoring_model] ?? item.scoring_model}
              </Text>
              <Text className="text-text-secondary text-xs">
                {formatDate(item.start_date)} – {formatDate(item.end_date)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
