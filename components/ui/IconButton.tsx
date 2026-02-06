// components/ui/IconButton.tsx
//
// A button that displays only an icon (no text label).
// Used for: favorite/star toggles, share buttons, close buttons, etc.
//
// WHY AN ICON-ONLY BUTTON?
// Many actions in a mobile app are best represented by a small icon rather
// than a full text button. Think of the heart icon on Instagram or the share
// icon on a route detail screen. An icon button takes up less space and is
// immediately recognizable — but it MUST have an accessibility label so
// screen readers can announce what it does ("Like, button" instead of just
// "button").
//
// The `icon` prop accepts any Lucide icon component. Lucide icons are
// tree-shakeable SVGs — only the icons you import end up in the bundle.
// This keeps the app size small even though the Lucide library has 1000+ icons.
//
// WHY `import type`?
// We use `import type { LucideIcon }` because we only need the TypeScript
// type at compile time — we never use LucideIcon as a runtime value.
// `import type` is stripped during compilation, which can slightly reduce
// bundle size and avoids circular dependency issues.
//
// WHY PRESSABLE OVER TOUCHABLEOPACITY?
// Same reason as Button.tsx — Pressable is the modern React Native primitive
// (0.63+) with better control over pressed/disabled states and web support.

import React from "react";
import { Pressable } from "react-native";
import type { LucideIcon } from "lucide-react-native";

/**
 * Props for the IconButton component.
 *
 * The `icon` prop is typed as `LucideIcon`, which is the type all Lucide
 * icon components conform to. This means you can pass Heart, Star, X,
 * Share2, or any other Lucide icon — TypeScript will ensure it's valid.
 */
export interface IconButtonProps {
  /** Lucide icon component to render (e.g., Heart, Star, Share2). */
  icon: LucideIcon;
  /**
   * Accessibility label (required, but not visually shown).
   * Screen readers will announce this text, e.g., "Like, button".
   * Without this, VoiceOver/TalkBack would just say "button" with no context.
   */
  label: string;
  /** Called when the button is pressed. Ignored when disabled. */
  onPress: () => void;
  /**
   * Icon size in pixels. Defaults to 24.
   * Lucide icons are designed on a 24x24 grid, so 24 is the natural size.
   * Use 20 for compact layouts or 28-32 for prominent actions.
   */
  size?: number;
  /**
   * Icon stroke color. Defaults to white (#FFFFFF).
   * This sets the `color` prop on the Lucide icon, which controls
   * the SVG stroke color. Most Lucide icons are stroke-based, not filled.
   */
  color?: string;
  /** When true, the button is non-interactive and visually dimmed (50% opacity). */
  disabled?: boolean;
  /** Optional testID passed to the outer Pressable for testing. */
  testID?: string;
}

/**
 * IconButton — a pressable icon with no visible text.
 *
 * Usage:
 * ```tsx
 * import { Heart, Share2, X } from "lucide-react-native";
 *
 * <IconButton icon={Heart} label="Like" onPress={handleLike} />
 * <IconButton icon={Share2} label="Share" onPress={handleShare} />
 * <IconButton icon={X} label="Close" onPress={handleClose} size={20} />
 * ```
 *
 * Accessibility:
 * - `accessibilityRole="button"` tells screen readers it's interactive
 * - `accessibilityLabel={label}` provides the spoken description
 * - `accessibilityState={{ disabled }}` announces dimmed/disabled state
 */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = 24,
  color = "#FFFFFF",
  disabled = false,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      // Only attach onPress when the button is enabled.
      // Defense-in-depth: `disabled` prop also blocks presses,
      // but explicitly not passing onPress makes the intent clear.
      onPress={disabled ? undefined : onPress}
      // Setting disabled on Pressable tells React Native to ignore
      // touch events at the native level. Belt-and-suspenders approach.
      disabled={disabled}
      // accessibilityRole="button" tells screen readers this is a button.
      // Without this, it would be announced as a generic "element".
      accessibilityRole="button"
      // accessibilityLabel is the text screen readers read aloud.
      // Since there's no visible text, this is the ONLY way blind users
      // know what the button does.
      accessibilityLabel={label}
      // accessibilityState.disabled tells screen readers the button is
      // non-interactive. On iOS, VoiceOver says "dimmed".
      accessibilityState={{ disabled }}
      testID={testID}
      // NativeWind classes:
      // - p-2: 8px padding around the icon for a larger touch target
      //   (Apple's HIG recommends at least 44x44pt touch targets;
      //    24px icon + 8px padding each side = 40px — close enough
      //    for most contexts, and the parent can add more)
      // - rounded-full: circular shape, common for icon buttons
      // - opacity-50: visual dimming when disabled
      className={`p-2 rounded-full ${disabled ? "opacity-50" : ""}`}
    >
      {/* Render the Lucide icon component.
        * We destructure `icon` as `Icon` (capitalized) because React requires
        * component names to start with an uppercase letter. Lowercase names
        * are treated as HTML elements (e.g., <div>), not React components.
        * `strokeWidth={2}` is the Lucide default — explicit for clarity. */}
      <Icon size={size} color={color} strokeWidth={2} />
    </Pressable>
  );
}
