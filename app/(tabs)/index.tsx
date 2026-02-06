// app/(tabs)/index.tsx
//
// Home tab placeholder. Will be replaced with the activity feed
// in Phase 4+. For now, shows a centered title to verify the
// NativeWind design system is working.

import { Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-text-primary text-2xl font-bold">
        Beta Breaker
      </Text>
      <Text className="text-text-secondary text-base mt-2">
        Home screen coming soon
      </Text>
    </View>
  );
}
