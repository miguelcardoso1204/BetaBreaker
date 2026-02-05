// babel.config.js — Babel transpiler configuration for Expo + NativeWind.
// `babel-preset-expo` is Expo's default preset that handles JSX, TypeScript,
// module resolution, and React Native-specific transforms.
// `nativewind/babel` is the NativeWind v4 preset that transforms
// `className` props on components into React Native StyleSheet calls
// during the Babel compilation step.
module.exports = function (api) {
  // Caching based on NODE_ENV improves build performance by avoiding
  // re-evaluation of this config on every file transform.
  api.cache(true);
  return {
    presets: [
      "babel-preset-expo",
      "nativewind/babel",
    ],
  };
};
