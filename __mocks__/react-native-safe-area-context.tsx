/**
 * Manual Jest mock for react-native-safe-area-context.
 *
 * Components like SafeAreaView and the useSafeAreaInsets hook require a
 * SafeAreaProvider ancestor with native module bindings. In tests there's
 * no native runtime, so we provide stub implementations that return zero
 * insets and pass children through unchanged.
 *
 * Jest auto-discovers files in __mocks__/ that match the package name,
 * so every `import { SafeAreaView } from "react-native-safe-area-context"`
 * in tests will resolve to this file automatically.
 */

import React from "react";
import { View } from "react-native";

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const MOCK_FRAME = { x: 0, y: 0, width: 320, height: 640 };
const MOCK_METRICS = { frame: MOCK_FRAME, insets: ZERO_INSETS };

// SafeAreaProvider — renders children without any native bindings.
export function SafeAreaProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// SafeAreaView — renders as a plain View (passes all props through).
export function SafeAreaView(props: any) {
  return <View {...props} />;
}

// Hook stubs — return zero insets / default frame so components
// using useSafeAreaInsets() don't crash in tests.
export function useSafeAreaInsets() {
  return ZERO_INSETS;
}

export function useSafeAreaFrame() {
  return MOCK_FRAME;
}

// Constants used by some third-party components
export const initialWindowMetrics = MOCK_METRICS;

// Re-export SafeAreaInsetsContext for libraries that access it directly
export const SafeAreaInsetsContext = {
  Consumer: ({ children }: any) => children(ZERO_INSETS),
  Provider: ({ children }: any) => children,
};

export const SafeAreaFrameContext = {
  Consumer: ({ children }: any) => children(MOCK_FRAME),
  Provider: ({ children }: any) => children,
};
