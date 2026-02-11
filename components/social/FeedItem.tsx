/**
 * FeedItem — Single Activity Feed Entry
 *
 * Displays one ascent from a followed user in the activity feed.
 * Layout:
 *   [Date]  [Avatar] [Name] [action] [Route] [(Grade)]
 *    10       🟣      Alex   sent    Crimpy Arete (V4)
 *   Feb
 *
 * Presentational component — receives all data via the `item` prop.
 * No hooks or service calls.
 *
 * The date column shows day number + abbreviated month name,
 * making it easy to scan a chronological feed without full timestamps.
 */

import React from "react";
import { View, Text } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { canonicalToDisplay } from "@/utils/grades";

/** Shape of an activity feed item from the socialService query */
export interface ActivityFeedItem {
  id: string;
  user_id: string;
  status: string;
  attempts: number;
  created_at: string;
  route: {
    name: string | null;
    canonical_grade: number;
    color: string | null;
  };
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface FeedItemProps {
  item: ActivityFeedItem;
}

/**
 * Map ascent status to a human-readable past-tense verb.
 * These match the status enum in route_ascents.
 */
function statusVerb(status: string): string {
  switch (status) {
    case "sent":
      return "sent";
    case "flashed":
      return "flashed";
    case "attempted":
      return "attempted";
    case "project":
      return "projected";
    default:
      return "logged";
  }
}

/**
 * Parse a date string into day number and abbreviated month.
 * E.g., "2026-02-10T14:30:00Z" → { day: "10", month: "Feb" }
 */
function formatDate(dateString: string): { day: string; month: string } {
  const date = new Date(dateString);
  const day = date.getDate().toString();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return { day, month };
}

export function FeedItem({ item }: FeedItemProps) {
  const { route, profile } = item;
  const { day, month } = formatDate(item.created_at);
  const grade = canonicalToDisplay(route.canonical_grade, "v-scale");
  const verb = statusVerb(item.status);
  const displayName = profile.display_name ?? "Unknown";
  const routeName = route.name ?? "Unnamed Route";

  return (
    <View className="flex-row items-center py-3 px-4">
      {/* Date column — fixed width for alignment */}
      <View className="w-10 items-center mr-3">
        <Text className="text-text-primary text-lg font-bold">{day}</Text>
        <Text className="text-text-secondary text-xs">{month}</Text>
      </View>

      {/* Avatar */}
      <Avatar
        uri={profile.avatar_url ?? undefined}
        name={displayName}
        size="sm"
        testID="feed-avatar"
      />

      {/* Activity description */}
      <View className="flex-1 ml-3">
        <Text className="text-text-primary text-sm">
          <Text className="font-bold">{displayName}</Text>
          {" "}
          {verb}{" "}
          <Text className="font-bold">{routeName}</Text>
          {" "}
          <Text className="text-text-secondary">({grade})</Text>
        </Text>
      </View>
    </View>
  );
}
