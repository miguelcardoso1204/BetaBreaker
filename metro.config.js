// metro.config.js — Metro bundler configuration for Expo + NativeWind v4 + Sentry.
// Metro is React Native's JavaScript bundler (similar to webpack for web).
// We start with Expo's default Metro config, wrap it with NativeWind's
// `withNativeWind()` helper for CSS processing, then wrap with Sentry's
// `withSentryConfig()` for source map debug IDs and component annotation.
const { getDefaultConfig } = require("@expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { withSentryConfig } = require("@sentry/react-native/metro");

// Get Expo's default Metro configuration for this project directory
const config = getDefaultConfig(__dirname);

// Compose the Metro config wrappers:
// 1. withNativeWind — compiles Tailwind utility classes from global.css into
//    React Native StyleSheet objects at bundle time.
// 2. withSentryConfig — adds debug IDs to bundles/source maps (so Sentry can
//    link errors to the correct source code) and optionally annotates React
//    components with their display names for clearer Sentry breadcrumbs.
//    annotateReactComponents replaces the need for a Babel plugin — it wires
//    component name tracking through the Metro transformer.
module.exports = withSentryConfig(
  withNativeWind(config, { input: "./global.css" }),
  { annotateReactComponents: true }
);
