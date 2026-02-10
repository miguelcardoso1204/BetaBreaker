/**
 * Route Detail Layout — Stack Navigator for Route Sub-Screens
 *
 * This layout wraps the route detail index and its sub-routes (like the
 * Full Ascent Form at /ascent) in a Stack navigator. The header is hidden
 * because the parent gym Stack layout already provides the app's navigation
 * header with a back button.
 *
 * WHY DIRECTORY-BASED ROUTING?
 * Expo Router's file-based routing maps directories to route segments.
 * Converting `[routeId].tsx` into `[routeId]/index.tsx` + `_layout.tsx`
 * allows adding sub-routes (like `[routeId]/ascent.tsx`) without changing
 * the existing URL structure. The route detail screen stays at the same
 * URL: `/gym/[id]/route/[routeId]`.
 */

import React from "react";
import { Stack } from "expo-router";

export default function RouteDetailLayout() {
  return (
    <Stack
      screenOptions={{
        // Hide the header — the parent gym layout already provides one.
        // Showing a second header would create an awkward double-header UI.
        headerShown: false,
      }}
    />
  );
}
