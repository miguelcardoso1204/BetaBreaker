// app/(auth)/forgot-password.tsx
//
// Forgot Password screen — sends a password reset email via Supabase.
//
// This screen is intentionally simple: just an email input and a submit
// button. After sending, it shows a success message telling the user to
// check their email. We don't reveal whether the email exists in the system
// (Supabase handles this securely — it always returns success to prevent
// email enumeration attacks).
//
// WHY CALL authService DIRECTLY INSTEAD OF useAuth?
// Password reset doesn't change the current auth state (no session is
// created or destroyed), so there's no need for the full useAuth hook.
// We call authService.resetPassword directly — it's a simple "fire and
// show result" flow, not a state transition that needs to propagate
// through the auth context.
//
// FORM HANDLING:
// Like the login and register screens, we use react-hook-form (RHF) with
// zodResolver for validation. The schema is defined inline here (just an
// email field) rather than in utils/validation.ts because it's trivial
// and only used on this one screen. If we needed the same schema elsewhere,
// we'd move it to the shared validation module.

import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react-native";

import { authService } from "@/services/auth.service";
import { Button, AppTextInput } from "@/components/ui";

// -------------------------------------------------------------------
// Validation schema — just needs a valid email address.
//
// z.email() is a Zod v4 top-level constructor that validates email
// format. The string argument is the custom error message shown when
// validation fails. Without it, Zod would show a generic message.
// -------------------------------------------------------------------
const forgotPasswordSchema = z.object({
  email: z.email("Please enter a valid email address"),
});

// Infer the TypeScript type from the schema so the form data is
// properly typed without maintaining a separate interface.
type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordScreen() {
  // useTranslation() gives us the `t` function for looking up i18n strings.
  // Keys like "auth.forgotPassword.title" map to values in locales/en.json
  // (or whichever language is active). This decouples user-facing text from
  // the component code so we can add new languages without editing JSX.
  const { t } = useTranslation();

  // Track whether the reset email was sent successfully.
  // When true, we swap the form for a success message.
  const [sent, setSent] = useState(false);

  // API-level error from Supabase (e.g., rate limiting, network error).
  // Separate from form validation errors — this only appears after Zod
  // validation passes but the API call fails.
  const [apiError, setApiError] = useState<string | null>(null);

  // react-hook-form setup:
  // - resolver: zodResolver bridges our Zod schema into RHF's validation
  // - defaultValues: prevents "uncontrolled to controlled" React warnings
  // - formState.errors: per-field validation error messages from Zod
  // - formState.isSubmitting: true while onSubmit is running (async)
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  // Called when the form passes Zod validation.
  // Sends the password reset email via Supabase Auth.
  const onSubmit = async (data: ForgotPasswordInput) => {
    // Clear any previous API error before retrying
    setApiError(null);

    const { error } = await authService.resetPassword(data.email);

    if (error) {
      // Supabase errors have a `message` property describing what went wrong.
      // In practice, resetPassword rarely errors (Supabase returns success
      // even for non-existent emails to prevent enumeration), but network
      // errors or rate limiting could still trigger this path.
      setApiError(error.message);
    } else {
      // Flip to success state — hides the form, shows the confirmation message
      setSent(true);
    }
  };

  return (
    // KeyboardAvoidingView pushes content up when the on-screen keyboard opens.
    // "padding" mode on iOS adds padding at the bottom; "height" mode on Android
    // adjusts the view's height. This prevents the keyboard from covering the input.
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      {/* ScrollView ensures the form is scrollable on small screens.
          keyboardShouldPersistTaps="handled" means tapping outside the
          keyboard dismisses it, but taps on buttons still fire — without
          this, users would have to dismiss the keyboard before pressing submit. */}
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* -- Header Section -- */}
        <View className="items-center mb-10">
          <Text className="text-text-primary text-3xl font-bold">
            {t("auth.forgotPassword.title")}
          </Text>
          <Text className="text-text-secondary text-base mt-2 text-center">
            {t("auth.forgotPassword.subtitle")}
          </Text>
        </View>

        {sent ? (
          // -- Success State --
          // After the reset email is sent, we replace the form with a
          // confirmation message. This is better UX than navigating away
          // because the user can see the confirmation without losing context.
          // The green-tinted background (bg-success/10 = 10% opacity green)
          // provides a visual cue that the action succeeded.
          <View className="bg-success/10 rounded-lg p-4 mb-6">
            <Text className="text-success text-sm text-center">
              {t("auth.forgotPassword.checkEmail")}
            </Text>
          </View>
        ) : (
          // -- Form State --
          // Email input + submit button. Controller wraps AppTextInput for
          // react-hook-form integration (see login.tsx for detailed explanation
          // of the Controller pattern in React Native).
          <View className="mb-6">
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <AppTextInput
                  label={t("auth.forgotPassword.emailLabel")}
                  value={value}
                  onChangeText={onChange}
                  placeholder={t("auth.forgotPassword.emailPlaceholder")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon={Mail}
                  error={errors.email?.message}
                  testID="email-input"
                />
              )}
            />

            {/* API error message — shown when the server rejects the request.
                Uses the same error display pattern as the login screen:
                red-tinted background with centered error text. */}
            {apiError ? (
              <View className="bg-error/10 rounded-lg p-3 mb-4">
                <Text className="text-error text-sm text-center">
                  {apiError}
                </Text>
              </View>
            ) : null}

            {/* Submit button — handleSubmit(onSubmit) first runs Zod validation.
                If invalid, errors appear on the input field.
                If valid, calls onSubmit which triggers the API call.
                The `loading` prop shows a spinner during the async operation. */}
            <Button
              label={t("auth.forgotPassword.sendResetLink")}
              onPress={handleSubmit(onSubmit)}
              size="lg"
              loading={isSubmitting}
            />
          </View>
        )}

        {/* -- Back to Login Link --
            Always visible (even after success) so the user can navigate
            back to the login screen. Uses expo-router's Link component
            for file-based routing — href points to the login route within
            the (auth) group. */}
        <View className="flex-row justify-center mt-6">
          <Link href="/(auth)/login" asChild>
            <Text className="text-accent-light text-sm font-semibold">
              {t("auth.forgotPassword.backToLogin")}
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
