# Step 3.5 — Auth Screens (Login, Register, Forgot Password)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the auth screens (Login, Register, Forgot Password) with form validation, social sign-in buttons, and an auth-gated root layout that redirects unauthenticated users.

**Architecture:** Each screen uses `react-hook-form` with `zodResolver` for form state + validation, wired to the existing `useAuth` hook (which delegates to `authService` → Supabase Auth). The `Controller` component bridges react-hook-form to our `AppTextInput`. The root layout (`app/_layout.tsx`) conditionally renders `(auth)` or `(tabs)` based on `useAuth().isAuthenticated`. The `(auth)` group uses a Stack navigator with no tab bar.

**Tech Stack:** React Hook Form 7.x + `@hookform/resolvers` (zodResolver), Zod v4 schemas from `utils/validation.ts`, `useAuth` hook, NativeWind v4, `lucide-react-native` icons, Expo Router (file-based routing).

---

## Task 1: Auth Layout (Stack Navigator)

**Files:**
- Create: `app/(auth)/_layout.tsx`

### Step 1: Write the layout

```typescript
// app/(auth)/_layout.tsx
//
// Stack navigator for the authentication flow (login, register, forgot password).
//
// WHY A SEPARATE LAYOUT GROUP?
// Expo Router uses file-based routing with "groups" — folders wrapped in
// parentheses like (auth) and (tabs). Each group can have its own layout.
// The auth group uses a plain Stack (no tab bar) because unauthenticated
// users shouldn't see the app's main navigation.
//
// The root layout (app/_layout.tsx) decides WHICH group to show based on
// auth state: (auth) when logged out, (tabs) when logged in.

import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        // Hide the default header — our screens have custom headers/logos
        headerShown: false,
        // Dark background to match the app's dark-first design system
        contentStyle: { backgroundColor: "#0A0A0F" },
      }}
    />
  );
}
```

### Step 2: Verify it compiles

Run: `npx tsc --noEmit`
Expected: No new errors.

### Step 3: Commit

```bash
git add app/(auth)/_layout.tsx
git commit -m "feat: add auth stack layout with no header"
```

---

## Task 2: Login Screen Tests

**Files:**
- Create: `app/(auth)/__tests__/login.test.tsx`

### Step 1: Write the failing tests

These tests mock `useAuth` and verify the Login screen's rendering and behavior. React Hook Form handles form state internally, so we test through user interactions (typing + pressing submit), not by inspecting form state directly.

```typescript
// app/(auth)/__tests__/login.test.tsx
//
// Tests for the Login screen. We mock useAuth() to control auth state
// and verify that the screen:
//   - Renders all expected form elements
//   - Shows validation errors for empty/invalid fields
//   - Calls signIn with correct credentials on submit
//   - Shows error messages when signIn fails
//   - Navigates on success (via useAuth's onAuthStateChange)

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import LoginScreen from "../login";

// Mock lucide-react-native — Jest can't process SVG transforms
jest.mock("lucide-react-native", () => ({
  Eye: (props: any) => {
    const { Text } = require("react-native");
    return <Text>EyeIcon</Text>;
  },
  EyeOff: (props: any) => {
    const { Text } = require("react-native");
    return <Text>EyeOffIcon</Text>;
  },
  Mail: (props: any) => {
    const { Text } = require("react-native");
    return <Text>MailIcon</Text>;
  },
  Lock: (props: any) => {
    const { Text } = require("react-native");
    return <Text>LockIcon</Text>;
  },
}));

// Mock useAuth — define mock functions INSIDE the factory to avoid
// temporal dead zone issues (jest.mock is hoisted above const/let).
jest.mock("@/hooks/useAuth", () => {
  const mockSignIn = jest.fn();
  const mockSignUp = jest.fn();
  const mockSignOut = jest.fn();

  return {
    useAuth: () => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      role: "climber" as const,
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
    }),
    // Expose mock functions so tests can configure return values
    __mockSignIn: mockSignIn,
    __mockSignUp: mockSignUp,
  };
});

// Mock expo-router navigation
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
  }),
  Link: ({ children, ...props }: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>{children}</Text>;
  },
}));

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -- Rendering --

  it("renders the welcome heading", () => {
    render(<LoginScreen />);
    expect(screen.getByText("Welcome Back!")).toBeOnTheScreen();
  });

  it("renders email input", () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText(/email/i)).toBeOnTheScreen();
  });

  it("renders password input", () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText(/password/i)).toBeOnTheScreen();
  });

  it("renders sign in button", () => {
    render(<LoginScreen />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeOnTheScreen();
  });

  it("renders forgot password link", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/forgot password/i)).toBeOnTheScreen();
  });

  it("renders social sign-in section", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/or continue with/i)).toBeOnTheScreen();
  });

  it("renders link to register screen", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/sign up/i)).toBeOnTheScreen();
  });

  // -- Validation --

  it("shows error when submitting empty form", async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeOnTheScreen();
    });
  });

  it("shows error for invalid email format", async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "notanemail");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "password123");
    fireEvent.press(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeOnTheScreen();
    });
  });

  // -- Successful login --

  it("calls signIn with email and password on submit", async () => {
    const { __mockSignIn } = require("@/hooks/useAuth");
    __mockSignIn.mockResolvedValue({ data: {}, error: null });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "password123");
    fireEvent.press(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(__mockSignIn).toHaveBeenCalledWith("test@example.com", "password123");
    });
  });

  // -- Failed login --

  it("shows error message when signIn fails", async () => {
    const { __mockSignIn } = require("@/hooks/useAuth");
    __mockSignIn.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials" },
    });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "wrongpassword");
    fireEvent.press(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid login credentials/i)).toBeOnTheScreen();
    });
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm test -- app/(auth)/__tests__/login.test.tsx`
Expected: FAIL — `Cannot find module '../login'`

### Step 3: Commit

```bash
git add app/\(auth\)/__tests__/login.test.tsx
git commit -m "test: add 11 failing tests for Login screen"
```

---

## Task 3: Login Screen Implementation

**Files:**
- Create: `app/(auth)/login.tsx`

### Step 1: Implement the Login screen

```typescript
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
// 2. Presses "Sign in" → RHF validates via zodResolver(loginSchema)
// 3. If invalid → error messages appear below inputs
// 4. If valid → calls useAuth().signIn(email, password)
// 5. If signIn fails → shows API error message
// 6. If signIn succeeds → onAuthStateChange fires → root layout redirects to (tabs)

import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useAuth } from "@/hooks/useAuth";
import { loginSchema } from "@/utils/validation";
import type { LoginInput } from "@/utils/validation";
import { Button, AppTextInput, Divider } from "@/components/ui";

export default function LoginScreen() {
  // API-level error from Supabase (e.g., "Invalid login credentials")
  const [apiError, setApiError] = useState<string | null>(null);

  const { signIn } = useAuth();

  // react-hook-form setup:
  // - resolver: zodResolver validates against our loginSchema on submit
  // - defaultValues: required for Controller components in React Native
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
    setApiError(null);
    const { error } = await signIn(data.email, data.password);
    if (error && typeof error === "object" && "message" in error) {
      setApiError((error as { message: string }).message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* -- Logo & Welcome Text -- */}
        <View className="items-center mb-10">
          <Text className="text-text-primary text-6xl font-bold mb-2">BB</Text>
          <Text className="text-text-primary text-3xl font-bold">
            Welcome Back!
          </Text>
          <Text className="text-text-secondary text-base mt-1">
            We missed you!
          </Text>
        </View>

        {/* -- Login Form -- */}
        <View className="mb-6">
          {/* Email field — Controller wraps AppTextInput for react-hook-form */}
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label="Email"
                value={value}
                onChangeText={onChange}
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email?.message}
                testID="email-input"
              />
            )}
          />

          {/* Password field */}
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label="Password"
                value={value}
                onChangeText={onChange}
                placeholder="Enter password"
                secureTextEntry
                error={errors.password?.message}
                testID="password-input"
              />
            )}
          />

          {/* Forgot Password link — right-aligned below password input */}
          <View className="items-end -mt-2 mb-4">
            <Link href="/(auth)/forgot-password" asChild>
              <Text className="text-accent-light text-sm">
                Forgot Password?
              </Text>
            </Link>
          </View>
        </View>

        {/* -- API Error Message -- */}
        {apiError ? (
          <View className="bg-error/10 rounded-lg p-3 mb-4">
            <Text className="text-error text-sm text-center">{apiError}</Text>
          </View>
        ) : null}

        {/* -- Sign In Button -- */}
        <Button
          label="Sign in"
          onPress={handleSubmit(onSubmit)}
          size="lg"
          loading={isSubmitting}
          testID="sign-in-button"
        />

        {/* -- Social Sign-In Section -- */}
        <View className="mt-8">
          <View className="flex-row items-center mb-6">
            <Divider className="flex-1" />
            <Text className="text-text-muted text-sm mx-4">
              Or continue with
            </Text>
            <Divider className="flex-1" />
          </View>

          {/* Social buttons — placeholder for OAuth integration.
              Full OAuth flow requires deep link configuration (later phase).
              For now, these are visual-only to match the mockup. */}
          <View className="flex-row justify-center gap-4">
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <Text className="text-text-primary text-lg">G</Text>
            </View>
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <Text className="text-text-primary text-lg">A</Text>
            </View>
          </View>
        </View>

        {/* -- Register Link -- */}
        <View className="flex-row justify-center mt-8">
          <Text className="text-text-secondary text-sm">
            Don&apos;t have an account?{" "}
          </Text>
          <Link href="/(auth)/register" asChild>
            <Text className="text-accent-light text-sm font-semibold">
              Sign up
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

### Step 2: Run tests to verify they pass

Run: `npm test -- app/(auth)/__tests__/login.test.tsx`
Expected: 11 tests PASS

### Step 3: Run full test suite

Run: `npm test`
Expected: All tests pass (no regressions).

### Step 4: Commit

```bash
git add app/\(auth\)/login.tsx
git commit -m "feat: implement Login screen with react-hook-form + Zod validation"
```

---

## Task 4: Register Screen Tests

**Files:**
- Create: `app/(auth)/__tests__/register.test.tsx`

### Step 1: Write the failing tests

```typescript
// app/(auth)/__tests__/register.test.tsx
//
// Tests for the Register screen. Similar mock setup to login tests.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import RegisterScreen from "../register";

// Mock lucide-react-native
jest.mock("lucide-react-native", () => ({
  Eye: (props: any) => {
    const { Text } = require("react-native");
    return <Text>EyeIcon</Text>;
  },
  EyeOff: (props: any) => {
    const { Text } = require("react-native");
    return <Text>EyeOffIcon</Text>;
  },
  Mail: (props: any) => {
    const { Text } = require("react-native");
    return <Text>MailIcon</Text>;
  },
  User: (props: any) => {
    const { Text } = require("react-native");
    return <Text>UserIcon</Text>;
  },
  Lock: (props: any) => {
    const { Text } = require("react-native");
    return <Text>LockIcon</Text>;
  },
}));

// Mock useAuth
jest.mock("@/hooks/useAuth", () => {
  const mockSignIn = jest.fn();
  const mockSignUp = jest.fn();
  const mockSignOut = jest.fn();

  return {
    useAuth: () => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      role: "climber" as const,
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
    }),
    __mockSignUp: mockSignUp,
  };
});

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
  }),
  Link: ({ children, ...props }: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>{children}</Text>;
  },
}));

describe("RegisterScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -- Rendering --

  it("renders the sign up heading", () => {
    render(<RegisterScreen />);
    expect(screen.getByText("Sign up!")).toBeOnTheScreen();
  });

  it("renders email input", () => {
    render(<RegisterScreen />);
    expect(screen.getByPlaceholderText(/email/i)).toBeOnTheScreen();
  });

  it("renders display name input", () => {
    render(<RegisterScreen />);
    expect(screen.getByPlaceholderText(/name/i)).toBeOnTheScreen();
  });

  it("renders password input", () => {
    render(<RegisterScreen />);
    expect(screen.getByPlaceholderText(/password/i)).toBeOnTheScreen();
  });

  it("renders sign up button", () => {
    render(<RegisterScreen />);
    expect(screen.getByRole("button", { name: /sign up/i })).toBeOnTheScreen();
  });

  it("renders link to login screen", () => {
    render(<RegisterScreen />);
    expect(screen.getByText(/sign in/i)).toBeOnTheScreen();
  });

  // -- Validation --

  it("shows error when submitting empty form", async () => {
    render(<RegisterScreen />);
    fireEvent.press(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeOnTheScreen();
    });
  });

  it("shows error for short password", async () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "short");
    fireEvent.press(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      // registrationSchema requires min 8 chars
      expect(screen.getByText(/8/i)).toBeOnTheScreen();
    });
  });

  // -- Successful registration --

  it("calls signUp with email and password on submit", async () => {
    const { __mockSignUp } = require("@/hooks/useAuth");
    __mockSignUp.mockResolvedValue({ data: {}, error: null });

    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "new@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "securepass123");
    fireEvent.press(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(__mockSignUp).toHaveBeenCalledWith("new@example.com", "securepass123");
    });
  });

  // -- Failed registration --

  it("shows error message when signUp fails", async () => {
    const { __mockSignUp } = require("@/hooks/useAuth");
    __mockSignUp.mockResolvedValue({
      data: null,
      error: { message: "User already registered" },
    });

    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "existing@example.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "securepass123");
    fireEvent.press(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/user already registered/i)).toBeOnTheScreen();
    });
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm test -- app/(auth)/__tests__/register.test.tsx`
Expected: FAIL — `Cannot find module '../register'`

### Step 3: Commit

```bash
git add app/\(auth\)/__tests__/register.test.tsx
git commit -m "test: add 10 failing tests for Register screen"
```

---

## Task 5: Register Screen Implementation

**Files:**
- Create: `app/(auth)/register.tsx`

### Step 1: Implement the Register screen

```typescript
// app/(auth)/register.tsx
//
// Registration screen for new Beta Breaker users.
//
// Uses the same react-hook-form + zodResolver pattern as Login, but with
// the registrationSchema (requires email, min 8-char password, optional
// display name). The password strength indicator is a visual-only feature
// that updates in real-time as the user types — it doesn't block submission.
//
// FLOW:
// 1. User fills email + name (optional) + password
// 2. Presses "Sign up" → RHF validates via zodResolver(registrationSchema)
// 3. If invalid → error messages appear
// 4. If valid → calls useAuth().signUp(email, password)
// 5. Success → onAuthStateChange fires → root layout redirects to (tabs)

import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useAuth } from "@/hooks/useAuth";
import { registrationSchema } from "@/utils/validation";
import type { RegistrationInput } from "@/utils/validation";
import { Button, AppTextInput, Divider } from "@/components/ui";

/**
 * Calculates password strength on a 0–4 scale.
 * This is a UI-only indicator — it doesn't affect validation.
 * The actual password requirement (min 8 chars) is enforced by Zod.
 *
 * Scoring:
 *   +1 for length >= 8
 *   +1 for containing a number
 *   +1 for containing an uppercase letter
 *   +1 for containing a special character
 */
function getPasswordStrength(password: string): number {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/\d/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  return strength;
}

/** Maps strength score to a label and color for the UI. */
const strengthConfig = [
  { label: "", color: "#6B6B80" },       // 0: empty
  { label: "Weak", color: "#EF4444" },   // 1: red
  { label: "Fair", color: "#F59E0B" },   // 2: amber
  { label: "Strong", color: "#22C55E" }, // 3: green
  { label: "Strong", color: "#22C55E" }, // 4: green
] as const;

export default function RegisterScreen() {
  const [apiError, setApiError] = useState<string | null>(null);
  const { signUp } = useAuth();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationInput>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { email: "", password: "", displayName: "" },
  });

  // Watch password field for real-time strength calculation.
  // `watch` re-renders the component when the watched field changes.
  const password = watch("password");
  const strength = getPasswordStrength(password || "");
  const { label: strengthLabel, color: strengthColor } = strengthConfig[strength];

  const onSubmit = async (data: RegistrationInput) => {
    setApiError(null);
    const { error } = await signUp(data.email, data.password);
    if (error && typeof error === "object" && "message" in error) {
      setApiError((error as { message: string }).message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* -- Logo & Heading -- */}
        <View className="items-center mb-10">
          <Text className="text-text-primary text-6xl font-bold mb-2">BB</Text>
          <Text className="text-text-primary text-3xl font-bold">
            Sign up!
          </Text>
          <Text className="text-text-secondary text-base mt-1">
            Make part of this amazing community!
          </Text>
        </View>

        {/* -- Registration Form -- */}
        <View className="mb-6">
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label="Email Address"
                value={value}
                onChangeText={onChange}
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email?.message}
                testID="email-input"
              />
            )}
          />

          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label="Your Name"
                value={value ?? ""}
                onChangeText={onChange}
                placeholder="@yourname"
                autoCapitalize="words"
                error={errors.displayName?.message}
                testID="name-input"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <AppTextInput
                label="Password"
                value={value}
                onChangeText={onChange}
                placeholder="Enter password"
                secureTextEntry
                error={errors.password?.message}
                testID="password-input"
              />
            )}
          />

          {/* Password strength indicator — visual only, shows colored bars */}
          {password && password.length > 0 ? (
            <View className="flex-row items-center gap-2 -mt-2 mb-4">
              {[1, 2, 3, 4].map((level) => (
                <View
                  key={level}
                  className="flex-1 h-1 rounded-full"
                  style={{
                    backgroundColor: level <= strength ? strengthColor : "#2A2A3C",
                  }}
                />
              ))}
              <Text style={{ color: strengthColor }} className="text-xs ml-1">
                {strengthLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* -- API Error -- */}
        {apiError ? (
          <View className="bg-error/10 rounded-lg p-3 mb-4">
            <Text className="text-error text-sm text-center">{apiError}</Text>
          </View>
        ) : null}

        {/* -- Sign Up Button -- */}
        <Button
          label="Sign up"
          onPress={handleSubmit(onSubmit)}
          size="lg"
          loading={isSubmitting}
          testID="sign-up-button"
        />

        {/* -- Social Sign-Up -- */}
        <View className="mt-8">
          <View className="flex-row items-center mb-6">
            <Divider className="flex-1" />
            <Text className="text-text-muted text-sm mx-4">
              Or sign up with
            </Text>
            <Divider className="flex-1" />
          </View>

          <View className="flex-row justify-center gap-4">
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <Text className="text-text-primary text-lg">G</Text>
            </View>
            <View className="w-12 h-12 rounded-full bg-surface items-center justify-center">
              <Text className="text-text-primary text-lg">A</Text>
            </View>
          </View>
        </View>

        {/* -- Login Link -- */}
        <View className="flex-row justify-center mt-8">
          <Text className="text-text-secondary text-sm">
            Already have an account?{" "}
          </Text>
          <Link href="/(auth)/login" asChild>
            <Text className="text-accent-light text-sm font-semibold">
              Sign in
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

### Step 2: Run tests to verify they pass

Run: `npm test -- app/(auth)/__tests__/register.test.tsx`
Expected: 10 tests PASS

### Step 3: Run full test suite

Run: `npm test`
Expected: All tests pass.

### Step 4: Commit

```bash
git add app/\(auth\)/register.tsx
git commit -m "feat: implement Register screen with password strength indicator"
```

---

## Task 6: Forgot Password Screen

**Files:**
- Create: `app/(auth)/forgot-password.tsx`
- Create: `app/(auth)/__tests__/forgot-password.test.tsx`

### Step 1: Write the failing tests

```typescript
// app/(auth)/__tests__/forgot-password.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ForgotPasswordScreen from "../forgot-password";

// Mock lucide icons
jest.mock("lucide-react-native", () => ({
  Mail: (props: any) => {
    const { Text } = require("react-native");
    return <Text>MailIcon</Text>;
  },
  ArrowLeft: (props: any) => {
    const { Text } = require("react-native");
    return <Text>ArrowLeftIcon</Text>;
  },
}));

// Mock authService.resetPassword
jest.mock("@/services/auth.service", () => ({
  authService: {
    resetPassword: jest.fn(),
  },
}));

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
  }),
  Link: ({ children, ...props }: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>{children}</Text>;
  },
}));

describe("ForgotPasswordScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the heading", () => {
    render(<ForgotPasswordScreen />);
    expect(screen.getByText(/reset password/i)).toBeOnTheScreen();
  });

  it("renders email input", () => {
    render(<ForgotPasswordScreen />);
    expect(screen.getByPlaceholderText(/email/i)).toBeOnTheScreen();
  });

  it("renders submit button", () => {
    render(<ForgotPasswordScreen />);
    expect(screen.getByRole("button", { name: /send/i })).toBeOnTheScreen();
  });

  it("shows error for invalid email", async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "bademail");
    fireEvent.press(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeOnTheScreen();
    });
  });

  it("calls resetPassword with email", async () => {
    const { authService } = require("@/services/auth.service");
    authService.resetPassword.mockResolvedValue({ data: {}, error: null });

    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.press(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(authService.resetPassword).toHaveBeenCalledWith("test@example.com");
    });
  });

  it("shows success message after sending", async () => {
    const { authService } = require("@/services/auth.service");
    authService.resetPassword.mockResolvedValue({ data: {}, error: null });

    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "test@example.com");
    fireEvent.press(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeOnTheScreen();
    });
  });
});
```

### Step 2: Run to verify failure, then implement

```typescript
// app/(auth)/forgot-password.tsx
//
// Forgot Password screen — sends a password reset email via Supabase.
//
// This screen is intentionally simple: just an email input and a submit
// button. After sending, it shows a success message telling the user to
// check their email. We don't reveal whether the email exists in the system
// (Supabase handles this securely — it always returns success to prevent
// email enumeration attacks).

import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { authService } from "@/services/auth.service";
import { Button, AppTextInput } from "@/components/ui";

// Simple schema: just needs a valid email
const forgotPasswordSchema = z.object({
  email: z.email("Please enter a valid email address"),
});

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordScreen() {
  const [sent, setSent] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setApiError(null);
    const { error } = await authService.resetPassword(data.email);
    if (error) {
      setApiError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-10">
          <Text className="text-text-primary text-3xl font-bold">
            Reset Password
          </Text>
          <Text className="text-text-secondary text-base mt-2 text-center">
            Enter your email and we&apos;ll send you a link to reset your
            password.
          </Text>
        </View>

        {sent ? (
          // Success state — show confirmation message
          <View className="bg-success/10 rounded-lg p-4 mb-6">
            <Text className="text-success text-sm text-center">
              Check your email for a password reset link.
            </Text>
          </View>
        ) : (
          // Form state — show email input + submit
          <View className="mb-6">
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <AppTextInput
                  label="Email Address"
                  value={value}
                  onChangeText={onChange}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={errors.email?.message}
                  testID="email-input"
                />
              )}
            />

            {apiError ? (
              <View className="bg-error/10 rounded-lg p-3 mb-4">
                <Text className="text-error text-sm text-center">
                  {apiError}
                </Text>
              </View>
            ) : null}

            <Button
              label="Send Reset Link"
              onPress={handleSubmit(onSubmit)}
              size="lg"
              loading={isSubmitting}
            />
          </View>
        )}

        {/* Back to Login */}
        <View className="flex-row justify-center mt-6">
          <Link href="/(auth)/login" asChild>
            <Text className="text-accent-light text-sm font-semibold">
              Back to Login
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

### Step 3: Run tests, verify pass

Run: `npm test -- app/(auth)/__tests__/forgot-password.test.tsx`
Expected: 6 tests PASS

### Step 4: Commit

```bash
git add app/\(auth\)/forgot-password.tsx app/\(auth\)/__tests__/forgot-password.test.tsx
git commit -m "feat: add Forgot Password screen with email validation"
```

---

## Task 7: Root Layout Auth Gate Tests

**Files:**
- Create: `app/__tests__/_layout.test.tsx`

### Step 1: Write the failing tests

These test the auth gate logic: show (auth) when not authenticated, show (tabs) when authenticated.

```typescript
// app/__tests__/_layout.test.tsx
//
// Tests for the root layout's auth gate behavior.
// The root layout should redirect to (auth) when not authenticated
// and show (tabs) when authenticated.

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

// We'll test the AuthGate component directly since testing the full
// root layout requires the Expo Router context which is complex to mock.
// Instead, we extract the auth gate logic into a testable component.

// Mock useAuth with controllable state
let mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

// Mock expo-router Redirect
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text testID="redirect">Redirect to {href}</Text>;
  },
  Slot: () => {
    const { Text } = require("react-native");
    return <Text testID="slot">Slot</Text>;
  },
  Stack: Object.assign(
    ({ children }: any) => {
      const { View } = require("react-native");
      return <View>{children}</View>;
    },
    {
      Screen: ({ name }: any) => {
        const { Text } = require("react-native");
        return <Text>Screen: {name}</Text>;
      },
    }
  ),
}));

// Import after mocks are set up
import { AuthGate } from "../_layout";

describe("AuthGate", () => {
  beforeEach(() => {
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
    };
  });

  it("shows loading state while auth is initializing", () => {
    mockAuthState = { isAuthenticated: false, isLoading: true };
    render(<AuthGate />);
    // During loading, nothing should render (or a splash screen)
    expect(screen.queryByTestId("redirect")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("slot")).not.toBeOnTheScreen();
  });

  it("redirects to login when not authenticated", () => {
    mockAuthState = { isAuthenticated: false, isLoading: false };
    render(<AuthGate />);
    expect(screen.getByTestId("redirect")).toBeOnTheScreen();
    expect(screen.getByText(/\(auth\)/)).toBeOnTheScreen();
  });

  it("renders main app when authenticated", () => {
    mockAuthState = { isAuthenticated: true, isLoading: false };
    render(<AuthGate />);
    expect(screen.getByTestId("slot")).toBeOnTheScreen();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm test -- app/__tests__/_layout.test.tsx`
Expected: FAIL — `Cannot find module '../_layout'` or `AuthGate is not exported`

### Step 3: Commit

```bash
git add app/__tests__/_layout.test.tsx
git commit -m "test: add 3 failing tests for root layout auth gate"
```

---

## Task 8: Root Layout with Auth Gate

**Files:**
- Modify: `app/_layout.tsx`

### Step 1: Rewrite the root layout

The current layout has no auth gate. Rewrite it to:
1. Export an `AuthGate` component (testable separately)
2. Wrap the app in `QueryClientProvider`
3. Conditionally show auth screens or main app based on `useAuth().isAuthenticated`

```typescript
// app/_layout.tsx
//
// Root layout — the entry point for the entire app.
//
// This file does three critical things:
//
// 1. PROVIDERS: Wraps the app in QueryClientProvider (for TanStack Query)
//    and ThemeProvider (for React Navigation's dark/light styling).
//
// 2. AUTH GATE: Uses `useAuth()` to decide which route group to show:
//    - isLoading → null (splash screen stays visible)
//    - !isAuthenticated → Redirect to (auth)/login
//    - isAuthenticated → render <Slot /> (shows (tabs) or other routes)
//
// 3. FONT LOADING: Loads custom fonts (SpaceMono) and hides the splash
//    screen once everything is ready.
//
// WHY REDIRECT INSTEAD OF CONDITIONAL RENDERING?
// Expo Router's <Redirect> component triggers a client-side navigation.
// This means the URL updates, back button works correctly, and deep links
// can target auth screens directly. Manual conditional rendering would
// break the URL-based navigation model.

import "../global.css";

import { useEffect } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Redirect, Slot, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import "react-native-reanimated";

import { useAuth } from "@/hooks/useAuth";
import { useColorScheme } from "@/components/useColorScheme";

// Keep the splash screen visible while we load fonts and check auth state
SplashScreen.preventAutoHideAsync();

// Create a single QueryClient instance for the entire app.
// This lives outside the component to persist across re-renders.
const queryClient = new QueryClient();

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  // If the user deep-links to a modal, ensure (tabs) is the initial route
  // so pressing "back" goes to the home screen, not a blank page.
  initialRouteName: "(tabs)",
};

/**
 * AuthGate — decides what to render based on auth state.
 *
 * Exported separately so it can be unit-tested without needing
 * the full Expo Router provider context.
 */
export function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  // While restoring session from SecureStore, show nothing.
  // The splash screen is still visible, so the user sees the app icon.
  if (isLoading) {
    return null;
  }

  // Not authenticated → send to login screen
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Authenticated → render the current route (tabs, modal, etc.)
  return <Slot />;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const colorScheme = useColorScheme();

  // If font loading fails, throw the error so ErrorBoundary catches it
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Hide splash screen once fonts are loaded
  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Don't render until fonts are loaded
  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AuthGate />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

### Step 2: Run tests

Run: `npm test -- app/__tests__/_layout.test.tsx`
Expected: 3 tests PASS

### Step 3: Run full suite

Run: `npm test`
Expected: All tests pass.

### Step 4: Verify type-check

Run: `npx tsc --noEmit`
Expected: Pass.

### Step 5: Commit

```bash
git add app/_layout.tsx
git commit -m "feat: add auth gate to root layout with QueryClientProvider"
```

---

## Task 9: Final Verification & Dev Plan Update

**Files:**
- Modify: `Documentation/DevelopmentPlan.md`

### Step 1: Run full test suite

Run: `npm test`
Expected: All tests pass (197 existing + ~30 new = ~227).

### Step 2: Run type-check

Run: `npx tsc --noEmit`
Expected: Pass.

### Step 3: Run linter

Run: `npm run lint`
Expected: No new errors.

### Step 4: Mark Step 3.5 complete in DevelopmentPlan.md

Add ✅ and implementation notes to Step 3.5.

### Step 5: Commit

```bash
git add Documentation/DevelopmentPlan.md
git commit -m "docs: mark Step 3.5 complete with implementation notes"
```

---

## Summary

| Task | What | New Tests |
|---|---|---|
| 1 | `app/(auth)/_layout.tsx` — auth stack layout | — |
| 2 | Login screen tests | 11 |
| 3 | `app/(auth)/login.tsx` — Login with RHF + Zod | — |
| 4 | Register screen tests | 10 |
| 5 | `app/(auth)/register.tsx` — Register with password strength | — |
| 6 | Forgot Password screen + tests | 6 |
| 7 | Root layout auth gate tests | 3 |
| 8 | `app/_layout.tsx` — auth gate + QueryClientProvider | — |
| 9 | Final verification + docs | — |

**Total new tests: ~30**
**Total unit tests after step: ~227**
**Commits: 9**

### Key Architectural Decisions

1. **react-hook-form + Controller** (not `register`): In React Native, `register` returns HTML-specific props. `Controller` gives us `onChange`/`value` that wire directly to `AppTextInput`.

2. **Auth gate uses `<Redirect>`** (not conditional rendering): Expo Router's `Redirect` component properly updates the URL and navigation state, making deep links and back button work correctly.

3. **No manual navigation on login success**: When `signIn()` succeeds, Supabase fires `onAuthStateChange`, which the `useAuth` hook handles. The root layout's `AuthGate` sees `isAuthenticated` flip to `true` and renders `<Slot />` instead of `<Redirect>`. This is the single source of truth pattern from Step 3.3.

4. **Social OAuth buttons are visual-only**: Full OAuth requires deep link configuration and app signing, which is done in a later phase. The buttons render correctly but don't trigger OAuth flows yet.

5. **`AuthGate` exported separately**: This allows unit testing the auth gate logic without needing the full Expo Router provider. The root layout composes it with providers.
