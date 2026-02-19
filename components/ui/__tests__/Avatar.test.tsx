// components/ui/__tests__/Avatar.test.tsx
//
// Unit tests for the Avatar component — a circular image or initials
// fallback used to represent users throughout the app.
//
// Avatars appear in:
//   - Leaderboard rows (showing each climber's photo or initials)
//   - Video submission lists (who submitted beta for a route)
//   - Profile screen header (large avatar at the top)
//   - Activity feed entries (who logged what)
//
// WHY MOCK expo-image?
// expo-image is a native module that provides optimized image loading
// with caching, progressive rendering, and format support. In a Jest
// test environment there's no native runtime, so we replace Image with
// a simple React Native View. This lets us test the component's logic
// (initials extraction, size props, conditional rendering) without
// needing a real image decoder.
//
// Test categories:
//   1. Image rendering — does the component show when a URI is provided?
//   2. Initials fallback — correct initials for multi-word, single-word names
//   3. Size variants — sm, md, lg all render without errors

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Avatar } from "../Avatar";

// Mock expo-image since there's no native image runtime in Jest.
// We replace the Image component with a plain View that passes through
// all props (including testID and accessibilityLabel). This is the
// recommended approach from the expo-image docs for unit testing.
jest.mock("expo-image", () => ({
  Image: (props: any) => {
    const { View } = require("react-native");
    return <View {...props} />;
  },
}));

describe("Avatar", () => {
  // --- Image rendering ---

  it("renders with image URI", () => {
    // When a `uri` prop is provided, the Avatar should display the
    // user's photo. We verify the component renders successfully
    // by finding it via testID. The actual image loading is handled
    // by expo-image (mocked here) — we just need to confirm the
    // component tree is correct.
    render(
      <Avatar uri="https://example.com/photo.jpg" name="Alex" testID="avatar" />
    );
    expect(screen.getByTestId("avatar")).toBeOnTheScreen();
  });

  // --- Initials fallback ---

  it("shows initials fallback when no URI", () => {
    // When there's no photo, the Avatar should show the user's initials
    // on a colored background. For multi-word names, we take the first
    // letter of the first name and the first letter of the last name.
    // "Alex Honnold" → "AH"
    render(<Avatar name="Alex Honnold" testID="avatar" />);
    expect(screen.getByText("AH")).toBeOnTheScreen();
  });

  it("shows single initial for single name", () => {
    // Some users might have a single-word display name (e.g., "Alex").
    // In that case, we show just the first letter: "A".
    render(<Avatar name="Alex" testID="avatar" />);
    expect(screen.getByText("A")).toBeOnTheScreen();
  });

  // --- Accessibility ---

  it("image mode is findable by accessibilityLabel", () => {
    // The outer View now has accessibilityLabel (moved from the inner Image)
    // so screen readers announce "Alex's avatar" in image mode.
    render(
      <Avatar uri="https://example.com/photo.jpg" name="Alex" testID="avatar" />
    );
    expect(screen.getByLabelText("Alex's avatar")).toBeOnTheScreen();
  });

  it("initials mode is findable by accessibilityLabel", () => {
    // Previously, accessibilityLabel was on the inner Image — initials
    // mode had no label at all. Now it's on the outer View, covering both.
    render(<Avatar name="Alex" testID="avatar" />);
    expect(screen.getByLabelText("Alex's avatar")).toBeOnTheScreen();
  });

  // --- Size variants ---

  it("renders small size", () => {
    // The "sm" size (32x32) is used in compact layouts like
    // leaderboard rows where space is limited.
    render(<Avatar name="Alex" size="sm" testID="avatar" />);
    expect(screen.getByTestId("avatar")).toBeOnTheScreen();
  });

  it("renders large size", () => {
    // The "lg" size (64x64) is used in the profile header and
    // other prominent display contexts.
    render(<Avatar name="Alex" size="lg" testID="avatar" />);
    expect(screen.getByTestId("avatar")).toBeOnTheScreen();
  });
});
