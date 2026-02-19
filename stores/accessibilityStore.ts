/**
 * Accessibility Store — Color-Aware Mode Preference
 *
 * A Zustand store that holds the user's color-aware mode preference.
 * When enabled, color swatches throughout the app (e.g., on RouteCard)
 * also display the color name as text. This helps color-blind users
 * identify routes by name rather than relying on visual color alone.
 *
 * WHY ZUSTAND?
 * This is ephemeral client-side state — it doesn't need to go to the
 * database. The preference resets on app restart. If we later want
 * persistence, we can add Zustand persist middleware without changing
 * the component API.
 *
 * USAGE:
 * ```ts
 * const colorAwareMode = useAccessibilityStore((s) => s.colorAwareMode);
 * const setColorAwareMode = useAccessibilityStore((s) => s.setColorAwareMode);
 * ```
 */

import { create } from "zustand";

// ── Types ─────────────────────────────────────────────────────────

interface AccessibilityState {
  /** When true, color names are shown as text next to color swatches. */
  colorAwareMode: boolean;

  /** Toggle color-aware mode on or off. */
  setColorAwareMode: (enabled: boolean) => void;
}

// ── Store ─────────────────────────────────────────────────────────

export const useAccessibilityStore = create<AccessibilityState>((set) => ({
  // Default to false — color names are hidden unless the user opts in.
  colorAwareMode: false,

  setColorAwareMode: (enabled: boolean) => {
    set({ colorAwareMode: enabled });
  },
}));
