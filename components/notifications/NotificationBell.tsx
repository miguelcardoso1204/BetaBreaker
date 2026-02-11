/**
 * NotificationBell — Bell Icon with Unread Count Badge
 *
 * A composite component that combines an IconButton (bell icon) with
 * an absolute-positioned badge overlay showing the unread notification
 * count. Used in the home screen header.
 *
 * Badge behavior:
 *   - Hidden when count === 0 (no clutter when caught up)
 *   - Shows exact count for 1–99
 *   - Caps at "99+" for 100+ (prevents layout overflow)
 *   - Red background (bg-error) for urgency
 *   - Positioned at top-right corner of the bell icon
 */

import React from "react";
import { View, Text } from "react-native";
import { Bell } from "lucide-react-native";
import { IconButton } from "@/components/ui/IconButton";

export interface NotificationBellProps {
  count: number;
  onPress: () => void;
}

export function NotificationBell({ count, onPress }: NotificationBellProps) {
  // Format the count text — cap at 99+ to prevent the badge
  // from growing too wide and breaking the layout
  const badgeText = count >= 100 ? "99+" : String(count);

  return (
    <View>
      <IconButton
        icon={Bell}
        label="Notifications"
        onPress={onPress}
        size={24}
        color="#FFFFFF"
      />

      {/* Badge overlay — only rendered when there are unread notifications */}
      {count > 0 && (
        <View
          testID="notification-badge"
          className="absolute -top-1 -right-1 bg-error rounded-full min-w-[18px] h-[18px] items-center justify-center px-1"
          // pointerEvents none so taps pass through to the IconButton
          pointerEvents="none"
        >
          <Text className="text-white text-[10px] font-bold">
            {badgeText}
          </Text>
        </View>
      )}
    </View>
  );
}
