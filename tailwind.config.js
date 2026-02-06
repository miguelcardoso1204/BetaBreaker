/** @type {import('tailwindcss').Config} */

// tailwind.config.js — Tailwind CSS configuration for NativeWind v4.
// Populated with design tokens extracted from Figma mockups.
// These tokens define the visual language of Beta Breaker:
// colors, typography, spacing, border radii, and shadows.
// NativeWind converts these into React Native StyleSheet values at build time.
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // -- App backgrounds --
        background: "#0A0A0F",
        surface: "#1C1C28",
        "surface-elevated": "#252536",
        border: "#2A2A3C",

        // -- Text hierarchy --
        "text-primary": "#FFFFFF",
        "text-secondary": "#A0A0B8",
        "text-muted": "#6B6B80",

        // -- Brand accent (purple) --
        accent: {
          DEFAULT: "#7C3AED",
          hover: "#6D28D9",
          light: "#8B5CF6",
          glow: "rgba(124, 58, 237, 0.3)",
        },

        // -- Semantic colors --
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        heart: "#EF4444",
        "heart-outline": "#A0A0B8",

        // -- Podium colors (leaderboard) --
        gold: "#FFD700",
        silver: "#C0C0C0",
        bronze: "#CD7F32",

        // -- Climbing style tag colors --
        tag: {
          power: "#EF4444",
          finger: "#F59E0B",
          footwork: "#22C55E",
          dynamic: "#3B82F6",
          core: "#A855F7",
          technique: "#14B8A6",
        },
      },

      fontFamily: {
        // System sans-serif is the default on both iOS (SF Pro) and Android (Roboto).
        // SpaceMono is loaded via expo-font for monospace use (grades, stats).
        sans: ["System"],
        mono: ["SpaceMono"],
      },

      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },

      boxShadow: {
        card: "0 2px 8px rgba(0, 0, 0, 0.3)",
        button: "0 4px 12px rgba(124, 58, 237, 0.4)",
        fab: "0 4px 20px rgba(124, 58, 237, 0.5)",
      },
    },
  },
  plugins: [],
};
