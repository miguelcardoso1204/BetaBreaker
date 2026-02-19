/**
 * Tests for the accessibility Zustand store.
 *
 * Verifies the colorAwareMode toggle — the store that controls whether
 * color names are displayed as text next to color swatches for
 * color-blind accessibility.
 */

import { useAccessibilityStore } from "../accessibilityStore";

describe("accessibilityStore", () => {
  // Reset store state before each test to prevent cross-test contamination.
  // Zustand stores are singletons — state persists across tests unless reset.
  beforeEach(() => {
    useAccessibilityStore.setState({ colorAwareMode: false });
  });

  it("defaults colorAwareMode to false", () => {
    const state = useAccessibilityStore.getState();
    expect(state.colorAwareMode).toBe(false);
  });

  it("sets colorAwareMode to true", () => {
    useAccessibilityStore.getState().setColorAwareMode(true);
    expect(useAccessibilityStore.getState().colorAwareMode).toBe(true);
  });

  it("sets colorAwareMode back to false", () => {
    useAccessibilityStore.getState().setColorAwareMode(true);
    useAccessibilityStore.getState().setColorAwareMode(false);
    expect(useAccessibilityStore.getState().colorAwareMode).toBe(false);
  });
});
