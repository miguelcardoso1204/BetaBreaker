// components/ui/__tests__/Badge.test.tsx
//
// Unit tests for the Badge component — small status/label pills used
// throughout Beta Breaker for things like "New!" on recently set routes,
// "Verified" on send status, and climbing style tags ("Power", "Footwork").
//
// These tests use @testing-library/react-native, which focuses on
// behavior over implementation. We test that the correct label text
// renders for each variant — we don't inspect NativeWind class names
// or inline styles, because those are implementation details that could
// change without affecting what the user sees.
//
// Test categories:
//   1. Rendering — does the badge show the correct label text?
//   2. Variants — does each semantic variant (default, success, warning,
//      error) and the custom-color "tag" variant render correctly?

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge", () => {
  // -- Basic rendering --

  it("renders label text", () => {
    // The most fundamental test: the badge should display whatever
    // string we pass as the `label` prop.
    render(<Badge label="New!" />);
    expect(screen.getByText("New!")).toBeOnTheScreen();
  });

  // -- Variant rendering --
  // Each variant maps to a different NativeWind background color class.
  // We verify each one renders without crashing and shows the label.

  it("renders default variant", () => {
    // When no `variant` prop is passed, the badge should use the
    // "default" variant (accent purple) — the fallback behavior.
    render(<Badge label="Default" />);
    expect(screen.getByText("Default")).toBeOnTheScreen();
  });

  it("renders success variant", () => {
    // "success" = green background. Used for positive statuses like
    // "Verified" on a confirmed send.
    render(<Badge label="Verified" variant="success" />);
    expect(screen.getByText("Verified")).toBeOnTheScreen();
  });

  it("renders warning variant", () => {
    // "warning" = amber/orange background. Used for attention-drawing
    // labels like "New!" on recently set routes.
    render(<Badge label="New!" variant="warning" />);
    expect(screen.getByText("New!")).toBeOnTheScreen();
  });

  it("renders error variant", () => {
    // "error" = red background. Used for negative statuses like
    // "Failed" on a sync error or "Expired" on an old route.
    render(<Badge label="Failed" variant="error" />);
    expect(screen.getByText("Failed")).toBeOnTheScreen();
  });

  it("renders tag variant with custom color", () => {
    // The "tag" variant is special — instead of using a predefined
    // NativeWind class, it accepts a `color` prop for the background.
    // This lets each climbing style tag (Power, Footwork, Endurance)
    // have its own color from the design system's tag palette.
    render(<Badge label="Power" variant="tag" color="#EF4444" />);
    expect(screen.getByText("Power")).toBeOnTheScreen();
  });
});
