/**
 * Gym Stack Layout — Navigation Container for Gym-Related Screens
 *
 * This layout provides a Stack navigator for screens under the /gym path.
 * It lives outside of (tabs), so the tab bar is NOT shown on these screens.
 * Instead, users get a standard back button to return to the previous screen.
 *
 * WHY A SEPARATE LAYOUT?
 * Expo Router uses file-based routing. Screens in `app/gym/` are outside the
 * `(tabs)` group, so they don't inherit the tab navigator. This Stack layout
 * gives them header + back navigation instead. When the user presses back,
 * they return to whatever tab screen they came from.
 *
 * SCREEN FLOW:
 *   (tabs)/index → /gym/[id]/routes → /gym/[id]/route/[routeId]
 *   ← back       ← back
 */

import React from "react";
import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";

export default function GymLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        // Dark header to match the app's dark theme
        headerStyle: { backgroundColor: "#1a1a2e" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "bold" },
        // Always show a back button. The gym Stack is nested inside the
        // root Stack, so React Navigation doesn't automatically add one
        // for the first screen. This ensures users can always navigate
        // back to the tab they came from (map, home, etc.).
        headerLeft: () => (
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={28} color="#ffffff" />
          </Pressable>
        ),
      }}
    />
  );
}
