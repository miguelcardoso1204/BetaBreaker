// app/settings/_layout.tsx
//
// Stack navigator for the settings sub-screens. Each screen manages its
// own header (back button + title), so we disable the Stack-level header.
// This is the same pattern used by (tabs)/_layout.tsx — headerShown: false
// gives each screen full control over its top area.

import { Stack } from "expo-router";

export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
