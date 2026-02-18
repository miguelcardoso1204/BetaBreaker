/**
 * FeedbackComposer — Text Form for Submitting Beta Tips
 *
 * A simple input + submit button that lets climbers share text-based
 * tips ("beta") for a route. Appears at the top of the Beta Tips
 * section on the route detail screen.
 *
 * INTERNAL STATE:
 * The component manages its own draft text via useState. The parent
 * only receives the final text on submission — it doesn't need to
 * track the draft state. This is appropriate because:
 *   - The draft text is ephemeral UI state (not server state)
 *   - No other component needs access to the draft
 *   - It simplifies the parent's code
 *
 * After a successful submission, the input auto-clears so the user
 * can immediately write another tip if they want.
 */

import React, { useState } from "react";
import { View, TextInput, Pressable, Text } from "react-native";
import { Send } from "lucide-react-native";
import { useTranslation } from "react-i18next";

export interface FeedbackComposerProps {
  /** Called with the trimmed tip text when the user submits */
  onSubmit: (body: string) => void;
  /** Whether a submission is in progress (disables the button) */
  isSubmitting: boolean;
}

export function FeedbackComposer({
  onSubmit,
  isSubmitting,
}: FeedbackComposerProps) {
  const { t } = useTranslation();

  // Draft text state — managed internally because it's ephemeral
  // UI state that no other component needs.
  const [text, setText] = useState("");

  // Disable submit when there's no meaningful text or when
  // a submission is already in flight.
  const canSubmit = text.trim().length > 0 && !isSubmitting;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(text.trim());
    // Clear the input after submission so the user gets a fresh
    // field for their next tip.
    setText("");
  }

  return (
    <View className="flex-row items-end gap-2 mb-3">
      {/* Multiline input for the tip text. Using React Native's
          TextInput directly (not AppTextInput) because:
          1. We don't need a label — the placeholder is sufficient
          2. We don't need error display — validation is just "not empty"
          3. The layout is horizontal (input + button), not vertical */}
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t("social.tipPlaceholder")}
        placeholderTextColor="#6B6B80"
        multiline
        className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-text-primary text-sm min-h-[40px] max-h-[100px]"
      />

      {/* Submit button — uses a send icon instead of text label to keep
          it compact in the horizontal layout. Disabled state dims the
          button and blocks interaction via accessibilityState. */}
      <Pressable
        testID="submit-feedback-button"
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel={t("social.submitTip")}
        accessibilityState={{ disabled: !canSubmit }}
        className={`p-2 rounded-lg ${canSubmit ? "bg-accent" : "bg-surface"}`}
      >
        <Send size={20} color={canSubmit ? "#FFFFFF" : "#6B6B80"} />
      </Pressable>
    </View>
  );
}
