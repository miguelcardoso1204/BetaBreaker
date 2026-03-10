// components/ui/TextInput.tsx
//
// Styled text input for Beta Breaker forms (login, register, search, etc.).
//
// Simple placeholder-based input — the placeholder text shows when the
// field is empty and disappears when the user starts typing. No separate
// label above the input.
//
// WHY "AppTextInput" AND NOT JUST "TextInput"?
// React Native already exports a component called "TextInput". Prefixing
// with "App" avoids import ambiguity.
//
// CONTROLLED COMPONENT PATTERN:
// This is a "controlled" input — the parent owns the state via `value` and
// `onChangeText`. React Native re-renders the input with the new value on
// every keystroke. This gives the parent full control over validation,
// formatting, and state management.

import React, { useState } from "react";
import { TextInput as RNTextInput, Text, View, Pressable } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

/**
 * Props for the AppTextInput component.
 */
export interface AppTextInputProps {
  /** Placeholder text shown when the input is empty. Also used as accessibilityLabel. */
  label: string;
  /** Current text value (controlled component pattern). */
  value: string;
  /** Called when the user types — receives the new text string. */
  onChangeText: (text: string) => void;
  /** Optional override for placeholder text. Defaults to `label`. */
  placeholder?: string;
  /** Hides the text for password fields (shows dots instead). */
  secureTextEntry?: boolean;
  /** Validation error message. Shown in red below the input. */
  error?: string;
  /** Whether the input is interactive. Defaults to true. */
  editable?: boolean;
  /** Keyboard type hint — tells the OS which keyboard layout to show. */
  keyboardType?: RNTextInput["props"]["keyboardType"];
  /** Auto-capitalize behavior. "none" for emails/passwords. */
  autoCapitalize?: RNTextInput["props"]["autoCapitalize"];
  /** Optional testID for testing. */
  testID?: string;
  /** Lucide icon component to render on the left side of the input. */
  leftIcon?: LucideIcon;
  /** Lucide icon component to render on the right side of the input. */
  rightIcon?: LucideIcon;
}

/**
 * AppTextInput — a clean, placeholder-based text input with error display
 * and consistent dark-theme styling for all Beta Breaker forms.
 */
export function AppTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  error,
  editable = true,
  keyboardType,
  autoCapitalize,
  testID,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
}: AppTextInputProps) {
  // Password visibility toggle — local state because the parent doesn't
  // need to know whether the password is currently shown or hidden.
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // Show the built-in Eye/EyeOff toggle only when secureTextEntry is on
  // AND no custom right icon is provided.
  const showPasswordToggle = secureTextEntry && !RightIcon;
  const effectiveSecureEntry = secureTextEntry && !isPasswordVisible;

  // Extra padding when icons are present to prevent text overlapping icons.
  const paddingLeft = LeftIcon ? "pl-12" : "pl-4";
  const paddingRight = RightIcon || showPasswordToggle ? "pr-12" : "pr-4";

  return (
    <View className="mb-4" testID={testID}>
      <View className="relative">
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          // Use the explicit placeholder if provided, otherwise fall back
          // to the label text. This keeps the API simple — callers only
          // need to pass `label` for most cases.
          placeholder={placeholder ?? label}
          placeholderTextColor="#6B6B80"
          secureTextEntry={effectiveSecureEntry}
          editable={editable}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          accessibilityLabel={label}
          // Fixed height + no vertical padding lets both iOS and Android
          // vertically center the text natively. textAlignVertical is
          // needed on Android (iOS centers by default).
          style={{ height: 48, textAlignVertical: "center" }}
          className={`bg-surface border ${
            error ? "border-error" : "border-border"
          } rounded-lg ${paddingLeft} ${paddingRight} text-text-primary text-base leading-tight ${
            !editable ? "opacity-50" : ""
          }`}
        />

        {/* Left icon — decorative only, not tappable. */}
        {LeftIcon ? (
          <View
            className="absolute left-4 top-0 bottom-0 justify-center"
            pointerEvents="none"
          >
            <LeftIcon size={20} color="#A0A0B0" />
          </View>
        ) : null}

        {/* Right icon — decorative only. */}
        {RightIcon ? (
          <View
            className="absolute right-4 top-0 bottom-0 justify-center"
            pointerEvents="none"
          >
            <RightIcon size={20} color="#A0A0B0" />
          </View>
        ) : null}

        {/* Password toggle — Eye/EyeOff button for password fields. */}
        {showPasswordToggle ? (
          <Pressable
            testID="password-toggle"
            accessibilityRole="button"
            accessibilityLabel={
              isPasswordVisible ? "Hide password" : "Show password"
            }
            onPress={() => setIsPasswordVisible((prev) => !prev)}
            className="absolute right-4 top-0 bottom-0 justify-center"
          >
            {isPasswordVisible ? (
              <Eye size={20} color="#A0A0B0" />
            ) : (
              <EyeOff size={20} color="#A0A0B0" />
            )}
          </Pressable>
        ) : null}
      </View>

      {/* Error message — only rendered when validation fails. */}
      {error ? (
        <Text className="text-error text-xs mt-1">{error}</Text>
      ) : null}
    </View>
  );
}
