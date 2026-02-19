// components/badges/BadgePicker.tsx
//
// Modal overlay for selecting which earned badges to pin to the user's profile.
//
// This component shows all earned badges in a scrollable grid. Users tap badges
// to toggle their pinned state. A checkmark overlay indicates selected badges.
// The Save button commits the selection via the onSave callback.
//
// LIMIT ENFORCEMENT:
// The maxPins prop (determined by subscription tier) prevents selecting more
// badges than allowed. When the limit is reached, tapping additional badges
// has no effect — the UI silently ignores the tap rather than showing an error,
// since the visual feedback (all slots filled) makes the constraint clear.
//
// WHY React Native Modal INSTEAD OF A BOTTOM SHEET?
// Modal is built into React Native — no extra library dependency. A bottom
// sheet (e.g., @gorhom/bottom-sheet) would be nicer UX but adds complexity.
// This can be upgraded later without changing the component's public API.
//
// STATE MANAGEMENT:
// Selected badge IDs are tracked in local React state (useState). The parent
// doesn't need to track intermediate selections — only the final "Save"
// result matters. This keeps the parent (profile screen) simple.

import React, { useState, useEffect } from "react";
import { Text, View, Modal, Pressable, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { BadgeIcon } from "@/components/ui/BadgeIcon";

/**
 * Badge data shape matching the PostgREST resource embedding result.
 * Each entry has user_badge fields + nested badge definition.
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

export interface BadgePickerProps {
  /** All badges the user has earned — the full selection pool */
  earnedBadges: UserBadgeWithDef[];
  /** Badge IDs currently pinned — pre-selected in the picker */
  pinnedIds: string[];
  /** Maximum number of badges that can be pinned (tier-based) */
  maxPins: number;
  /** Callback with the final selection when Save is pressed */
  onSave: (badgeIds: string[]) => void;
  /** Callback to close the modal without saving */
  onClose: () => void;
  /** Whether the modal is visible */
  visible: boolean;
}

/**
 * BadgePicker — a modal for selecting which badges to pin.
 *
 * Usage:
 * ```tsx
 * <BadgePicker
 *   earnedBadges={userBadges}
 *   pinnedIds={currentPinnedIds}
 *   maxPins={3}
 *   onSave={(ids) => setPinnedBadges(ids)}
 *   onClose={() => setVisible(false)}
 *   visible={isPickerOpen}
 * />
 * ```
 */
export function BadgePicker({
  earnedBadges,
  pinnedIds,
  maxPins,
  onSave,
  onClose,
  visible,
}: BadgePickerProps) {
  // useTranslation hook gives us the t() function for looking up
  // translated strings by key from the current locale's JSON file.
  const { t } = useTranslation();

  // Local state tracks which badges are currently selected in the picker.
  // Initialized from pinnedIds when the modal opens.
  const [selected, setSelected] = useState<string[]>(pinnedIds);

  // Reset selection to current pinned IDs whenever the modal opens.
  // This ensures the picker always starts with the correct state,
  // even if the user closed without saving last time.
  useEffect(() => {
    if (visible) {
      setSelected(pinnedIds);
    }
  }, [visible, pinnedIds]);

  /**
   * Toggle a badge's selected state.
   *
   * If the badge is already selected → deselect it.
   * If not selected AND under maxPins limit → select it.
   * If not selected AND at maxPins limit → ignore (can't exceed limit).
   */
  function handleToggle(badgeId: string) {
    setSelected((prev) => {
      if (prev.includes(badgeId)) {
        // Deselect — always allowed
        return prev.filter((id) => id !== badgeId);
      }
      if (prev.length >= maxPins) {
        // At limit — ignore the tap
        return prev;
      }
      // Select — add to the array
      return [...prev, badgeId];
    });
  }

  function handleSave() {
    onSave(selected);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      {/* Semi-transparent backdrop */}
      <View className="flex-1 bg-black/50 justify-end">
        {/* Modal content sheet */}
        <View className="bg-background rounded-t-2xl p-4 max-h-[70%]">
          {/* Header with title and Close button */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-text-primary text-lg font-bold">
              {t("badges.selectBadges")}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="p-2"
            >
              <Text className="text-text-secondary text-sm">{t("common.close")}</Text>
            </Pressable>
          </View>

          {/* Selection count indicator */}
          <Text className="text-text-secondary text-sm mb-3">
            {t("badges.selectedCount", { selected: selected.length, max: maxPins })}
          </Text>

          {/* Badge grid — scrollable for users with many earned badges */}
          <ScrollView className="mb-4">
            <View className="flex-row flex-wrap gap-4">
              {earnedBadges.map((ub) => {
                const isSelected = selected.includes(ub.badge_id);
                return (
                  <Pressable
                    key={ub.badge_id}
                    testID={`picker-item-${ub.badge_id}`}
                    onPress={() => handleToggle(ub.badge_id)}
                    accessibilityRole="checkbox"
                    accessibilityLabel={ub.badge.name}
                    accessibilityState={{ checked: isSelected }}
                    className="items-center"
                  >
                    {/* Badge icon display */}
                    <BadgeIcon
                      iconKey={ub.badge.icon_key}
                      name={ub.badge.name}
                      size="md"
                    />

                    {/* Checkmark overlay for selected badges.
                        Rendered conditionally — only appears when the badge
                        is in the selected array. Uses testID for test assertions. */}
                    {isSelected && (
                      <View
                        testID={`check-${ub.badge_id}`}
                        className="absolute -top-1 -right-1 bg-accent rounded-full w-5 h-5 items-center justify-center"
                      >
                        <Text className="text-white text-xs font-bold">
                          {t("badges.checkmark")}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Save button — commits the selection */}
          <Pressable
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel={t("common.save")}
            className="bg-accent rounded-lg py-3 items-center"
          >
            <Text className="text-white font-semibold text-base">{t("common.save")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
