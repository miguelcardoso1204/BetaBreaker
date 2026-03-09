// metro.config.js — Metro bundler configuration for Expo + NativeWind v4 + Sentry.
// Metro is React Native's JavaScript bundler (similar to webpack for web).
// We start with Expo's default Metro config, wrap it with NativeWind's
// `withNativeWind()` helper for CSS processing, then optionally wrap with
// Sentry's `withSentryConfig()` for source map debug IDs and component annotation.
const { getDefaultConfig } = require("@expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Get Expo's default Metro configuration for this project directory
const config = getDefaultConfig(__dirname);

// Apply NativeWind — compiles Tailwind utility classes from global.css into
// React Native StyleSheet objects at bundle time.
const nativeWindConfig = withNativeWind(config, { input: "./global.css" });

// Only apply Sentry's Metro wrapper when a DSN is configured.
// Without a DSN, Sentry's serializer fails trying to inject debug IDs
// into the bundle — this avoids that error during local development.
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  const { withSentryConfig } = require("@sentry/react-native/metro");
  // withSentryConfig adds debug IDs to bundles/source maps (so Sentry can
  // link errors to the correct source code) and annotates React components
  // with their display names for clearer Sentry breadcrumbs.
  module.exports = withSentryConfig(nativeWindConfig, {
    annotateReactComponents: true,
  });
} else {
  module.exports = nativeWindConfig;
}
