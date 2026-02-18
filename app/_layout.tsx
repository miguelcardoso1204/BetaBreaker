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
// WHY useEffect + router.replace INSTEAD OF <Redirect>?
// The root layout must ALWAYS render <Slot /> so child routes have a
// container to render in. If we conditionally return <Redirect> instead
// of <Slot />, Expo Router has no outlet for the target screen, causing
// the root layout to unmount/remount in an infinite loop.
//
// Instead, we always render <Slot /> and use useEffect + router.replace
// to navigate. This way the navigation container stays stable and the
// auth/tabs screens render correctly inside it.

import "../global.css";

import { useEffect, useState } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import "react-native-reanimated";

import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { usePushTokenRegistration } from "@/hooks/usePushTokenRegistration";
import { useColorScheme } from "@/components/useColorScheme";
import { queryClient } from "@/lib/queryClient";
import i18n, { initI18n } from "@/lib/i18n";
import { useOfflineStore } from "@/stores/offlineStore";

// Keep the splash screen visible while we load fonts and check auth state.
// preventAutoHideAsync() is called at module scope (not inside a component)
// because it needs to run BEFORE any component renders — otherwise the
// splash screen might flash away during the first render cycle.
SplashScreen.preventAutoHideAsync();

export {
  // Catch any errors thrown by the Layout component.
  // Expo Router uses React Error Boundaries to display a fallback UI
  // when navigation or rendering fails.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  // If the user deep-links to a modal, ensure (tabs) is the initial route
  // so pressing "back" goes to the home screen, not a blank page.
  initialRouteName: "(tabs)",
};

/**
 * AuthGate — handles auth-based routing via useEffect + router.replace.
 *
 * Key insight: we ALWAYS render <Slot /> so Expo Router has a stable
 * navigation container. The redirect logic lives in a useEffect that
 * watches auth state and the current route segment:
 *
 * - Not authenticated + not in (auth) group → navigate to login
 * - Authenticated + still in (auth) group → navigate to tabs
 * - Otherwise → do nothing (user is where they should be)
 *
 * This avoids the infinite remount loop caused by conditionally returning
 * <Redirect> instead of <Slot />.
 *
 * WHY IS THIS EXPORTED?
 * We export it separately so it can be unit-tested without needing
 * the full Expo Router provider context.
 */
export function AuthGate() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while we're still restoring the session from
    // SecureStore — we don't know the auth state yet.
    if (isLoading) return;

    // Check if the user is currently viewing an auth screen (login,
    // register, forgot-password). segments[0] is the first path segment,
    // e.g. "(auth)" or "(tabs)".
    const inAuthGroup = segments[0] === "(auth)";
    // Type assertion needed because the auto-generated router types
    // (.expo/types/router.d.ts) may not include "onboarding" yet.
    // The file app/onboarding.tsx exists, so this is a valid segment.
    const inOnboarding = (segments[0] as string) === "onboarding";

    if (!isAuthenticated && !inAuthGroup) {
      // User is not logged in but is viewing a protected screen →
      // send them to login.
      router.replace("/(auth)/login");
    } else if (isAuthenticated) {
      // Wait for profile to load before making onboarding decisions.
      // After session restore, isAuthenticated is true but user is null
      // while the profile fetch is in flight. Routing without profile
      // data would send everyone to onboarding on every app restart.
      if (!user) return;

      if (user.onboardingCompleted) {
        // Returning user with completed onboarding — route to tabs if
        // they're still in the auth group or stuck on the onboarding screen.
        if (inAuthGroup || inOnboarding) {
          router.replace("/(tabs)");
        }
      } else {
        // New user who hasn't completed onboarding — route to the wizard
        // unless they're already on it.
        if (!inOnboarding) {
          router.replace("/onboarding");
        }
      }
    }
  }, [isAuthenticated, isLoading, segments, user?.onboardingCompleted]);

  // Always render the navigator so child routes have a container.
  // Using <Stack> (instead of <Slot>) gives us push/pop navigation
  // between route groups (e.g., (tabs) → gym/[id]). Each group
  // manages its own header, so we hide the root-level header.
  // While isLoading is true, the splash screen is still visible
  // (hidden only after fonts load), so the user sees the app icon.
  // Explicitly declare screen entries so we can configure start-session
  // as a modal. Without this, it would render as a full push — losing
  // the "overlay on top of current tab" UX we want. The other screens
  // inherit the default headerShown: false from screenOptions.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="gym" />
      <Stack.Screen name="settings" />
      <Stack.Screen
        name="start-session"
        options={{ presentation: "modal" }}
      />
    </Stack>
  );
}

/**
 * SyncManager — invisible component that runs the offline sync engine.
 *
 * This must be rendered INSIDE QueryClientProvider so it can invalidate
 * TanStack Query caches after syncing. It subscribes to NetInfo for
 * connectivity changes and drains the offline queue on reconnect.
 *
 * Why a separate component instead of calling useOfflineSync in RootLayout?
 * Hooks can only be called inside function components, and we want the
 * sync logic isolated so it doesn't re-render the entire layout tree
 * when isSyncing changes. React only re-renders the component that owns
 * the state — keeping it in SyncManager prevents unnecessary re-renders
 * of ThemeProvider, AuthGate, and all child routes.
 */
function SyncManager() {
  useOfflineSync();
  return null;
}

/**
 * PushTokenManager — invisible component that handles push token registration.
 *
 * On mount (when the user is authenticated), this requests notification
 * permissions and persists the device's Expo push token in the DB. This
 * is a fire-and-forget operation — if it fails, the app continues normally
 * without push notifications.
 *
 * Same pattern as SyncManager: a separate component to isolate the side
 * effect and prevent unnecessary re-renders of the layout tree.
 */
function PushTokenManager() {
  usePushTokenRegistration();
  return null;
}

/**
 * RootLayout — the default export that Expo Router mounts as the root.
 *
 * This wraps the entire app in providers and handles font loading.
 * The provider order matters:
 * - QueryClientProvider must be outermost so any component can use queries
 * - ThemeProvider provides dark/light theme to React Navigation components
 * - SyncManager runs the offline sync engine (subscribes to NetInfo)
 * - AuthGate is the innermost — it reads auth state and picks the route
 */
export default function RootLayout() {
  // Load custom fonts. useFonts returns [loaded, error] — a tuple where
  // `loaded` is true once fonts are ready, `error` is set if loading fails.
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const colorScheme = useColorScheme();

  // Track whether i18n has finished initializing. This runs in parallel
  // with font loading so there's no extra wait. The splash screen stays
  // visible until BOTH fonts and i18n are ready.
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  // If font loading fails, throw the error so ErrorBoundary catches it.
  // useEffect ensures this runs after render, which is required for
  // error boundaries to intercept the thrown error properly.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Hydrate the offline queue from SQLite on app startup.
  // This restores any pending actions that were queued while the app was
  // offline and persisted across app restarts. The sync engine (SyncManager)
  // will then replay these when connectivity returns.
  // Using getState().hydrate() instead of the hook selector avoids
  // subscribing to queue changes — we just need the one-time load.
  useEffect(() => {
    useOfflineStore.getState().hydrate();
  }, []);

  // Hide splash screen once fonts AND i18n are loaded.
  // We don't wait for auth — the AuthGate handles that by returning null
  // (which keeps the splash visible since nothing replaces it).
  useEffect(() => {
    if (loaded && i18nReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, i18nReady]);

  // Don't render anything until fonts and i18n are loaded.
  // The splash screen is still showing, so this is invisible to the user.
  if (!loaded || !i18nReady) {
    return null;
  }

  // Wrap the app in providers and render the auth gate.
  // QueryClientProvider → enables useQuery/useMutation in any child component
  // I18nextProvider → provides translation context to useTranslation() hooks
  // SyncManager → subscribes to NetInfo, drains offline queue on reconnect
  // ThemeProvider → provides dark/light colors to React Navigation's UI
  // AuthGate → decides which route group (auth vs tabs) to show
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <SyncManager />
        <PushTokenManager />
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <AuthGate />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
