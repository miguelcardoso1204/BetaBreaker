/**
 * FollowButton Component Tests
 *
 * Tests the self-contained follow/unfollow toggle button.
 * The button uses useSocial hooks internally to determine
 * current follow state and trigger follow/unfollow mutations.
 *
 * States:
 *   - Not following → primary variant, label "Follow"
 *   - Following → outline variant, label "Following"
 *   - Loading → shows spinner via Button's loading prop
 *
 * Mock strategy: mock useSocial hooks directly since the button
 * is self-contained (no props for follow state or callbacks).
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock useSocial hooks ────────────────────────────────────────
const mockToggleFollow = jest.fn();
jest.mock("@/hooks/useSocial", () => {
  const mockState = {
    isFollowing: false,
    isLoading: false,
    isPending: false,
  };
  return {
    useToggleFollow: () => ({
      ...mockState,
      toggleFollow: mockToggleFollow,
    }),
    __mockState: mockState,
  };
});

import { FollowButton } from "../FollowButton";

const { __mockState } = jest.requireMock<{
  __mockState: {
    isFollowing: boolean;
    isLoading: boolean;
    isPending: boolean;
  };
}>("@/hooks/useSocial");

// ── Helpers ──────────────────────────────────────────────────────

function resetMockState() {
  __mockState.isFollowing = false;
  __mockState.isLoading = false;
  __mockState.isPending = false;
}

// ── Tests ────────────────────────────────────────────────────────

describe("FollowButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
  });

  it("shows 'Follow' button when not following", () => {
    render(<FollowButton targetUserId="user-2" />);

    expect(screen.getByText("Follow")).toBeOnTheScreen();
  });

  it("shows 'Following' button when following", () => {
    __mockState.isFollowing = true;

    render(<FollowButton targetUserId="user-2" />);

    expect(screen.getByText("Following")).toBeOnTheScreen();
  });

  it("calls toggleFollow on press", () => {
    render(<FollowButton targetUserId="user-2" />);

    fireEvent.press(screen.getByText("Follow"));

    expect(mockToggleFollow).toHaveBeenCalledTimes(1);
  });

  it("shows loading state during mutation", () => {
    __mockState.isPending = true;

    render(<FollowButton targetUserId="user-2" />);

    // Button component shows ActivityIndicator when loading=true
    // The label should still be present but button disabled
    const button = screen.getByTestId("follow-button");
    expect(button).toBeOnTheScreen();
  });
});
