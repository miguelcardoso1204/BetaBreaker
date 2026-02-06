// constants/Colors.ts — Centralized color tokens for non-NativeWind consumers.
// React Navigation's ThemeProvider and @expo/vector-icons use these.
// For NativeWind components, prefer Tailwind classes (e.g., `bg-accent`).
// These values mirror the design tokens in tailwind.config.js.

const Colors = {
  light: {
    text: "#1A1A2E",
    background: "#F5F5F7",
    tint: "#7C3AED",
    tabIconDefault: "#6B6B80",
    tabIconSelected: "#7C3AED",
    surface: "#FFFFFF",
    border: "#E5E5EA",
  },
  dark: {
    text: "#FFFFFF",
    background: "#0A0A0F",
    tint: "#8B5CF6",
    tabIconDefault: "#6B6B80",
    tabIconSelected: "#8B5CF6",
    surface: "#1C1C28",
    border: "#2A2A3C",
  },
} as const;

export default Colors;
