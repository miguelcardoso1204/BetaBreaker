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
