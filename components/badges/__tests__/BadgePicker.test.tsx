// components/badges/__tests__/BadgePicker.test.tsx
//
// Unit tests for the BadgePicker modal — a selection UI for choosing
// which earned badges to pin to the user's profile.
//
// BadgePicker shows all earned badges in a grid. Tapping a badge toggles
// its pinned state. The component enforces maxPins in the UI (disables
// further selections when the limit is reached). "Save" commits the
// selection via the onSave callback.
//
// Test categories:
//   1. Rendering — all earned badges appear in the grid
//   2. Pre-selection — previously pinned badges show as checked
//   3. Toggle — tapping a badge toggles its selected state
//   4. Limit enforcement — cannot select more than maxPins
//   5. Save — Save button calls onSave with selected badge IDs

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { BadgePicker } from "../BadgePicker";

// Mock earned badges — the full set of badges the user has earned
const mockEarnedBadges = [
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
  {
    user_id: "user-1",
    badge_id: "b3",
    awarded_at: "2026-01-20T00:00:00Z",
    badge: { id: "b3", name: "First Send", icon_key: "badge-first-send" },
  },
];

describe("BadgePicker", () => {
  it("renders all earned badges", () => {
    // Every earned badge should appear in the picker grid so users
    // can see their full collection and choose which to pin.
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={[]}
        maxPins={3}
        onSave={jest.fn()}
        onClose={jest.fn()}
        visible={true}
      />
    );

    expect(screen.getByText("First V0")).toBeOnTheScreen();
    expect(screen.getByText("First Flash")).toBeOnTheScreen();
    expect(screen.getByText("First Send")).toBeOnTheScreen();
  });

  it("pre-selected badges show as checked", () => {
    // Badges that are already pinned should have a visual checkmark
    // indicator. We test this by looking for the checkmark testID.
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={["b1"]}
        maxPins={3}
        onSave={jest.fn()}
        onClose={jest.fn()}
        visible={true}
      />
    );

    // b1 is pre-selected — should have a check indicator
    expect(screen.getByTestId("check-b1")).toBeOnTheScreen();
    // b2 is not selected — no check indicator
    expect(screen.queryByTestId("check-b2")).toBeNull();
  });

  it("tapping badge toggles selection", () => {
    // Tapping an unselected badge should select it (show check).
    // Tapping a selected badge should deselect it (hide check).
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={[]}
        maxPins={3}
        onSave={jest.fn()}
        onClose={jest.fn()}
        visible={true}
      />
    );

    // Initially, b1 is not selected
    expect(screen.queryByTestId("check-b1")).toBeNull();

    // Tap to select b1
    fireEvent.press(screen.getByTestId("picker-item-b1"));
    expect(screen.getByTestId("check-b1")).toBeOnTheScreen();

    // Tap again to deselect b1
    fireEvent.press(screen.getByTestId("picker-item-b1"));
    expect(screen.queryByTestId("check-b1")).toBeNull();
  });

  it("cannot select more than maxPins", () => {
    // When maxPins badges are already selected, tapping another badge
    // should NOT add it to the selection — enforcing the tier limit in UI.
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={["b1"]}
        maxPins={1}
        onSave={jest.fn()}
        onClose={jest.fn()}
        visible={true}
      />
    );

    // b1 is selected (at maxPins=1 limit)
    expect(screen.getByTestId("check-b1")).toBeOnTheScreen();

    // Try to select b2 — should be blocked by maxPins
    fireEvent.press(screen.getByTestId("picker-item-b2"));
    expect(screen.queryByTestId("check-b2")).toBeNull();

    // b1 is still selected (unchanged)
    expect(screen.getByTestId("check-b1")).toBeOnTheScreen();
  });

  it("save button calls onSave with selected IDs", () => {
    // The Save button commits the current selection and calls the
    // onSave callback with the array of selected badge IDs.
    const onSave = jest.fn();
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={["b1"]}
        maxPins={3}
        onSave={onSave}
        onClose={jest.fn()}
        visible={true}
      />
    );

    // Select b2 in addition to pre-selected b1
    fireEvent.press(screen.getByTestId("picker-item-b2"));

    // Press Save
    fireEvent.press(screen.getByText("Save"));

    // onSave should receive both b1 (pre-selected) and b2 (newly selected)
    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining(["b1", "b2"])
    );
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  // ── Accessibility ────────────────────────────────────────────────

  it("badge items have checkbox role with checked state", () => {
    // Each badge in the picker acts as a toggle — screen readers should
    // announce it as a checkbox with its current selected state.
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={["b1"]}
        maxPins={3}
        onSave={jest.fn()}
        onClose={jest.fn()}
        visible={true}
      />
    );

    // b1 is pre-selected — should be announced as checked
    const b1 = screen.getByTestId("picker-item-b1");
    expect(b1.props.accessibilityRole).toBe("checkbox");
    expect(b1.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true })
    );

    // b2 is not selected — should be announced as unchecked
    const b2 = screen.getByTestId("picker-item-b2");
    expect(b2.props.accessibilityRole).toBe("checkbox");
    expect(b2.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false })
    );
  });

  it("badge items have accessibilityLabel with badge name", () => {
    // Screen readers announce the badge name so users know which badge
    // they're toggling without seeing the icon.
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={[]}
        maxPins={3}
        onSave={jest.fn()}
        onClose={jest.fn()}
        visible={true}
      />
    );

    const b1 = screen.getByTestId("picker-item-b1");
    expect(b1.props.accessibilityLabel).toBe("First V0");
  });

  it("close button has accessibilityRole button", () => {
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={[]}
        maxPins={3}
        onSave={jest.fn()}
        onClose={jest.fn()}
        visible={true}
      />
    );

    // Close button should be findable by role + label
    const closeButton = screen.getByRole("button", { name: /close/i });
    expect(closeButton).toBeTruthy();
  });

  it("save button has accessibilityRole button", () => {
    render(
      <BadgePicker
        earnedBadges={mockEarnedBadges}
        pinnedIds={[]}
        maxPins={3}
        onSave={jest.fn()}
        onClose={jest.fn()}
        visible={true}
      />
    );

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeTruthy();
  });
});
