// app/modal.tsx
//
// Modal screen placeholder. Will be used for quick-log or
// confirmation dialogs in later phases.

import { StatusBar } from "expo-status-bar";
import { Platform, Text, View } from "react-native";

export default function ModalScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-text-primary text-xl font-bold">Modal</Text>
      <StatusBar style={Platform.OS === "ios" ? "light" : "auto"} />
    </View>
  );
}
