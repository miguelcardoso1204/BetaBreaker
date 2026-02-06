// components/ui/Badge.tsx
//
// Small status/label pill used throughout Beta Breaker for inline metadata:
//   - "New!" warning badge on recently set routes (Route Browse screen)
//   - "Verified" success badge on confirmed send status
//   - "Failed" error badge on sync failures
//   - Climbing style tags on the Ascent form ("Power", "Footwork", "Endurance")
//
// WHY A BADGE COMPONENT?
// Badges are one of the most repeated UI patterns in the app. Without a
// shared component, every screen would re-implement the same pill shape
// with slightly different padding, font sizes, and border radii. A single
// Badge component enforces visual consistency and makes it easy to update
// the design system in one place.
//
// VARIANT SYSTEM:
// The badge supports five variants, each mapping to a semantic color from
// the design system (defined in tailwind.config.js):
//   - "default" → bg-accent (purple #7C3AED) — general-purpose labels
//   - "success" → bg-success (green #22C55E) — positive statuses
//   - "warning" → bg-warning (amber #F59E0B) — attention-drawing labels
//   - "error"   → bg-error (red #EF4444)     — negative statuses
//   - "tag"     → custom color via `color` prop — climbing style tags
//
// The "tag" variant is special because climbing style tags each need a
// unique color. Instead of defining a NativeWind class for every possible
// tag color, we use an inline `style` prop with `backgroundColor`. This
// is the recommended approach when colors are dynamic/data-driven rather
// than part of a fixed set.
//
// WHY NOT USE accessibilityRole?
// Unlike Button, a Badge is purely informational — it's not interactive.
// Screen readers will read it as part of the surrounding text flow, which
// is the correct behavior. Adding an explicit role would actually hurt
// accessibility by creating unnecessary navigation stops.

import React from "react";
import { Text, View } from "react-native";

/**
 * Props for the Badge component.
 *
 * TypeScript interfaces serve as a "contract" — they tell other developers
 * (and the compiler) exactly what props this component accepts. If you
 * pass a prop with the wrong type, TypeScript catches it at build time
 * instead of at runtime.
 */
export interface BadgeProps {
  /** Text displayed inside the badge pill. Keep it short (1–2 words). */
  label: string;

  /**
   * Visual variant controlling the background color.
   * Defaults to "default" (accent purple).
   *
   * - "default": General-purpose (accent purple)
   * - "success": Positive status (green)
   * - "warning": Attention-drawing (amber)
   * - "error": Negative status (red)
   * - "tag": Custom color via the `color` prop
   */
  variant?: "default" | "success" | "warning" | "error" | "tag";

  /**
   * Custom background color for the "tag" variant.
   * Accepts any valid CSS color string (hex, rgb, hsl).
   * Ignored when variant is not "tag".
   */
  color?: string;

  /** Optional testID passed to the outer View for targeting in tests. */
  testID?: string;
}

// --- Variant → NativeWind class mapping ---
//
// Each variant maps to a Tailwind background color class defined in our
// tailwind.config.js theme. The "tag" variant gets an empty string because
// its color is applied via inline style instead.
//
// WHY "as const"?
// The `as const` assertion tells TypeScript to treat these values as
// literal string types (e.g., "bg-accent") rather than just `string`.
// This enables better autocomplete and catches typos at compile time.
const variantClasses = {
  default: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  tag: "",
} as const;

/**
 * Badge — a small colored pill for inline status labels and tags.
 *
 * Usage:
 * ```tsx
 * // Semantic variants — color is determined by the variant
 * <Badge label="New!" variant="warning" />
 * <Badge label="Verified" variant="success" />
 * <Badge label="Failed" variant="error" />
 *
 * // Tag variant — color is passed explicitly
 * <Badge label="Power" variant="tag" color="#EF4444" />
 * <Badge label="Footwork" variant="tag" color="#3B82F6" />
 * ```
 *
 * The component is intentionally simple — no onPress, no icons, no
 * loading state. Badges are display-only. If you need an interactive
 * chip (e.g., a filter toggle), that would be a separate component.
 */
export function Badge({
  label,
  variant = "default",
  color,
  testID,
}: BadgeProps) {
  // Determine whether to use an inline backgroundColor style.
  // This is only needed for the "tag" variant when a color is provided.
  // For all other variants, NativeWind handles the background via className.
  const useInlineColor = variant === "tag" && color;

  return (
    <View
      testID={testID}
      // NativeWind class composition:
      // - px-2 py-1: compact horizontal/vertical padding (8px / 4px)
      // - rounded-full: fully rounded corners to create the "pill" shape
      // - variantClasses[variant]: semantic background color from the theme
      className={`px-2 py-1 rounded-full ${variantClasses[variant]}`}
      // Inline style is only applied for the "tag" variant.
      // NativeWind classes and inline styles can coexist — React Native
      // merges them, with inline styles taking precedence for overlapping
      // properties like backgroundColor.
      style={useInlineColor ? { backgroundColor: color } : undefined}
    >
      {/* Badge text styling:
          - text color depends on variant: warning uses dark text for contrast
            (white on amber #F59E0B fails WCAG AA at ~2.1:1 ratio), all others
            use white text which has adequate contrast on their backgrounds.
          - text-xs: small font size (12px) — badges should be compact
          - font-semibold: medium-bold weight for legibility at small sizes */}
      <Text
        className={`text-xs font-semibold ${
          variant === "warning" ? "text-black" : "text-white"
        }`}
      >
        {label}
      </Text>
    </View>
  );
}
