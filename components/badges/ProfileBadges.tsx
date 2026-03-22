// components/badges/ProfileBadges.tsx
//
// Displays pinned badges on the profile screen with an edit button.
//
// This component shows a horizontal row of earned badges that the user has
// chosen to "pin" for prominent display. Empty slots (dashed circles) show
// remaining pin capacity, visually encouraging users to earn more badges.
//
// LAYOUT:
//   [BadgeIcon] [BadgeIcon] [-- empty --] [Edit]
//
// The number of slots equals maxPins (determined by subscription tier):
//   - Free: 1 slot
//   - Pro: 3 slots
//
// WHY A SEPARATE COMPONENT INSTEAD OF INLINE IN PROFILE?
// Separation of concerns: ProfileBadges handles the badge layout and edit
// button, while the profile screen handles data fetching and modal state.
// This also makes the badge row independently testable.

import React from "react";
import { Text, View, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { BadgeIcon } from "@/components/ui/BadgeIcon";

/**
 * A user badge with its embedded badge definition — matches the shape
 * returned by getUserBadges (PostgREST resource embedding).
 */
interface UserBadgeWithDef {
  user_id: string;
  badge_id: string;
  awarded_at: string;
  badge: {
    id: string;
    name: string;
    icon_key: string;
  };
}

export interface ProfileBadgesProps {
  /** Resolved badge objects for badges the user has pinned */
  pinnedBadges: UserBadgeWithDef[];
  /** Callback when the user taps the Edit button to open the badge picker */
  onManagePress: () => void;
  /** Maximum number of pinnable badges (1 for free, 3 for pro) */
  maxPins: number;
}

/**
 * ProfileBadges — horizontal badge display row with empty slot placeholders.
 *
 * Usage:
 * ```tsx
 * <ProfileBadges
 *   pinnedBadges={resolvedBadges}
 *   onManagePress={() => setPickerVisible(true)}
 *   maxPins={user.tier === "pro" ? 3 : 1}
 * />
 * ```
 */
export function ProfileBadges({
  pinnedBadges,
  onManagePress,
  maxPins,
}: ProfileBadgesProps) {
  // useTranslation hook gives us the t() function for looking up
  // translated strings by key from the current locale's JSON file.
  const { t } = useTranslation();

  // Calculate how many empty placeholder slots to render.
  // If the user has pinned 2 of 3 slots, show 1 empty slot.
  const emptySlotCount = Math.max(0, maxPins - pinnedBadges.length);

  return (
    <View className="px-4 py-3">
      {/* Section header with Edit button */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-text-primary text-base font-semibold">
          {t("badges.pinnedBadges")}
        </Text>
        <Pressable
          onPress={onManagePress}
          accessibilityRole="button"
          accessibilityLabel={t("badges.edit")}
          className="p-2"
        >
          <Text className="text-accent text-sm font-medium">{t("badges.edit")}</Text>
        </Pressable>
      </View>

      {/* Badge row: pinned badges + empty slots.
          Always centered and using the large size so medals feel prominent. */}
      <View className="flex-row gap-4 justify-center">
        {/* Render each pinned badge as a BadgeIcon */}
        {pinnedBadges.map((ub) => (
          <BadgeIcon
            key={ub.badge_id}
            iconKey={ub.badge.icon_key}
            name={ub.badge.name}
            size="lg"
          />
        ))}

        {/* Render empty slots as dashed circle placeholders.
            These visually indicate remaining pin capacity and
            encourage users to earn more badges to fill the slots.
            Sized to match the large BadgeIcon beside them. */}
        {Array.from({ length: emptySlotCount }).map((_, index) => (
          <View
            key={`empty-${index}`}
            testID={`empty-slot-${index}`}
            accessibilityLabel={t("accessibility.emptyBadgeSlot")}
            className="items-center"
          >
            <View
              className="rounded-full items-center justify-center border-2 border-dashed border-text-secondary"
              style={{ width: 72, height: 72 }}
            >
              <Text className="text-text-secondary text-lg">+</Text>
            </View>
            {/* Spacer to match BadgeIcon's name label height */}
            <Text className="text-transparent text-sm mt-1"> </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
