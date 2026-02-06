// components/ui/Button.tsx
//
// Primary action button for Beta Breaker.
// Built with NativeWind (Tailwind classes) for styling.
//
// WHY A CUSTOM BUTTON?
// React Native's built-in <Button> component is extremely limited — you
// can't style it, can't add loading states, and it looks different on
// iOS vs Android. By building our own with <Pressable>, we get:
//   - Consistent cross-platform appearance
//   - Full control over variants (primary/outline/ghost)
//   - Loading spinner support for async actions
//   - Proper accessibility states for screen readers
//
// VARIANTS:
//   - "primary" (default): Solid purple (#7C3AED) background with white text.
//     Used for main CTAs like "Sign in", "Add Ascent", "Start Activity".
//   - "outline": Transparent background with purple border. Used for
//     secondary actions like "Cancel" or "Reset".
//   - "ghost": No background or border — just colored text. Used for
//     tertiary or inline actions like "Forgot password?" or "Skip".
//
// SIZES: "sm" (compact lists), "md" (default), "lg" (full-width CTAs).
//
// WHY PRESSABLE OVER TOUCHABLEOPACITY?
// Pressable is the recommended primitive in modern React Native (0.63+).
// It gives us more control over pressed/disabled states via the `style`
// callback, and TouchableOpacity is considered legacy. Pressable also
// supports hover states for web, which matters since Expo supports web.

import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/**
 * Props for the Button component.
 *
 * TypeScript interfaces define the "contract" for a component — what
 * props it accepts and their types. This gives us autocomplete in the
 * editor and compile-time errors if we pass the wrong props.
 */
export interface ButtonProps {
  /** Text displayed inside the button. Also used as the accessibility label. */
  label: string;
  /** Called when the button is pressed. Ignored when disabled or loading. */
  onPress: () => void;
  /** Visual style variant. Defaults to "primary". */
  variant?: "primary" | "outline" | "ghost";
  /** Size preset controlling padding and text size. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  /** When true, the button is non-interactive and visually dimmed. */
  disabled?: boolean;
  /** When true, shows a spinner and prevents interaction (e.g., during a network request). */
  loading?: boolean;
  /** Optional testID passed to the outer Pressable for testing. */
  testID?: string;
}

// --- Style Maps ---
// These objects map each variant/size to NativeWind class strings.
// Using "as const" makes TypeScript treat the values as literal types,
// which helps catch typos and enables better autocomplete.

/**
 * Container styles per variant.
 * "primary" gets the solid accent background.
 * "outline" gets a border in the accent color.
 * "ghost" has no background or border — just text styling.
 */
const variantClasses = {
  primary: "bg-accent rounded-xl",
  outline: "border-2 border-accent rounded-xl",
  ghost: "",
} as const;

/**
 * Text color per variant.
 * Primary buttons need white text on the purple background.
 * Outline and ghost buttons use the accent color for the text itself.
 */
const variantTextClasses = {
  primary: "text-white",
  outline: "text-accent-light",
  ghost: "text-accent-light",
} as const;

/**
 * Padding per size.
 * "lg" also gets `w-full` to stretch across the entire screen width,
 * which is the standard pattern for primary CTAs at the bottom of screens.
 */
const sizeClasses = {
  sm: "px-4 py-2",
  md: "px-6 py-3",
  lg: "px-8 py-4 w-full",
} as const;

/**
 * Text size per size.
 * These map to Tailwind's text-sm (14px), text-base (16px), text-lg (18px).
 */
const sizeTextClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
} as const;

/**
 * Button — the primary interactive element in Beta Breaker.
 *
 * Usage:
 * ```tsx
 * <Button label="Sign in" onPress={handleSignIn} />
 * <Button label="Cancel" variant="outline" onPress={handleCancel} />
 * <Button label="Submitting..." onPress={handleSubmit} loading />
 * ```
 *
 * The component automatically handles:
 * - Dimming opacity when disabled or loading (opacity-50)
 * - Showing a spinner in place of text when loading
 * - Blocking onPress when disabled or loading
 * - Setting proper accessibility role and state
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  testID,
}: ButtonProps) {
  // Combine disabled and loading into one flag.
  // Both states should prevent the button from responding to presses,
  // and both should make the button look dimmed (opacity-50).
  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      // Only attach the onPress handler when the button is interactive.
      // This is a defense-in-depth approach — `disabled` on Pressable also
      // blocks presses, but explicitly not passing onPress makes the intent clear.
      onPress={isInteractive ? onPress : undefined}
      // Setting disabled on Pressable tells React Native to ignore touch events.
      // It also sets the native accessibility state automatically.
      disabled={!isInteractive}
      // accessibilityRole tells screen readers "this is a button, not just text".
      // This is required for proper VoiceOver/TalkBack announcements.
      accessibilityRole="button"
      // accessibilityLabel is read aloud by screen readers. Using the button's
      // label text means the user hears "Sign in, button" — clear and descriptive.
      accessibilityLabel={label}
      // accessibilityState.disabled tells screen readers the button can't be used.
      // They'll announce "Sign in, button, dimmed" on iOS.
      accessibilityState={{ disabled: !isInteractive }}
      testID={testID}
      // NativeWind className — these Tailwind utility classes get compiled
      // into React Native StyleSheet objects at build time.
      // - items-center + justify-center: center the text/spinner inside
      // - variantClasses: background/border based on variant
      // - sizeClasses: padding based on size
      // - opacity-50: visual dimming when not interactive
      className={`items-center justify-center ${variantClasses[variant]} ${sizeClasses[size]} ${
        !isInteractive ? "opacity-50" : ""
      }`}
    >
      {/* Conditional rendering: show spinner when loading, text otherwise */}
      {loading ? (
        // The View wrapper with testID="button-loading" lets tests verify
        // the loading state without depending on ActivityIndicator internals.
        <View testID="button-loading">
          <ActivityIndicator
            // White spinner on primary (dark background), purple on outline/ghost
            color={variant === "primary" ? "#FFFFFF" : "#7C3AED"}
            size="small"
          />
        </View>
      ) : (
        <Text
          className={`font-semibold ${variantTextClasses[variant]} ${sizeTextClasses[size]}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
