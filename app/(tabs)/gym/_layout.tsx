/**
 * Gym Stack Layout — Nested Stack Navigator Inside the Tab Group
 *
 * This layout provides a Stack navigator for gym-related screens. It lives
 * inside the (tabs) group as a hidden tab (href: null), so the bottom tab
 * bar stays visible while navigating through gym screens.
 *
 * WHY NESTED INSIDE (tabs)?
 * Keeping the gym Stack inside the tab navigator ensures the tab bar remains
 * visible on gym detail, route list, route detail, leaderboard, and ascent
 * form screens. The FAB (showing a Timer icon during active sessions) stays
 * accessible throughout the gym browsing flow.
 *
 * SCREEN FLOW:
 *   (tabs)/map → gym/[id] → gym/[id]/routes → gym/[id]/route/[routeId]
 *   ← back      ← back     ← back
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
        // All gym screens manage their own headers (SafeAreaView + back
        // button + title). The default Stack header shows raw route names
        // like "[id]/route/[routeId]" which is ugly and meaningless.
        headerShown: false,
      }}
    />
  );
}
