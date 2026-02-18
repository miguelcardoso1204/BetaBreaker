// app/(auth)/register.tsx
//
// Registration screen for new Beta Breaker users.
//
// Uses the same react-hook-form + zodResolver pattern as Login, but with
// the registrationSchema (requires email, min 8-char password, optional
// display name). The password strength indicator is a visual-only feature
// that updates in real-time as the user types — it doesn't block submission.
//
// WHY react-hook-form + Zod AGAIN?
// The registration form needs the exact same capabilities as login:
// per-field validation, submission handling, and loading/error states.
// By reusing the same pattern (Controller + zodResolver), we keep the
// codebase consistent and reduce cognitive load — once you understand
// how the login form works, you already understand registration.
//
// FLOW:
// 1. User fills email + name (optional) + password
// 2. Presses "Sign up" -> RHF validates via zodResolver(registrationSchema)
// 3. If invalid -> error messages appear below each invalid input
// 4. If valid -> calls useAuth().signUp(email, password)
// 5. Success -> onAuthStateChange fires -> root layout redirects to (tabs)
//    (We don't navigate manually — the auth listener handles it.)

import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useTranslation } from "react-i18next";
import { Mail, User } from "lucide-react-native";

import { useAuth } from "@/hooks/useAuth";
import { registrationSchema } from "@/utils/validation";
import type { RegistrationInput } from "@/utils/validation";
import { Button, AppTextInput, Divider } from "@/components/ui";

/**
 * Calculates password strength on a 0–4 scale.
 *
 * This is a UI-ONLY indicator — it doesn't affect whether the form submits.
 * The actual password requirement (min 8 characters) is enforced by the Zod
 * registrationSchema. This function exists purely to give the user real-time
 * visual feedback about how "complex" their password is.
 *
 * Scoring breakdown:
 *   +1 for length >= 8  (matches our Zod minimum)
 *   +1 for containing a number (e.g., "pass1word")
 *   +1 for containing an uppercase letter (e.g., "Password")
 *   +1 for containing a special character (e.g., "p@ssword")
 *
 * WHY NOT USE A LIBRARY?
 * Libraries like zxcvbn are thorough but large (~400KB). For a simple
 * 4-bar indicator, this regex approach is lightweight and sufficient.
 * We can upgrade later if needed.
 */
function getPasswordStrength(password: string): number {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/\d/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  return strength;
}

/**
 * Maps a numeric strength score (0–4) to a display label and color.
 *
 * The array index IS the strength score, so we can look up the config
 * with `strengthConfig[strength]` — no if/else chain needed.
 *
 * `as const` makes TypeScript treat these as literal types (not just
 * `string`), which gives better autocomplete and catches typos.
 */
// labelKey stores the i18n translation key instead of a hardcoded string.
// The actual t() call happens inside the component where useTranslation()
// is available — module-level code can't call hooks, so we store the key
// here and resolve it at render time.
const strengthConfig = [
  { labelKey: "", color: "#6B6B80" },                              // 0: no criteria met (gray)
  { labelKey: "auth.register.strengthWeak", color: "#EF4444" },    // 1: one criterion (red)
  { labelKey: "auth.register.strengthFair", color: "#F59E0B" },    // 2: two criteria (amber)
  { labelKey: "auth.register.strengthStrong", color: "#22C55E" },  // 3: three criteria (green)
  { labelKey: "auth.register.strengthStrong", color: "#22C55E" },  // 4: all four criteria (green)
] as const;

export default function RegisterScreen() {
  // useTranslation() gives us the `t` function for looking up i18n strings.
  // Keys like "auth.register.title" map to values in locales/en.json (or
  // whichever language is active). This decouples user-facing text from
  // the component code so we can add new languages without editing JSX.
  const { t } = useTranslation();

  // API-level error from Supabase (e.g., "User already registered").
  // Separate from form validation errors — this only appears after the
  // form passes Zod validation but Supabase rejects the signup attempt.
  const [apiError, setApiError] = useState<string | null>(null);

  // Pull out signUp from the auth hook. We don't need signIn or signOut here.
  const { signUp } = useAuth();

  // react-hook-form setup — same pattern as login.tsx:
  // - zodResolver bridges our registrationSchema into RHF's validation
  // - defaultValues prevent "uncontrolled to controlled" React warnings
  // - `watch` lets us observe a field's value without a re-render handler
  //
  // IMPORTANT: We wrap zodResolver to preprocess displayName before validation.
  // The schema defines displayName as `z.string().min(1).max(50).optional()`,
  // which means "if provided, it must be 1-50 chars". But RHF uses "" as the
  // default for text inputs, and Zod treats "" as "provided but too short"
  // (fails min(1)), NOT as "not provided" (which would skip the check via
  // .optional()). By converting "" to undefined, we tell Zod "this field was
  // not provided", and .optional() correctly skips the min(1) check.
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationInput>({
    resolver: (values, context, options) => {
      // Transform empty displayName to undefined so Zod's .optional() works
      const processed = {
        ...values,
        displayName: values.displayName?.trim() || undefined,
      };
      return zodResolver(registrationSchema)(processed, context, options);
    },
    defaultValues: { email: "", password: "", displayName: "" },
  });

  // Watch the password field for real-time strength calculation.
  // `watch("password")` subscribes to changes on that field and causes
  // a re-render each time the value changes. This is intentional —
  // we WANT the strength indicator to update on every keystroke.
  const password = watch("password");
  const strength = getPasswordStrength(password || "");
  const { labelKey: strengthLabelKey, color: strengthColor } = strengthConfig[strength];

  /**
   * Called when the form passes Zod validation.
   * Delegates to useAuth().signUp which calls Supabase Auth.
   *
   * Note: We only pass email and password to signUp (not displayName).
   * Supabase Auth creates the auth.users record with just credentials.
   * The displayName will be set later during onboarding or profile setup,
   * where it gets saved to the profiles table (not auth.users).
   */
  const onSubmit = async (data: RegistrationInput) => {
    // Clear any previous API error before attempting signup
    setApiError(null);

    const { error } = await signUp(data.email, data.password);

    // Supabase errors come as objects with a `message` property.
    // Defensive check for the shape — if Supabase changes their error
    // format in a future version, we won't crash.
    if (error && typeof error === "object" && "message" in error) {
      setApiError((error as { message: string }).message);
    }
  };

  return (
    // KeyboardAvoidingView pushes content up when the keyboard opens.
    // iOS uses "padding" mode (adds bottom padding), Android uses "height"
    // mode (shrinks the view). This prevents inputs from being hidden
    // behind the keyboard — especially important on registration screens
    // where there are 3 input fields.
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      {/* ScrollView ensures the form is scrollable on small screens.
          keyboardShouldPersistTaps="handled" means tapping a button while
          the keyboard is open will fire the button's onPress AND dismiss
          the keyboard — without this, users need an extra tap to dismiss
          the keyboard first, which is frustrating. */}
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* -- Logo & Heading --
            Same "BB" monogram as the login screen for brand consistency.
            Will be replaced with the actual logo asset in a later phase. */}
        <View className="items-center mb-10">
          <Text className="text-text-primary text-6xl font-bold mb-2">{t("auth.register.logo")}</Text>
          <Text className="text-text-primary text-3xl font-bold">
            {t("auth.register.title")}
          </Text>
          <Text className="text-text-secondary text-base mt-1">
            {t("auth.register.subtitle")}
          </Text>
        </View>

        {/* -- Registration Form --
            Three fields: email, display name (optional), and password.
            Each is wrapped in a Controller for react-hook-form integration.
            The error prop on AppTextInput shows Zod validation messages
            directly below the field they relate to. */}
        <View className="mb-6">
          {/* Email field — validated by z.email() in registrationSchema */}
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label={t("auth.register.emailLabel")}
                value={value}
                onChangeText={onChange}
                placeholder={t("auth.register.emailPlaceholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon={Mail}
                error={errors.email?.message}
                testID="email-input"
              />
            )}
          />

          {/* Display name field — optional in the schema (z.string().optional()).
              autoCapitalize="words" capitalizes the first letter of each word,
              which is the convention for names. */}
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label={t("auth.register.nameLabel")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("auth.register.namePlaceholder")}
                autoCapitalize="words"
                leftIcon={User}
                error={errors.displayName?.message}
                testID="name-input"
              />
            )}
          />

          {/* Password field — validated by z.string().min(8) in registrationSchema.
              secureTextEntry hides the text with dots for security. */}
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label={t("auth.register.passwordLabel")}
                value={value}
                onChangeText={onChange}
                placeholder={t("auth.register.passwordPlaceholder")}
                secureTextEntry
                error={errors.password?.message}
                testID="password-input"
              />
            )}
          />

          {/* Password Strength Indicator — visual-only feedback.
              Shows 4 colored bars that fill up based on password complexity.
              Only rendered when the user has started typing a password.

              HOW IT WORKS:
              - Each bar represents one strength criterion (length, number,
                uppercase, special char)
              - Bars fill left-to-right with the current strength color
              - Unfilled bars use a dark gray (#2A2A3C) that blends with
                the dark theme background
              - A text label ("Weak"/"Fair"/"Strong") appears next to the bars */}
          {password && password.length > 0 ? (
            <View className="flex-row items-center gap-2 -mt-2 mb-4">
              {[1, 2, 3, 4].map((level) => (
                <View
                  key={level}
                  className="flex-1 h-1 rounded-full"
                  style={{
                    // Inline style instead of NativeWind because the color
                    // is dynamic (changes based on strength score). NativeWind
                    // requires class names to be known at build time.
                    backgroundColor:
                      level <= strength ? strengthColor : "#2A2A3C",
                  }}
                />
              ))}
              <Text style={{ color: strengthColor }} className="text-xs ml-1">
                {strengthLabelKey ? t(strengthLabelKey) : ""}
              </Text>
            </View>
          ) : null}
        </View>

        {/* -- API Error Message --
            Shown when Supabase returns an error (e.g., "User already registered").
            Same styling pattern as login screen: red-tinted background (bg-error/10
            = error color at 10% opacity) for visual distinction. */}
        {apiError ? (
          <View className="bg-error/10 rounded-lg p-3 mb-4">
            <Text className="text-error text-sm text-center">{apiError}</Text>
          </View>
        ) : null}

        {/* -- Sign Up Button --
            handleSubmit(onSubmit) from RHF:
            1. Runs Zod validation via the zodResolver
            2. If invalid -> populates `errors` object, does NOT call onSubmit
            3. If valid -> calls onSubmit with typed, validated data
            The `loading` prop shows a spinner during the async signUp call. */}
        <Button
          label={t("auth.register.signUp")}
          onPress={handleSubmit(onSubmit)}
          size="lg"
          loading={isSubmitting}
          testID="sign-up-button"
        />

        {/* -- Social Sign-Up Section --
            Same visual treatment as login screen for consistency.
            These are placeholder buttons — full OAuth (Google/Apple) requires
            deep link configuration which is planned for a later phase. */}
        <View className="mt-8">
          <View className="flex-row items-center mb-6">
            <Divider className="flex-1" />
            <Text className="text-text-muted text-sm mx-4">
              {t("auth.register.orSignUpWith")}
            </Text>
            <Divider className="flex-1" />
          </View>

          {/* "G" = Google, "A" = Apple — will be replaced with SVG icons */}
          <View className="flex-row justify-center gap-4">
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <Text className="text-text-primary text-lg">G</Text>
            </View>
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <Text className="text-text-primary text-lg">A</Text>
            </View>
          </View>
        </View>

        {/* -- Login Link --
            For users who already have an account. Links back to the login
            screen within the (auth) group. The accent color on "Sign in"
            makes it stand out as the tappable element in the sentence.

            Link's `asChild` prop passes navigation behavior to the child
            Text component, making the text itself the tappable element. */}
        <View className="flex-row justify-center mt-8">
          <Text className="text-text-secondary text-sm">
            {t("auth.register.hasAccount")}
          </Text>
          <Link href="/(auth)/login" asChild>
            <Text className="text-accent-light text-sm font-semibold">
              {t("auth.register.signIn")}
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
