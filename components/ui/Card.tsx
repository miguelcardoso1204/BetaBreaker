// components/ui/Card.tsx
//
// Container component for grouping related content into a visually distinct
// "card" — a rectangular surface with rounded corners, padding, and an
// optional tap handler.
//
// Cards are one of the most common UI patterns in Beta Breaker. They appear
// in route lists, gym navigation, leaderboards, and session logs. The design
// matches the app's dark theme (see Documentation/DesignSystem.md).
//
// WHY THREE VARIANTS?
// Different contexts need different visual weight:
//   - "default": Dark surface background (#1C1C28), no border.
//     This is the workhorse — used for route browse cards, gym nav cards,
//     and most content containers. The surface color is slightly lighter
//     than the app background, creating a subtle visual layer.
//   - "elevated": Even lighter surface (#252536) for emphasis.
//     Used when a card needs to stand out, like a selected item or a
//     highlighted card. The extra brightness draws the eye.
//   - "outlined": Transparent background with a border line.
//     Used for list items (leaderboard entries, log entries) where you want
//     separation without heavy background blocks. Feels lighter and airier.
//
// WHY CONDITIONALLY PRESSABLE?
// Some cards are static containers (just display info), while others are
// interactive (tapping a route card navigates to route details). Instead of
// always wrapping in Pressable (which adds overhead and accessibility noise),
// we conditionally render:
//   - With `onPress` → <Pressable> for tap handling + screen reader announcement
//   - Without `onPress` → <View> for a plain, non-interactive container
//
// This pattern keeps the API simple: just pass `onPress` when you need it.
//
// WHY NATIVEWIND CLASSES INSTEAD OF STYLESHEET?
// NativeWind compiles Tailwind utility classes into React Native StyleSheet
// objects at build time. This gives us:
//   - Consistent design tokens (colors, spacing, radii from tailwind.config.js)
//   - Rapid iteration — change a class string, see it immediately
//   - Familiarity for web developers who know Tailwind CSS

import React from "react";
import { Pressable, View } from "react-native";

/**
 * Props for the Card component.
 *
 * TypeScript interfaces define the "shape" of props a component accepts.
 * This gives us compile-time type checking and editor autocomplete.
 * `React.ReactNode` is the type for anything renderable — strings, elements,
 * arrays, fragments, etc.
 */
export interface CardProps {
  /** Content displayed inside the card. Can be any renderable React elements. */
  children: React.ReactNode;

  /**
   * Visual style variant. Defaults to "default".
   * - "default": surface background, no border (most common)
   * - "elevated": lighter surface for emphasis
   * - "outlined": transparent with border
   */
  variant?: "default" | "elevated" | "outlined";

  /**
   * When provided, the card becomes tappable (wraps in Pressable).
   * Used for cards that navigate somewhere on tap, like route cards.
   */
  onPress?: () => void;

  /** Test ID for finding this component in tests. */
  testID?: string;

  /**
   * Additional NativeWind classes to merge with the card's base styles.
   * This lets parent components customize spacing, width, etc. without
   * needing to wrap the Card in another View.
   */
  className?: string;

  /**
   * Accessibility label for screen readers. Only relevant when onPress is
   * provided (i.e., the card is interactive). Screen readers will announce
   * this text so users know what tapping the card does.
   */
  accessibilityLabel?: string;
}

// --- Variant Style Map ---
// Maps each variant name to its NativeWind class string.
// "as const" tells TypeScript these are literal string values, not just `string`.
// This enables exhaustive checking — if we add a variant to the type but
// forget to add it here, TypeScript will error.
const variantClasses = {
  // Default: dark surface background with rounded corners.
  // "bg-surface" maps to the surface color in our Tailwind theme (#1C1C28).
  // "rounded-lg" gives 12px border radius for that modern card look.
  default: "bg-surface rounded-lg",

  // Elevated: lighter surface to stand out from default cards.
  // "bg-surface-elevated" maps to #252536 in our theme — noticeably brighter
  // than the regular surface, creating a visual "lift" effect.
  elevated: "bg-surface-elevated rounded-lg",

  // Outlined: transparent background with a thin border.
  // "border" adds a 1px border, "border-border" uses our theme's border color.
  // This is visually lighter than a filled card — good for dense lists.
  outlined: "border border-border rounded-lg",
} as const;

/**
 * Card — a container for grouping related content.
 *
 * Usage examples:
 * ```tsx
 * // Static card (just a container)
 * <Card>
 *   <Text>Route info here</Text>
 * </Card>
 *
 * // Pressable card (navigates on tap)
 * <Card onPress={() => router.push(`/routes/${id}`)}>
 *   <RouteCardContent route={route} />
 * </Card>
 *
 * // Outlined variant for list items
 * <Card variant="outlined">
 *   <LeaderboardEntry rank={1} user={user} />
 * </Card>
 * ```
 */
export function Card({
  children,
  variant = "default",
  onPress,
  testID,
  className = "",
  accessibilityLabel,
}: CardProps) {
  // Build the full class string by combining:
  // 1. "p-4" — 16px padding on all sides (consistent inner spacing)
  // 2. variantClasses[variant] — background/border based on the chosen variant
  // 3. className — any additional classes passed by the parent component
  //
  // Template literals with spaces between each part ensure NativeWind can
  // parse each class individually. Extra spaces are harmless.
  const baseClasses = `p-4 ${variantClasses[variant]} ${className}`;

  // Conditional rendering based on whether onPress is provided.
  // This is a common React pattern: choose which component to render
  // based on the props you receive.
  if (onPress) {
    // When the card is interactive, use Pressable — React Native's modern
    // touch-handling primitive. Pressable gives us:
    //   - onPress callback for tap events
    //   - Automatic accessibility handling (screen readers announce it as tappable)
    //   - Future hover/focus support for web (Expo supports web)
    // When the card is interactive, Pressable gets accessibilityRole="button"
    // so screen readers announce it as tappable, and the accessibilityLabel
    // provides context about what tapping it does (e.g., "Blue Thunder, V4").
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        className={baseClasses}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    );
  }

  // When the card is static, use a plain View — the most basic container
  // in React Native. No touch handling, no accessibility noise, just layout.
  return (
    <View testID={testID} className={baseClasses}>
      {children}
    </View>
  );
}
