// metro.config.js — Metro bundler configuration for Expo + NativeWind v4 + Sentry.
// Metro is React Native's JavaScript bundler (similar to webpack for web).
// We use Sentry's Expo-specific config (instead of the bare RN `withSentryConfig`)
// because it injects debug IDs via Expo's `unstable_beforeAssetSerializationPlugins`
// rather than overriding the Metro serializer — which breaks in Expo/RN 0.81+.
// NativeWind wraps last to add CSS processing (it doesn't touch the serializer).
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

// getSentryExpoConfig replaces getDefaultConfig — it extends Expo's default
// Metro config with Sentry's debug ID injection and component annotation.
const config = getSentryExpoConfig(__dirname, {
  annotateReactComponents: true,
});

// Apply NativeWind — compiles Tailwind utility classes from global.css into
// React Native StyleSheet objects at bundle time. Must be the outermost wrapper.
module.exports = withNativeWind(config, { input: "./global.css" });
