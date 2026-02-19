// components/ui/Avatar.tsx
//
// Circular user avatar with image or initials fallback.
//
// Avatars appear throughout Beta Breaker wherever users are represented:
//   - Leaderboard rows (showing each climber's photo alongside their rank)
//   - Video submission lists (who submitted beta for a route)
//   - Profile screen header (large avatar at the top)
//   - Activity feed entries (who logged a send, commented, etc.)
//
// WHY TWO RENDERING MODES (IMAGE vs. INITIALS)?
// Not every user uploads a profile photo, and photos sometimes fail to
// load (slow network, expired URL, server error). If we only supported
// images, users without photos would see a broken image placeholder or
// an empty circle — both bad UX. The initials fallback provides a
// recognizable, colorful representation even without a photo.
//
// HOW THE INITIALS FALLBACK WORKS:
// The `getInitials()` helper extracts uppercase letters from the user's
// display name:
//   - "Alex Honnold" → "AH" (first + last initial)
//   - "Alex" → "A" (just the first letter)
//   - "" → "?" (edge case: empty name gets a question mark)
// These initials are rendered as white bold text centered on a purple
// accent background — matching the app's primary brand color.
//
// WHY expo-image INSTEAD OF React Native's Image?
// expo-image (from the Expo SDK) provides several advantages over the
// built-in React Native Image component:
//   - **Caching**: Automatically caches images on disk so repeat loads
//     are instant. React Native's Image has no built-in disk cache.
//   - **Progressive loading**: Can show a blurred placeholder while the
//     full image downloads — smoother UX on slow connections.
//   - **Modern formats**: Supports WebP, AVIF, and animated images
//     out of the box on both platforms.
//   - **contentFit**: Uses the CSS-like `contentFit` prop instead of
//     React Native's `resizeMode`. "cover" means the image fills the
//     container while maintaining aspect ratio (cropping if needed).
//
// SIZE SYSTEM:
// Three size presets keep avatar usage consistent across the app:
//   - "sm" (32px): Compact spaces like leaderboard rows
//   - "md" (40px): Default — activity feed, comments, list items
//   - "lg" (64px): Profile header, prominent displays
// Sizes are applied via inline `style` rather than NativeWind classes
// because they need exact pixel values for the circular shape (the View
// must be a perfect square for `rounded-full` to produce a circle).

import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";

/**
 * Props for the Avatar component.
 *
 * `name` is always required because we need it for:
 * 1. The initials fallback when no image is provided
 * 2. The accessibility label for screen readers (even when an image shows)
 */
export interface AvatarProps {
  /** Image URL for the user's photo. When undefined, shows initials. */
  uri?: string;
  /** User's display name — used to generate initials and accessibility label. */
  name: string;
  /** Size preset controlling the avatar's dimensions. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  /** Optional testID for finding this element in tests. */
  testID?: string;
}

/**
 * Size configuration mapping — defines the pixel dimensions and text
 * class for each size preset.
 *
 * WHY "as const"?
 * The `as const` assertion makes TypeScript treat these as literal types:
 *   - `dimension` becomes `32 | 40 | 64` instead of just `number`
 *   - `textClass` becomes `"text-xs" | "text-sm" | "text-xl"` instead of `string`
 * This gives better type safety and enables exhaustiveness checking —
 * if we add a new size to AvatarProps but forget to add it here,
 * TypeScript will catch the error at compile time.
 */
const sizeConfig = {
  sm: { dimension: 32, textClass: "text-xs" },
  md: { dimension: 40, textClass: "text-sm" },
  lg: { dimension: 64, textClass: "text-xl" },
} as const;

/**
 * Extracts uppercase initials from a name string.
 *
 * Algorithm:
 * 1. Trim whitespace from both ends
 * 2. Split on one or more whitespace characters (handles multiple spaces)
 * 3. If empty after trim → return "?" (defensive fallback)
 * 4. If single word → return first character uppercased
 * 5. If multiple words → return first char of first word + first char of last word
 *
 * Examples:
 *   "Alex Honnold"       → "AH"
 *   "Alex"               → "A"
 *   "Alex  Dean  Honnold"→ "AH" (ignores middle names)
 *   ""                   → "?"
 *   "  "                 → "?"
 *
 * WHY LAST NAME instead of second name?
 * Using `parts[parts.length - 1]` (last word) instead of `parts[1]`
 * (second word) handles names with middle names correctly. "Mary Jane
 * Watson" shows "MW" not "MJ" — the last name is more identifying.
 */
function getInitials(name: string): string {
  // Split on whitespace, filtering out empty strings from multiple spaces
  const parts = name.trim().split(/\s+/);

  // Edge case: empty string or whitespace-only string
  if (parts.length === 0 || parts[0] === "") return "?";

  // Single-word name: just the first letter
  if (parts.length === 1) return parts[0][0].toUpperCase();

  // Multi-word name: first initial + last initial
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Avatar — a circular user representation with image or initials fallback.
 *
 * Usage:
 * ```tsx
 * // With a photo — shows the image in a circle
 * <Avatar uri="https://example.com/photo.jpg" name="Alex Honnold" />
 *
 * // Without a photo — shows "AH" on a purple background
 * <Avatar name="Alex Honnold" />
 *
 * // Small avatar for compact layouts (leaderboard rows)
 * <Avatar name="Alex" size="sm" />
 *
 * // Large avatar for the profile header
 * <Avatar uri={user.avatarUrl} name={user.displayName} size="lg" />
 * ```
 *
 * CONDITIONAL RENDERING PATTERN:
 * The component uses a ternary (`uri ? <Image /> : <Text />`) to
 * choose between image and initials. This is the standard React
 * pattern for conditional rendering — only ONE of the two branches
 * is included in the component tree at any time.
 */
export function Avatar({
  uri,
  name,
  size = "md",
  testID,
}: AvatarProps) {
  // Destructure the size config for the selected preset.
  // `dimension` is the width/height in pixels.
  // `textClass` is the NativeWind class controlling initials font size.
  const { dimension, textClass } = sizeConfig[size];

  // accessibilityLabel is on the outer View (not the inner Image)
  // so it works for BOTH rendering modes — image and initials. Previously
  // it was on the Image, so initials mode had no a11y label at all.
  // Screen readers now announce "Alex's avatar" regardless of mode.
  return (
    <View
      testID={testID}
      accessibilityLabel={`${name}'s avatar`}
      // NativeWind classes for the outer container:
      // - rounded-full: makes the square View into a perfect circle
      //   (only works when width === height, which we ensure via style)
      // - overflow-hidden: clips the image to the circular shape
      //   (without this, the image corners would poke out)
      // - items-center justify-center: centers the initials text both
      //   horizontally and vertically within the circle
      // - bg-accent: purple background — visible when showing initials
      //   (hidden behind the image when a photo is loaded)
      className="rounded-full overflow-hidden items-center justify-center bg-accent"
      // Inline style for exact pixel dimensions. We use style instead
      // of NativeWind classes because Tailwind's width/height utilities
      // (w-8, h-8, etc.) only support predefined sizes. Our avatar
      // dimensions (32, 40, 64) don't all map to standard Tailwind values.
      style={{ width: dimension, height: dimension }}
    >
      {uri ? (
        // --- Image mode ---
        // expo-image's Image component handles loading, caching, and
        // error states automatically. `contentFit="cover"` ensures the
        // image fills the circle without letterboxing (may crop edges).
        <Image
          source={{ uri }}
          style={{ width: dimension, height: dimension }}
          contentFit="cover"
        />
      ) : (
        // --- Initials fallback mode ---
        // White bold text on the purple bg-accent background.
        // The text size scales with the avatar size via textClass
        // so initials remain proportional (tiny "A" in sm, large "A" in lg).
        <Text className={`text-white font-bold ${textClass}`}>
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}
