// components/ui/BadgeIcon.tsx
//
// Circular achievement badge display with text-initial placeholder icons.
//
// This component renders earned (and unearned) badges throughout Beta Breaker:
//   - Profile screen: pinned badges displayed below the user's name
//   - Badge gallery: grid of all badges, earned ones highlighted
//   - Badge picker modal: selection UI for choosing which badges to pin
//
// WHY TEXT INITIALS INSTEAD OF REAL ICONS?
// Actual icon assets (SVGs or PNGs per badge type) aren't part of the project
// yet. Text initials ("V0", "FL", etc.) serve as recognizable placeholders
// following the same fallback pattern as the Avatar component. When icon
// assets are added later, only the inner circle content needs to change —
// the component API (props) stays the same.
//
// HOW THE ICON KEY MAPS TO INITIALS:
// The iconKey prop (e.g., "badge-v0", "badge-flash") is split on hyphens
// and the last segment is uppercased. This gives recognizable abbreviations:
//   - "badge-v0"         → "V0"
//   - "badge-flash"      → "FL" (first 2 chars)
//   - "badge-first-send" → "SE" (first 2 chars of last segment)
//
// EARNED vs. UNEARNED:
// Earned badges (default) display with the accent background at full opacity.
// Unearned badges use the surface background at 40% opacity — visually
// distinct so users can see what's achievable vs. already earned.

import React from "react";
import { Text, View } from "react-native";

/**
 * Props for the BadgeIcon component.
 *
 * `iconKey` identifies which badge icon to display. Currently used to
 * generate text initials; will map to actual icon assets in the future.
 */
export interface BadgeIconProps {
  /** Key identifying the badge type, e.g., "badge-v0", "badge-flash" */
  iconKey: string;
  /** Human-readable badge name displayed below the icon circle */
  name: string;
  /** Size preset: "sm" (36px) for compact layouts, "md" (48px) for galleries, "lg" (72px) for featured display */
  size?: "sm" | "md" | "lg";
  /** Whether the badge has been earned. Defaults to true. False = dimmed. */
  earned?: boolean;
  /** Optional testID for finding this element in tests */
  testID?: string;
}

/**
 * Size configuration for each preset — pixel dimensions and text sizes.
 * "sm" is used in the profile pinned badges row (compact).
 * "md" is used in the badge gallery and picker modal (more detail).
 */
const sizeConfig = {
  sm: { dimension: 36, textClass: "text-xs", nameClass: "text-xs" },
  md: { dimension: 48, textClass: "text-sm", nameClass: "text-xs" },
  lg: { dimension: 72, textClass: "text-xl", nameClass: "text-sm" },
} as const;

/**
 * Extracts a short abbreviation from a badge icon key.
 *
 * Algorithm:
 * 1. Split on hyphens: "badge-v0" → ["badge", "v0"]
 * 2. Take the last segment: "v0"
 * 3. Uppercase and truncate to 2 characters: "V0"
 *
 * This produces recognizable abbreviations without needing a lookup table.
 * When real icon assets are added, this function becomes unnecessary.
 */
function getIconInitials(iconKey: string): string {
  const parts = iconKey.split("-");
  // Use the last segment — it's the most distinctive part of the key
  const lastPart = parts[parts.length - 1];
  return lastPart.substring(0, 2).toUpperCase();
}

/**
 * BadgeIcon — a circular achievement badge with icon placeholder and name.
 *
 * Usage:
 * ```tsx
 * // Earned badge (default) — accent background, full opacity
 * <BadgeIcon iconKey="badge-v0" name="First V0" />
 *
 * // Unearned badge — surface background, dimmed
 * <BadgeIcon iconKey="badge-v0" name="First V0" earned={false} />
 *
 * // Small size for compact layouts
 * <BadgeIcon iconKey="badge-flash" name="First Flash" size="sm" />
 * ```
 */
export function BadgeIcon({
  iconKey,
  name,
  size = "md",
  earned = true,
  testID,
}: BadgeIconProps) {
  const { dimension, textClass, nameClass } = sizeConfig[size];
  const initials = getIconInitials(iconKey);

  // Earned badges use the accent purple background; unearned use surface grey
  const bgClass = earned ? "bg-accent" : "bg-surface";

  // accessibilityLabel lets screen readers announce the badge name
  // (e.g., "First V0"), making the badge gallery navigable by voice.
  return (
    <View
      testID={testID}
      accessibilityLabel={name}
      // The outer container wraps the circle + name label.
      // Centered alignment keeps the name text directly below the circle.
      // opacity: 0.4 for unearned badges dims the entire element (circle + name).
      className="items-center"
      style={earned ? undefined : { opacity: 0.4 }}
    >
      {/* The circular icon container — same approach as Avatar */}
      <View
        className={`rounded-full items-center justify-center ${bgClass}`}
        style={{ width: dimension, height: dimension }}
      >
        {/* Text initials as placeholder for actual badge icons */}
        <Text className={`text-white font-bold ${textClass}`}>
          {initials}
        </Text>
      </View>

      {/* Badge name label below the circle */}
      <Text
        className={`text-text-secondary ${nameClass} mt-1 text-center`}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}
