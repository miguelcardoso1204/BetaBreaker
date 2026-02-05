// metro.config.js — Metro bundler configuration for Expo + NativeWind v4.
// Metro is React Native's JavaScript bundler (similar to webpack for web).
// We start with Expo's default Metro config, then wrap it with NativeWind's
// `withNativeWind()` helper. This adds a CSS processing pipeline that
// compiles Tailwind utility classes from global.css into React Native
// StyleSheet objects at bundle time.
const { getDefaultConfig } = require("@expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Get Expo's default Metro configuration for this project directory
const config = getDefaultConfig(__dirname);

// Wrap the config with NativeWind, pointing it at our global.css entry file.
// This tells NativeWind/Metro where to find the Tailwind directives so it
// can process and inject the compiled styles into the bundle.
module.exports = withNativeWind(config, { input: "./global.css" });
