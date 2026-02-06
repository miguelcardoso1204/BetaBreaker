// components/ui/TextInput.tsx
//
// Styled text input for Beta Breaker forms (login, register, search, etc.).
//
// WHY A CUSTOM TEXT INPUT?
// React Native's built-in <TextInput> is unstyled — it renders as a bare
// input field with no label, no error handling, and platform-default colors.
// In our app, every text field follows the same visual pattern:
//   - A small gray label above the input (e.g., "Email", "Password")
//   - Dark surface background (#1C1C28) with a subtle border
//   - Light placeholder text (#6B6B80) for empty state
//   - White text for user input (#EAEAF0)
//   - Red error message below the field when validation fails
//
// By wrapping all of this into AppTextInput, every form in the app gets
// consistent styling and validation display without duplicating code.
//
// WHY "AppTextInput" AND NOT JUST "TextInput"?
// React Native already exports a component called "TextInput". If we named
// ours the same, every import would be ambiguous — the bundler wouldn't know
// which one you meant. Prefixing with "App" is a common React Native pattern
// that makes imports unambiguous: `import { AppTextInput } from '@/components/ui/TextInput'`.
//
// CONTROLLED COMPONENT PATTERN:
// This is a "controlled" input — the parent owns the state via `value` and
// `onChangeText`. React Native re-renders the input with the new value on
// every keystroke. This pattern is standard in React because it gives the
// parent full control over validation, formatting, and state management.
// The alternative ("uncontrolled") would let the input manage its own state
// internally, but that makes validation and form submission harder.

import React from "react";
import { TextInput as RNTextInput, Text, View } from "react-native";

/**
 * Props for the AppTextInput component.
 *
 * TypeScript interfaces define the "contract" for a component — what
 * props it accepts and their types. This gives us autocomplete in the
 * editor and compile-time errors if we pass the wrong props.
 */
export interface AppTextInputProps {
  /** Label displayed above the input field. */
  label: string;
  /** Current text value (controlled component pattern). */
  value: string;
  /** Called when the user types — receives the new text string. */
  onChangeText: (text: string) => void;
  /** Placeholder text shown when input is empty. */
  placeholder?: string;
  /** Hides the text for password fields (shows dots instead). */
  secureTextEntry?: boolean;
  /** Validation error message. Shown in red below the input. */
  error?: string;
  /** Whether the input is interactive. Defaults to true. */
  editable?: boolean;
  /**
   * Keyboard type hint — tells the OS which keyboard layout to show.
   * "email-address" adds @ and . keys, "numeric" shows only numbers, etc.
   * This doesn't enforce validation — it's just a UX convenience.
   */
  keyboardType?: RNTextInput["props"]["keyboardType"];
  /**
   * Auto-capitalize behavior.
   * "none" is best for emails/passwords, "sentences" for normal text.
   * Defaults to React Native's default ("sentences").
   */
  autoCapitalize?: RNTextInput["props"]["autoCapitalize"];
  /** Optional testID for testing — passed to the outer View wrapper. */
  testID?: string;
}

/**
 * AppTextInput — a styled text input with label, error display, and
 * consistent dark-theme styling for all Beta Breaker forms.
 *
 * Usage:
 * ```tsx
 * <AppTextInput
 *   label="Email"
 *   value={email}
 *   onChangeText={setEmail}
 *   placeholder="you@example.com"
 *   keyboardType="email-address"
 *   autoCapitalize="none"
 *   error={emailError}
 * />
 * ```
 *
 * The component automatically handles:
 * - Displaying the label above the input
 * - Switching border color to red when an error is present
 * - Rendering the error message below the input
 * - Dimming the input to 50% opacity when editable is false
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
}: AppTextInputProps) {
  return (
    // Outer wrapper — mb-4 adds bottom margin so stacked inputs don't
    // touch each other. testID is on the wrapper so tests can find the
    // entire field (label + input + error) as one unit.
    <View className="mb-4" testID={testID}>
      {/* Label above the input — matches the mockup's gray label text.
          "text-text-secondary" uses our design token for muted text (#A0A0B0).
          "text-sm" keeps the label smaller than the input text.
          "font-medium" gives it slightly more weight than regular body text. */}
      <Text className="text-text-secondary text-sm font-medium mb-1">
        {label}
      </Text>

      {/* The actual input field.
          - bg-surface: dark background matching the app's card surfaces
          - border + border-border: subtle gray border for definition
          - border-error: switches to red border when there's a validation error
          - rounded-lg: 8px border radius for modern look
          - px-4 py-3: comfortable touch target padding (48px+ height)
          - text-text-primary: white text for user input
          - text-base: 16px font size (prevents iOS zoom on focus)
          - opacity-50: visual indicator that the field is disabled */}
      <RNTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        // placeholderTextColor must be set explicitly in React Native.
        // Unlike web CSS where you can use ::placeholder, RN requires
        // this prop. #6B6B80 is our muted gray from the design tokens.
        placeholderTextColor="#6B6B80"
        secureTextEntry={secureTextEntry}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        className={`bg-surface border ${
          error ? "border-error" : "border-border"
        } rounded-lg px-4 py-3 text-text-primary text-base ${
          !editable ? "opacity-50" : ""
        }`}
      />

      {/* Error message — only rendered when there's a validation error.
          Using conditional rendering (error ? ... : null) means the error
          Text element is not in the component tree at all when there's no
          error. This is better than hiding it with opacity/display because:
          1. Screen readers won't announce a hidden empty element
          2. Layout doesn't reserve space for an invisible element
          3. Tests can use queryByText to assert absence */}
      {error ? (
        <Text className="text-error text-xs mt-1">{error}</Text>
      ) : null}
    </View>
  );
}
