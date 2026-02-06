// components/ui/__tests__/Divider.test.tsx
//
// Unit tests for the Divider component — a thin horizontal line used to
// separate content sections throughout the app.
//
// In the Beta Breaker mockups, dividers appear between:
//   - Activity feed entries on the home screen
//   - Video submission rows in the route detail view
//   - Settings options in the profile screen
//
// These tests use @testing-library/react-native (RNTL). The philosophy
// is to test **behavior** (does it render? can we find it by testID?)
// rather than **implementation** (what CSS classes does it have?).
//
// Test categories:
//   1. Basic rendering — can we render the component and find it?
//   2. Custom styling — does the `className` prop work without errors?

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Divider } from "../Divider";

describe("Divider", () => {
  // --- Basic rendering ---

  it("renders without crashing", () => {
    // The simplest smoke test: render the component with a testID
    // and verify it appears in the component tree. If the component
    // has a syntax error or missing import, this test catches it.
    render(<Divider testID="divider" />);
    expect(screen.getByTestId("divider")).toBeOnTheScreen();
  });

  // --- Custom styling ---

  it("renders with custom className", () => {
    // NativeWind lets us pass extra Tailwind classes via `className`.
    // This test verifies the component doesn't crash when we add
    // custom spacing classes like "my-8" (margin-top and margin-bottom).
    // We don't assert the actual style — that's NativeWind's job.
    render(<Divider testID="divider" className="my-8" />);
    expect(screen.getByTestId("divider")).toBeOnTheScreen();
  });
});
