/**
 * Events Stack Layout — Navigation Container for Event Screens
 *
 * Provides a Stack navigator for screens under /events. These are
 * public-facing screens (athletes browsing events, entering scores),
 * unlike the (admin)/events screens which are role-gated.
 *
 * WHY A SEPARATE LAYOUT?
 * Same pattern as app/gym/_layout.tsx — screens outside (tabs) don't
 * inherit the tab navigator. This Stack layout gives them a dark header
 * with back navigation. When the user presses back, they return to
 * whatever screen they came from (QR scanner, route detail, etc.).
 */

import React from "react";
import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";

export default function EventsLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        // Dark header to match the app's dark theme
        headerStyle: { backgroundColor: "#1a1a2e" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "bold" },
        // Custom back button — same as gym layout
        headerLeft: () => (
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={28} color="#ffffff" />
          </Pressable>
        ),
      }}
    />
  );
}
