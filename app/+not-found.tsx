// app/+not-found.tsx
//
// 404 screen shown when a route doesn't match.
// Uses NativeWind classes and expo-router's Link for navigation.

import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View className="flex-1 items-center justify-center p-5 bg-background">
        <Text className="text-text-primary text-xl font-bold">
          This screen doesn&apos;t exist.
        </Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-accent-light text-sm">
            Go to home screen!
          </Text>
        </Link>
      </View>
    </>
  );
}
