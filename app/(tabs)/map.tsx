// app/(tabs)/map.tsx
//
// Map tab placeholder. Will be replaced with a gym map/browse screen
// showing nearby gyms and their routes in a later phase.

import { Text, View } from "react-native";

export default function MapScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-text-primary text-2xl font-bold">Map</Text>
      <Text className="text-text-secondary text-base mt-2">
        Map browse coming soon
      </Text>
    </View>
  );
}
