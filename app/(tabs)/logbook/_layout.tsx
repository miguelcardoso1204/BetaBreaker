/**
 * Logbook Stack Layout — Navigation Container for Session History
 *
 * Provides a Stack navigator for the logbook screens: the main session
 * list (index) and the per-date session detail ([date]). Lives inside
 * (tabs) but is hidden from the tab bar via `href: null` in the parent
 * tab layout — users navigate here from the home/session screens.
 *
 * WHY A STACK INSIDE TABS?
 * The logbook needs drill-down navigation (list → detail) with a back
 * button. By nesting a Stack inside the tab group, we get:
 *   1. Standard back button navigation between logbook screens
 *   2. The tab bar stays hidden (thanks to href: null in parent)
 *   3. Back from the logbook index returns to the previous tab
 *
 * HEADER STYLE:
 * Dark background (#1a1a2e) matching the app theme. White back chevron
 * and bold title text for consistency with the gym Stack layout.
 */

import React from "react";
import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";

export default function LogbookLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        // Dark header matching the app's dark theme (same as gym/_layout.tsx)
        headerStyle: { backgroundColor: "#1a1a2e" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "bold" },
        // Back button — always visible since logbook is navigated to from
        // other screens. Uses the same ChevronLeft pattern as gym layout.
        headerLeft: () => (
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={28} color="#ffffff" />
          </Pressable>
        ),
      }}
    >
      {/* Main logbook list — sessions/saved segments */}
      <Stack.Screen name="index" options={{ title: "Logbook" }} />

      {/* Per-date session detail — summary card + ascent list */}
      <Stack.Screen name="[date]" options={{ title: "Session Detail" }} />

      {/* Per-session-ID detail — accessed from profile session cards.
          Header hidden because the screen renders its own SafeAreaView header. */}
      <Stack.Screen name="session/[sessionId]" options={{ headerShown: false }} />
    </Stack>
  );
}
