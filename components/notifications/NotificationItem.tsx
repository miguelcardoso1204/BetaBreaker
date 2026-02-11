/**
 * NotificationItem — Single Notification in the Notification Center
 *
 * Presentational component that renders one notification row. Layout:
 *   [Icon] [Title + Body + Time]  [Unread Dot]
 *
 * Each notification type maps to a specific icon:
 *   - badge_earned → Award (achievement unlocked)
 *   - rank_change → Trophy (leaderboard position changed)
 *   - friend_send → Users (friend request)
 *   - route_retirement / comp_update → AlertCircle (alert/info)
 *   - anything else → Bell (generic fallback)
 *
 * Read notifications get reduced opacity (opacity-50) so unread
 * ones stand out visually in the list.
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import {
  Award,
  Trophy,
  Users,
  AlertCircle,
  Bell,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

/** Shape of a notification row from the notifications table */
export interface NotificationItemData {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface NotificationItemProps {
  item: NotificationItemData;
  onPress: (id: string) => void;
}

/**
 * Map notification type strings to Lucide icon components.
 * Unknown types fall back to the generic Bell icon so the UI
 * never breaks when new notification types are added server-side.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  badge_earned: Award,
  rank_change: Trophy,
  friend_send: Users,
  route_retirement: AlertCircle,
  comp_update: AlertCircle,
};

/**
 * Format a timestamp into a human-readable relative time string.
 * Examples: "2h ago", "3d ago", "Just now"
 *
 * Uses simple integer division — no external library needed for
 * the granularity we want (minutes, hours, days).
 */
function relativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function NotificationItem({ item, onPress }: NotificationItemProps) {
  // Look up the icon for this notification type, fallback to Bell
  const Icon = ICON_MAP[item.type] ?? Bell;

  return (
    <Pressable
      testID={`notification-item-${item.id}`}
      onPress={() => onPress(item.id)}
      // Read notifications fade to 50% opacity so unread items pop
      className={`flex-row items-center px-4 py-3 ${item.read ? "opacity-50" : ""}`}
    >
      {/* Type-specific icon */}
      <View className="w-10 h-10 rounded-full bg-surface items-center justify-center mr-3">
        <Icon size={20} color="#7C3AED" />
      </View>

      {/* Text content: title, body (truncated), and relative time */}
      <View className="flex-1">
        <Text className="text-text-primary text-sm font-bold">
          {item.title}
        </Text>
        <Text
          className="text-text-secondary text-xs mt-0.5"
          numberOfLines={2}
        >
          {item.body}
        </Text>
        <Text className="text-text-secondary text-xs mt-1">
          {relativeTime(item.created_at)}
        </Text>
      </View>

      {/* Unread indicator — small colored dot on the right side */}
      {!item.read && (
        <View
          testID="unread-dot"
          className="w-2.5 h-2.5 rounded-full bg-primary ml-2"
        />
      )}
    </Pressable>
  );
}
