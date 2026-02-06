// app/(tabs)/_layout.tsx
//
// Tab navigator layout with 4 tabs and a custom tab bar.
//
// WHY A CUSTOM TAB BAR?
// The default React Navigation tab bar doesn't support injecting a
// non-tab element (our Start Session FAB) into the middle. We pass
// our CustomTabBar component via the `tabBar` prop, which renders
// 4 route tabs (Home, Map, Leaderboards, Profile) with a raised
// FAB button in the center.
//
// WHY headerShown: false?
// Each screen manages its own header (or has none). Disabling the
// tab navigator's built-in header avoids a double-header situation
// where both the tab navigator and the screen show headers.
//
// SCREEN ORDER MATTERS:
// The order of <Tabs.Screen> declarations determines the order of
// tabs in the bar. Our CustomTabBar renders them based on the
// routes array from navigation state, which follows this order.

import React from "react";
import { Tabs } from "expo-router";
import { CustomTabBar } from "@/components/navigation/CustomTabBar";

export default function TabLayout() {
  return (
    <Tabs
      // Pass our custom tab bar component. React Navigation calls this
      // function with BottomTabBarProps (state, navigation, insets, etc.)
      // and renders the returned component instead of the default bar.
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        // Disable the built-in header — screens handle their own headers.
        headerShown: false,
      }}
    >
      {/* Home tab — Strava-style activity feed (placeholder for now) */}
      <Tabs.Screen name="index" />

      {/* Map tab — gym map browse (placeholder for now) */}
      <Tabs.Screen name="map" />

      {/* Leaderboards tab — rankings and competitions (placeholder for now) */}
      <Tabs.Screen name="leaderboards" />

      {/* Profile tab — user profile and settings (placeholder for now) */}
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
