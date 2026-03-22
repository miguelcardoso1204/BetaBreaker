// Notifications layout — wraps notification screens in a Stack.
// Needed so Expo Router registers this directory as "notifications"
// (not "notifications/index") in the tab navigator.

import React from "react";
import { Stack } from "expo-router";

export default function NotificationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
