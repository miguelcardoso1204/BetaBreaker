// components/badges/__tests__/ProfileBadges.test.tsx
//
// Unit tests for the ProfileBadges component — displays pinned badges on
// the user's profile screen with an edit button to open the BadgePicker.
//
// ProfileBadges shows a horizontal row of earned badges (resolved from IDs)
// plus empty "slot" placeholders for remaining pin capacity. The edit button
// allows users to manage which badges are pinned.
//
// Test categories:
//   1. Pinned badge rendering — earned badges display as BadgeIcons
//   2. Empty slot rendering — unfilled slots show as dashed placeholders
//   3. Edit button — triggers the onManagePress callback
//   4. Zero badges — graceful handling of empty state

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ProfileBadges } from "../ProfileBadges";

describe("ProfileBadges", () => {
  // Mock badge data matching the UserBadgeWithDef shape — each entry
  // has the user_badge fields plus an embedded badge definition.
  const mockPinnedBadges = [
    {
      user_id: "user-1",
      badge_id: "b1",
      awarded_at: "2026-01-10T00:00:00Z",
      badge: { id: "b1", name: "First V0", icon_key: "badge-v0" },
    },
    {
      user_id: "user-1",
      badge_id: "b2",
      awarded_at: "2026-01-15T00:00:00Z",
      badge: { id: "b2", name: "First Flash", icon_key: "badge-flash" },
    },
  ];

  it("renders pinned badges", () => {
    // Each pinned badge should display with its name visible.
    // The BadgeIcon component renders the name below the icon circle.
    render(
      <ProfileBadges
        pinnedBadges={mockPinnedBadges}
        onManagePress={jest.fn()}
        maxPins={3}
      />
    );

    expect(screen.getByText("First V0")).toBeOnTheScreen();
    expect(screen.getByText("First Flash")).toBeOnTheScreen();
  });

  it("shows empty slots for remaining pin capacity", () => {
    // With 2 pinned badges and a maxPins of 3, there should be 1 empty
    // slot rendered. Empty slots use testID="empty-slot-N" for testing.
    render(
      <ProfileBadges
        pinnedBadges={mockPinnedBadges}
        onManagePress={jest.fn()}
        maxPins={3}
      />
    );

    // 3 max - 2 pinned = 1 empty slot
    expect(screen.getByTestId("empty-slot-0")).toBeOnTheScreen();
    expect(screen.queryByTestId("empty-slot-1")).toBeNull();
  });

  it("edit button calls onManagePress", () => {
    // The edit button triggers the BadgePicker modal on the profile screen.
    const onManagePress = jest.fn();
    render(
      <ProfileBadges
        pinnedBadges={mockPinnedBadges}
        onManagePress={onManagePress}
        maxPins={3}
      />
    );

    fireEvent.press(screen.getByText("Edit"));
    expect(onManagePress).toHaveBeenCalledTimes(1);
  });

  it("handles zero badges gracefully", () => {
    // New users with no earned badges should see all empty slots
    // and no crash or missing elements.
    render(
      <ProfileBadges
        pinnedBadges={[]}
        onManagePress={jest.fn()}
        maxPins={1}
      />
    );

    // 1 max - 0 pinned = 1 empty slot
    expect(screen.getByTestId("empty-slot-0")).toBeOnTheScreen();
  });
});
