/** @type {import('tailwindcss').Config} */

// tailwind.config.js — Tailwind CSS configuration for NativeWind v4.
// The `content` array tells Tailwind which files to scan for class names,
// so it can tree-shake unused styles from the final bundle.
// The `nativewind/preset` is required to make Tailwind output compatible
// with React Native's styling system instead of web CSS.
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
