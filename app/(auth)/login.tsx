// app/(auth)/login.tsx
//
// Login screen for Beta Breaker.
//
// HOW THE FORM WORKS:
// We use react-hook-form (RHF) to manage form state instead of manual
// useState for each field. RHF tracks values, validation errors, dirty
// state, and submission status in one place. The `zodResolver` bridges
// our existing Zod schema (loginSchema from utils/validation.ts) into
// RHF's validation system — so we define validation rules ONCE in Zod
// and they work everywhere (forms, API inputs, tests).
//
// In React Native, RHF's `register()` doesn't work (it's for HTML inputs).
// Instead, we use the `Controller` component, which gives us `onChange`
// and `value` props that we wire to our AppTextInput's `onChangeText`
// and `value` props.
//
// FLOW:
// 1. User fills email + password
// 2. Presses "Sign in" -> RHF validates via zodResolver(loginSchema)
// 3. If invalid -> error messages appear below inputs
// 4. If valid -> calls useAuth().signIn(email, password)
// 5. If signIn fails -> shows API error message
// 6. If signIn succeeds -> onAuthStateChange fires -> root layout redirects to (tabs)

import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useTranslation } from "react-i18next";
import { Mail, Lock } from "lucide-react-native";

import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/useAuth";
import { loginSchema } from "@/utils/validation";
import type { LoginInput } from "@/utils/validation";
import { Button, AppTextInput, Divider } from "@/components/ui";

export default function LoginScreen() {
  // useTranslation() gives us the `t` function for looking up i18n strings.
  // Keys like "auth.login.title" map to values in locales/en.json (or
  // whichever language is active). This decouples user-facing text from
  // the component code so we can add new languages without editing JSX.
  const { t } = useTranslation();

  // API-level error from Supabase (e.g., "Invalid login credentials").
  // This is separate from form validation errors — it only appears after
  // the form passes Zod validation but the server rejects the credentials.
  const [apiError, setApiError] = useState<string | null>(null);

  // Pull out the signIn action from useAuth.
  // We don't need signUp or signOut here — those live on other screens.
  const { signIn } = useAuth();

  // react-hook-form setup:
  // - resolver: zodResolver validates against our loginSchema on submit.
  //   When validation fails, RHF populates `errors` with messages from Zod.
  // - defaultValues: required for Controller components in React Native.
  //   Without these, the inputs start as `undefined` which can cause
  //   "switching from uncontrolled to controlled" warnings.
  // - formState.errors: per-field validation error messages from Zod
  // - formState.isSubmitting: true while onSubmit is running (for loading state)
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Called when the form passes Zod validation.
  // If signIn fails, we show the error message from Supabase.
  // If it succeeds, onAuthStateChange fires and the root layout
  // automatically redirects to (tabs) — we don't navigate manually.
  const onSubmit = async (data: LoginInput) => {
    // Clear any previous API error before attempting sign-in
    setApiError(null);

    const { error } = await signIn(data.email, data.password);

    // Supabase errors come as objects with a `message` property.
    // We check for that shape defensively — if the error format changes
    // in a future Supabase version, we won't crash.
    if (error && typeof error === "object" && "message" in error) {
      setApiError((error as { message: string }).message);
    }
  };

  return (
    // KeyboardAvoidingView pushes content up when the keyboard opens.
    // On iOS, "padding" mode adds padding at the bottom; on Android,
    // "height" mode adjusts the view's height. This prevents the keyboard
    // from covering the input fields — a common mobile UX issue.
    <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      {/* ScrollView ensures the form is scrollable on small screens.
          keyboardShouldPersistTaps="handled" means tapping outside the
          keyboard dismisses it, but taps on buttons still fire. Without
          this, users would need to dismiss the keyboard before pressing
          "Sign in" — a frustrating extra tap. */}
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* -- Logo & Welcome Text --
            The "BB" monogram serves as a placeholder for the final app logo.
            Using a large bold text instead of an image avoids asset management
            complexity during early development. */}
        <View className="items-center mb-10">
          <Image
            source={require("@/assets/images/logo_white.png")}
            style={{ width: 260, height: 173, marginBottom: 16 }}
            resizeMode="contain"
            accessibilityLabel="Beta Breaker logo"
          />
          <Text className="text-text-primary text-3xl font-bold">
            {t("auth.login.title")}
          </Text>
          <Text className="text-text-secondary text-base mt-1">
            {t("auth.login.subtitle")}
          </Text>
        </View>

        {/* -- Login Form --
            Controller wraps each AppTextInput for react-hook-form integration.
            The `field` object from Controller provides:
            - onChange: function to call when the input value changes
            - value: the current field value from RHF's internal state
            These map directly to AppTextInput's onChangeText and value props. */}
        <View className="mb-6">
          {/* Email field */}
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label={t("auth.login.emailLabel")}
                value={value}
                onChangeText={onChange}
                placeholder={t("auth.login.emailPlaceholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon={Mail}
                error={errors.email?.message}
                testID="email-input"
              />
            )}
          />

          {/* Password field — secureTextEntry hides the text with dots */}
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label={t("auth.login.passwordLabel")}
                value={value}
                onChangeText={onChange}
                placeholder={t("auth.login.passwordPlaceholder")}
                secureTextEntry
                leftIcon={Lock}
                error={errors.password?.message}
                testID="password-input"
              />
            )}
          />

          {/* Forgot Password link — right-aligned below password input.
              Link from expo-router handles navigation to the reset screen.
              asChild passes the Link's navigation behavior to the child Text,
              so the Text itself becomes the tappable element. */}
          <View className="items-end -mt-2 mb-4">
            <Link href="/(auth)/forgot-password" asChild>
              <Text className="text-accent-light text-sm">
                {t("auth.login.forgotPassword")}
              </Text>
            </Link>
          </View>
        </View>

        {/* -- API Error Message --
            Only shown when Supabase returns an error (e.g., wrong password).
            The red-tinted background (bg-error/10 = 10% opacity red) makes
            the error visually distinct from validation errors on individual fields. */}
        {apiError ? (
          <View className="bg-error/10 rounded-lg p-3 mb-4">
            <Text className="text-error text-sm text-center">{apiError}</Text>
          </View>
        ) : null}

        {/* -- Sign In Button --
            handleSubmit(onSubmit) is a higher-order function from RHF:
            1. It first runs Zod validation via the resolver
            2. If validation fails, it populates `errors` and does NOT call onSubmit
            3. If validation passes, it calls onSubmit with the validated data
            The `loading` prop shows a spinner during the async signIn call. */}
        <Button
          label={t("auth.login.signIn")}
          onPress={handleSubmit(onSubmit)}
          size="lg"
          loading={isSubmitting}
          testID="sign-in-button"
        />

        {/* -- Social Sign-In Section --
            Horizontal divider with "Or continue with" text creates a visual
            separation between the email/password form and social auth options. */}
        <View className="mt-8">
          <View className="flex-row items-center mb-6">
            <Divider className="flex-1" />
            <Text className="text-text-muted text-sm mx-4">
              {t("auth.login.orContinueWith")}
            </Text>
            <Divider className="flex-1" />
          </View>

          {/* Social buttons — placeholder for OAuth integration.
              Full OAuth flow requires deep link configuration (later phase).
              For now, these are visual-only to match the mockup.
              Icons from @expo/vector-icons (bundled with Expo). */}
          <View className="flex-row justify-center gap-4">
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <Ionicons name="logo-google" size={22} color="#DB4437" />
            </View>
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <Ionicons name="logo-apple" size={24} color="#FFFFFF" />
            </View>
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <FontAwesome name="facebook" size={24} color="#1877F2" />
            </View>
          </View>
        </View>

        {/* -- Register Link --
            For users who don't have an account yet. Links to the register
            screen within the (auth) group. The accent color on "Sign up"
            makes it stand out as the clickable element in the sentence. */}
        <View className="flex-row justify-center mt-8">
          <Text className="text-text-secondary text-sm">
            {t("auth.login.noAccount")}
          </Text>
          <Link href="/(auth)/register" asChild>
            <Text className="text-accent-light text-sm font-semibold">
              {t("auth.login.signUp")}
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
