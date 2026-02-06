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

import { useEffect } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import "react-native-reanimated";

import { useAuth } from "@/hooks/useAuth";
import { useColorScheme } from "@/components/useColorScheme";

// Keep the splash screen visible while we load fonts and check auth state.
// preventAutoHideAsync() is called at module scope (not inside a component)
// because it needs to run BEFORE any component renders — otherwise the
// splash screen might flash away during the first render cycle.
SplashScreen.preventAutoHideAsync();

// Create a single QueryClient instance for the entire app.
// This lives outside the component so it persists across re-renders.
// If we created it inside RootLayout, every re-render would create a new
// client and throw away all cached data — defeating the purpose of caching.
const queryClient = new QueryClient();

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
  const { isAuthenticated, isLoading } = useAuth();
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

    if (!isAuthenticated && !inAuthGroup) {
      // User is not logged in but is viewing a protected screen →
      // send them to login.
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      // User just logged in but is still on the login/register screen →
      // send them to the main app.
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments]);

  // Always render <Slot /> so child routes have a container.
  // While isLoading is true, the splash screen is still visible
  // (hidden only after fonts load), so the user sees the app icon.
  return <Slot />;
}

/**
 * RootLayout — the default export that Expo Router mounts as the root.
 *
 * This wraps the entire app in providers and handles font loading.
 * The provider order matters:
 * - QueryClientProvider must be outermost so any component can use queries
 * - ThemeProvider provides dark/light theme to React Navigation components
 * - AuthGate is the innermost — it reads auth state and picks the route
 */
export default function RootLayout() {
  // Load custom fonts. useFonts returns [loaded, error] — a tuple where
  // `loaded` is true once fonts are ready, `error` is set if loading fails.
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const colorScheme = useColorScheme();

  // If font loading fails, throw the error so ErrorBoundary catches it.
  // useEffect ensures this runs after render, which is required for
  // error boundaries to intercept the thrown error properly.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Hide splash screen once fonts are loaded.
  // We don't wait for auth — the AuthGate handles that by returning null
  // (which keeps the splash visible since nothing replaces it).
  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Don't render anything until fonts are loaded.
  // The splash screen is still showing, so this is invisible to the user.
  if (!loaded) {
    return null;
  }

  // Wrap the app in providers and render the auth gate.
  // QueryClientProvider → enables useQuery/useMutation in any child component
  // ThemeProvider → provides dark/light colors to React Navigation's UI
  // AuthGate → decides which route group (auth vs tabs) to show
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AuthGate />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
