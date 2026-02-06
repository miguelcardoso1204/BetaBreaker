// app/start-session.tsx
//
// Start Session modal screen placeholder. This route lives OUTSIDE the
// (tabs) group, so tapping the FAB opens it as a modal on top of the
// current tab. Will be replaced with the session timer, route selector,
// and quick-log interface in Phase 5.
//
// WHY OUTSIDE (TABS)?
// Modal screens shouldn't show the tab bar. By placing this file in
// app/ (not app/(tabs)/), Expo Router renders it without the tab
// navigator wrapper, so no tab bar appears. The user can dismiss the
// modal to return to whichever tab they were on.

import { Text, View } from "react-native";

export default function StartSessionScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-text-primary text-2xl font-bold">
        Start Session
      </Text>
      <Text className="text-text-secondary text-base mt-2">
        Session logging coming soon
      </Text>
    </View>
  );
}
