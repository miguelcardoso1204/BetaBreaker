// components/ui/Divider.tsx
//
// Horizontal line separator used between content sections.
//
// In the Beta Breaker mockups, thin dark dividers appear between:
//   - Activity feed entries on the home screen
//   - Video submission rows in the route detail view
//   - Settings options in the profile/settings screen
//   - Leaderboard rows when grouped by gym
//
// WHY A DEDICATED DIVIDER COMPONENT?
// You might think "just use a View with a border" — and you could!
// But having a named <Divider /> component is better for two reasons:
//   1. **Semantic clarity**: When reading JSX, <Divider /> instantly
//      communicates "this is a visual separator." A raw View with
//      border classes requires the reader to infer intent from styles.
//   2. **Consistency**: Every divider in the app uses the same height
//      (1px via h-px) and the same color (bg-border from our theme).
//      If the design team changes the divider style, we update ONE file.
//
// HOW IT WORKS:
// The component renders a single View with:
//   - `h-px`: sets height to 1 pixel (Tailwind's "hairline" class)
//   - `bg-border`: uses the "border" color from our tailwind.config.js
//     theme, which maps to a subtle gray (#374151) in dark mode
//   - `accessibilityRole="none"`: tells screen readers to skip this
//     element entirely — it's purely decorative, not meaningful content
//
// The `className` prop lets callers add extra spacing. For example,
// `<Divider className="my-4" />` adds vertical margin above and below.
// This is the NativeWind pattern for customizing shared components
// without modifying the component itself.

import React from "react";
import { View } from "react-native";

/**
 * Props for the Divider component.
 *
 * Both props are optional because the Divider has sensible defaults:
 * no extra classes and no testID. This keeps the common usage as
 * simple as possible: just `<Divider />`.
 */
export interface DividerProps {
  /** Additional NativeWind classes (e.g., margins like "my-4" or "mx-2"). */
  className?: string;
  /** Optional testID for finding this element in tests. */
  testID?: string;
}

/**
 * Divider — a thin horizontal line for separating content sections.
 *
 * Usage:
 * ```tsx
 * // Basic divider with no extra spacing
 * <Divider />
 *
 * // Divider with vertical margin for breathing room
 * <Divider className="my-4" />
 *
 * // Divider with horizontal inset (indented from edges)
 * <Divider className="mx-4" />
 * ```
 *
 * WHY DEFAULT PARAMETERS?
 * The `className = ""` default means we can always safely concatenate
 * it into the template literal without checking for undefined first.
 * Without this default, `bg-border ${undefined}` would render the
 * literal string "undefined" as a class name — a subtle bug!
 */
export function Divider({ className = "", testID }: DividerProps) {
  return (
    <View
      testID={testID}
      // NativeWind class composition:
      // - h-px: 1 pixel tall — the thinnest possible line
      // - bg-border: uses our theme's border color (subtle gray)
      // - ${className}: any extra classes the caller passes in
      className={`h-px bg-border ${className}`}
      // accessibilityRole="none" tells assistive technology (screen readers)
      // to ignore this element entirely. Dividers are visual decoration —
      // they don't carry meaning that a visually impaired user needs to hear.
      // Without this, the screen reader might announce "separator" or read
      // the element as an empty container, which is confusing.
      accessibilityRole="none"
    />
  );
}
