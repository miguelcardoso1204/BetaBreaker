// components/ui/__tests__/BadgeIcon.test.tsx
//
// Unit tests for the BadgeIcon component — a circular achievement display
// that shows earned badges on the profile screen and badge gallery.
//
// BadgeIcon is distinct from the existing Badge component (a label pill):
//   - Badge: inline metadata label (e.g., "V5", "Flash") — used in RouteCard
//   - BadgeIcon: circular achievement display with icon placeholder — used in profile
//
// The component uses text initials as a placeholder for actual icon assets
// (which aren't part of the project yet). This follows the same pattern as
// Avatar's initials fallback — the visual can be swapped later without
// changing the component API.
//
// Test categories:
//   1. Name rendering — badge name is visible
//   2. Earned styling — default state shows accent background
//   3. Unearned styling — dimmed appearance with reduced opacity
//   4. Size variants — sm and md render without errors

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { BadgeIcon } from "../BadgeIcon";

describe("BadgeIcon", () => {
  it("renders badge name", () => {
    // The badge name should always be visible below the icon circle,
    // so users can identify the achievement at a glance.
    render(<BadgeIcon iconKey="badge-v0" name="First V0" />);
    expect(screen.getByText("First V0")).toBeOnTheScreen();
  });

  it("shows earned styling by default", () => {
    // When earned is true (the default), the badge should display with
    // full opacity and accent background. We check via testID since
    // NativeWind classes don't affect test queries directly.
    render(
      <BadgeIcon iconKey="badge-v0" name="First V0" testID="badge-icon" />
    );
    const container = screen.getByTestId("badge-icon");
    expect(container).toBeOnTheScreen();
    // The icon circle should have full opacity (no dimming)
    expect(container).not.toHaveStyle({ opacity: 0.4 });
  });

  it("shows dimmed styling when earned=false", () => {
    // Unearned badges appear in the badge gallery to show what's achievable.
    // They use reduced opacity to visually distinguish from earned badges.
    render(
      <BadgeIcon
        iconKey="badge-v0"
        name="First V0"
        earned={false}
        testID="badge-icon"
      />
    );
    const container = screen.getByTestId("badge-icon");
    expect(container).toHaveStyle({ opacity: 0.4 });
  });

  it("is findable by accessibilityLabel matching the badge name", () => {
    // The outer View has accessibilityLabel={name} so screen readers
    // announce badge names (e.g., "First V0") when navigating the gallery.
    render(
      <BadgeIcon iconKey="badge-v0" name="First V0" testID="badge-icon" />
    );
    expect(screen.getByLabelText("First V0")).toBeOnTheScreen();
  });

  it("supports size variants", () => {
    // The "sm" size is used in compact layouts (e.g., pinned badges on
    // profile header). The "md" size is used in the full badge gallery.
    const { unmount } = render(
      <BadgeIcon iconKey="badge-v0" name="First V0" size="sm" testID="badge-sm" />
    );
    expect(screen.getByTestId("badge-sm")).toBeOnTheScreen();
    unmount();

    render(
      <BadgeIcon iconKey="badge-v0" name="First V0" size="md" testID="badge-md" />
    );
    expect(screen.getByTestId("badge-md")).toBeOnTheScreen();
  });
});
