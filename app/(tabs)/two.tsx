// app/(tabs)/two.tsx
//
// Second tab placeholder. Will be replaced with the route browse
// screen in Phase 4.

import { Text, View } from "react-native";

export default function ExploreScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-text-primary text-2xl font-bold">Explore</Text>
      <Text className="text-text-secondary text-base mt-2">
        Route browsing coming soon
      </Text>
    </View>
  );
}
