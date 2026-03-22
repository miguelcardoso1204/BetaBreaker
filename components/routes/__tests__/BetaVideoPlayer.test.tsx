/**
 * BetaVideoPlayer Tests — Accordion Video Item (Step 12.2)
 *
 * Tests the accordion-style video component. Each video is a compact info row
 * that expands to show the video player when tapped. Only one video can be
 * expanded at a time (managed by the parent).
 *
 * COLLAPSED: Info row with avatar, name, date, action buttons, ChevronDown.
 * EXPANDED:  Info row (ChevronUp) + video area (thumbnail → loading → playing).
 *
 * MOCK STRATEGY:
 * - expo-video: mock useVideoPlayer (returns a fake player with play/pause)
 *   and VideoView (renders as a View with testID for assertions)
 * - expo: mock useEvent to return controllable status
 * - lucide-react-native: mock icon components as simple Views
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Track player.play() calls to verify playback starts on tap
const mockPlay = jest.fn();
const mockPause = jest.fn();

// Controllable player status — tests can change this to simulate
// different playback states (idle, loading, readyToPlay, error)
let mockPlayerStatus = "idle";

// Mock expo-video — useVideoPlayer returns a fake player object,
// VideoView renders as a simple View so we can assert its presence.
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  return {
    useVideoPlayer: (source: string | null, setup?: (player: any) => void) => {
      // Return null when source is null (player not yet initialized)
      if (source === null) return null;
      const player = {
        play: mockPlay,
        pause: mockPause,
        status: mockPlayerStatus,
        playing: false,
      };
      // Call the setup callback just like the real hook does — this is
      // how the component auto-plays on activation (calls player.play())
      if (setup) setup(player);
      return player;
    },
    VideoView: (props: any) => (
      <View
        testID="video-view"
        {...props}
        // Expose key props as accessibilityHint so tests can verify them
        accessibilityHint={JSON.stringify({
          nativeControls: props.nativeControls,
          allowsFullscreen: props.allowsFullscreen,
          contentFit: props.contentFit,
        })}
      />
    ),
  };
});

// Mock expo's useEvent hook — returns the current player status.
// Tests control the status via the mockPlayerStatus variable.
jest.mock("expo", () => ({
  useEvent: (_player: any, _event: string, initial: any) => {
    // Return the current mock status, mimicking what useEvent would
    // return after a statusChange event fires
    return { status: mockPlayerStatus, ...initial };
  },
}));

// Mock lucide-react-native — replace SVG icons with simple Views.
// Each icon gets a testID so we can verify the right icons appear.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Play: (props: any) => <View testID="icon-play" {...props} />,
    AlertCircle: (props: any) => (
      <View testID="icon-alert-circle" {...props} />
    ),
    Video: (props: any) => <View testID="icon-video" {...props} />,
    Trash2: (props: any) => <View testID="icon-trash" {...props} />,
    Heart: (props: any) => <View testID="icon-heart" {...props} />,
    Flag: (props: any) => <View testID="icon-flag" {...props} />,
    ChevronDown: (props: any) => <View testID="icon-chevron-down" {...props} />,
    ChevronUp: (props: any) => <View testID="icon-chevron-up" {...props} />,
  };
});

// Mock expo-image — used by the Avatar component rendered inside
// BetaVideoPlayer for the uploader's profile picture.
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

// Import the component AFTER mocks are set up so it uses the mocked modules
import { BetaVideoPlayer } from "../BetaVideoPlayer";

// ── Fixtures ─────────────────────────────────────────────────────

/** Default props matching a typical collapsed beta video */
const defaultProps = {
  url: "https://storage.example.com/videos/beta-1.mp4",
  uploaderName: "Alex Honnold",
  uploaderAvatarUrl: "https://example.com/alex.jpg",
  uploadDate: "2/12/2026",
  isOwner: false,
  onDelete: jest.fn(),
  likesCount: 0,
  isLiked: false,
  onLike: jest.fn(),
  isExpanded: false,
  onToggleExpand: jest.fn(),
};

// ── Tests ────────────────────────────────────────────────────────

describe("BetaVideoPlayer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to idle status before each test
    mockPlayerStatus = "idle";
  });

  // ── Collapsed state (default) ────────────────────────────────

  it("renders info row with uploader name and date when collapsed", () => {
    // The collapsed state should show the info row with all metadata
    // visible, so users can identify the video without expanding it.
    render(<BetaVideoPlayer {...defaultProps} />);

    expect(screen.getByText("Alex Honnold")).toBeOnTheScreen();
    expect(screen.getByText("2/12/2026")).toBeOnTheScreen();
    expect(screen.getByTestId("uploader-avatar")).toBeOnTheScreen();
  });

  it("hides video area when collapsed", () => {
    // When collapsed, no video-related UI should be rendered — no
    // thumbnail, no VideoView, no loading spinner. This is the key
    // space-saving benefit of the accordion pattern.
    render(<BetaVideoPlayer {...defaultProps} isExpanded={false} />);

    expect(screen.queryByTestId("video-thumbnail")).toBeNull();
    expect(screen.queryByTestId("video-view")).toBeNull();
    expect(screen.queryByTestId("video-loading")).toBeNull();
    expect(screen.queryByTestId("icon-play")).toBeNull();
  });

  it("shows ChevronDown icon when collapsed", () => {
    // The chevron direction signals the expand/collapse state.
    // Down = "tap to expand", Up = "tap to collapse".
    render(<BetaVideoPlayer {...defaultProps} isExpanded={false} />);

    expect(screen.getByTestId("icon-chevron-down")).toBeOnTheScreen();
    expect(screen.queryByTestId("icon-chevron-up")).toBeNull();
  });

  it("calls onToggleExpand when info row is tapped", () => {
    // Tapping the info row should notify the parent to toggle
    // this item's expanded state (the parent manages which item
    // is expanded for accordion behavior).
    const onToggleExpand = jest.fn();
    render(<BetaVideoPlayer {...defaultProps} onToggleExpand={onToggleExpand} />);

    fireEvent.press(screen.getByTestId("video-info-row"));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  // ── Expanded state ───────────────────────────────────────────

  it("shows ChevronUp icon when expanded", () => {
    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);

    expect(screen.getByTestId("icon-chevron-up")).toBeOnTheScreen();
    expect(screen.queryByTestId("icon-chevron-down")).toBeNull();
  });

  it("renders thumbnail state with play button when expanded", () => {
    // When expanded, the video area appears starting with a thumbnail
    // placeholder + Play icon. The actual player isn't created until
    // the user taps the thumbnail (lazy initialization).
    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);

    expect(screen.getByTestId("icon-play")).toBeOnTheScreen();
    expect(screen.getByTestId("video-thumbnail")).toBeOnTheScreen();
    expect(screen.queryByTestId("video-view")).toBeNull();
  });

  it("starts playback when thumbnail is tapped", () => {
    // Tapping the thumbnail should activate the player and call play().
    mockPlayerStatus = "readyToPlay";

    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);

    fireEvent.press(screen.getByTestId("video-thumbnail"));

    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("video-view")).toBeOnTheScreen();
  });

  // ── VideoView configuration ──────────────────────────────────

  it("renders VideoView with native controls enabled", () => {
    mockPlayerStatus = "readyToPlay";

    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    const videoView = screen.getByTestId("video-view");
    const hint = JSON.parse(videoView.props.accessibilityHint);
    expect(hint.nativeControls).toBe(true);
  });

  it("renders VideoView with fullscreen allowed", () => {
    mockPlayerStatus = "readyToPlay";

    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    const videoView = screen.getByTestId("video-view");
    const hint = JSON.parse(videoView.props.accessibilityHint);
    expect(hint.allowsFullscreen).toBe(true);
  });

  // ── Error handling ───────────────────────────────────────────

  it("shows error fallback when player status is error", () => {
    mockPlayerStatus = "error";

    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    expect(screen.getByText(/failed to load/i)).toBeOnTheScreen();
    expect(screen.getByText(/tap to retry/i)).toBeOnTheScreen();
  });

  // ── Loading state ────────────────────────────────────────────

  it("shows loading indicator when player is loading", () => {
    mockPlayerStatus = "loading";

    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    expect(screen.getByTestId("video-loading")).toBeOnTheScreen();
  });

  // ── Delete button (ownership) ─────────────────────────────────

  it("shows delete button when isOwner is true", () => {
    const onDelete = jest.fn();
    render(
      <BetaVideoPlayer {...defaultProps} isOwner={true} onDelete={onDelete} />
    );

    const deleteButton = screen.getByTestId("delete-video-button");
    expect(deleteButton).toBeOnTheScreen();

    fireEvent.press(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("hides delete button when isOwner is false", () => {
    render(<BetaVideoPlayer {...defaultProps} isOwner={false} />);

    expect(screen.queryByTestId("delete-video-button")).toBeNull();
  });

  it("delete button does not trigger onToggleExpand", () => {
    // Nested Pressables in React Native don't bubble, so tapping
    // delete should only call onDelete, not toggle the accordion.
    const onToggleExpand = jest.fn();
    const onDelete = jest.fn();
    render(
      <BetaVideoPlayer
        {...defaultProps}
        isOwner={true}
        onDelete={onDelete}
        onToggleExpand={onToggleExpand}
      />
    );

    fireEvent.press(screen.getByTestId("delete-video-button"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    // onToggleExpand should NOT be called — nested Pressable doesn't bubble
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  // ── Accessibility ──────────────────────────────────────────

  it("info row has accessibilityRole button with expand label", () => {
    // The info row should be announced as a button with a descriptive
    // label so screen reader users know what tapping it does.
    render(<BetaVideoPlayer {...defaultProps} />);

    const infoRow = screen.getByTestId("video-info-row");
    expect(infoRow.props.accessibilityRole).toBe("button");
    expect(infoRow.props.accessibilityLabel).toBe(
      "Tap to watch beta video by Alex Honnold"
    );
  });

  it("thumbnail has accessibilityRole button with play label", () => {
    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);

    const thumbnail = screen.getByTestId("video-thumbnail");
    expect(thumbnail.props.accessibilityRole).toBe("button");
    expect(thumbnail.props.accessibilityLabel).toBe(
      "Play beta video by Alex Honnold"
    );
  });

  it("retry has accessibilityRole button with label", () => {
    mockPlayerStatus = "error";
    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    const retry = screen.getByTestId("video-retry");
    expect(retry.props.accessibilityRole).toBe("button");
    expect(retry.props.accessibilityLabel).toBe("Retry loading video");
  });

  // ── Retry behavior ───────────────────────────────────────────

  it("resets to thumbnail state when retry is tapped on error", () => {
    mockPlayerStatus = "error";

    render(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    expect(screen.getByText(/tap to retry/i)).toBeOnTheScreen();

    mockPlayerStatus = "idle";
    fireEvent.press(screen.getByTestId("video-retry"));

    expect(screen.getByTestId("icon-play")).toBeOnTheScreen();
    expect(screen.queryByText(/failed to load/i)).toBeNull();
  });

  // ── Avatar ────────────────────────────────────────────────────

  it("renders the uploader avatar in the info row", () => {
    render(<BetaVideoPlayer {...defaultProps} />);

    expect(screen.getByTestId("uploader-avatar")).toBeOnTheScreen();
  });

  // ── Heart / Like button ───────────────────────────────────────

  it("renders the heart button and calls onLike when pressed", () => {
    const onLike = jest.fn();
    render(<BetaVideoPlayer {...defaultProps} onLike={onLike} />);

    const likeButton = screen.getByTestId("like-button");
    expect(likeButton).toBeOnTheScreen();

    fireEvent.press(likeButton);
    expect(onLike).toHaveBeenCalledTimes(1);
  });

  it("heart button does not trigger onToggleExpand", () => {
    // Same as delete — nested Pressables don't bubble in RN.
    const onToggleExpand = jest.fn();
    const onLike = jest.fn();
    render(
      <BetaVideoPlayer
        {...defaultProps}
        onLike={onLike}
        onToggleExpand={onToggleExpand}
      />
    );

    fireEvent.press(screen.getByTestId("like-button"));
    expect(onLike).toHaveBeenCalledTimes(1);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it("shows like count when likesCount > 0", () => {
    render(<BetaVideoPlayer {...defaultProps} likesCount={5} />);

    expect(screen.getByTestId("like-count")).toBeOnTheScreen();
    expect(screen.getByText("5")).toBeOnTheScreen();
  });

  it("hides like count when likesCount is 0", () => {
    render(<BetaVideoPlayer {...defaultProps} likesCount={0} />);

    expect(screen.queryByTestId("like-count")).toBeNull();
  });

  it("sets correct accessibility label based on isLiked state", () => {
    const { rerender } = render(
      <BetaVideoPlayer {...defaultProps} isLiked={false} />
    );

    expect(screen.getByTestId("like-button").props.accessibilityLabel).toBe(
      "Like video"
    );

    rerender(<BetaVideoPlayer {...defaultProps} isLiked={true} />);

    expect(screen.getByTestId("like-button").props.accessibilityLabel).toBe(
      "Unlike video"
    );
  });

  // ── Report button (Flag icon) ──────────────────────────────────

  it("shows report button when not owner and onReport is provided", () => {
    const onReport = jest.fn();
    render(
      <BetaVideoPlayer {...defaultProps} isOwner={false} onReport={onReport} />
    );

    const reportButton = screen.getByTestId("report-video-button");
    expect(reportButton).toBeOnTheScreen();
    expect(screen.getByTestId("icon-flag")).toBeOnTheScreen();
    expect(screen.queryByTestId("delete-video-button")).toBeNull();
  });

  it("calls onReport when report button is pressed", () => {
    const onReport = jest.fn();
    render(
      <BetaVideoPlayer {...defaultProps} isOwner={false} onReport={onReport} />
    );

    fireEvent.press(screen.getByTestId("report-video-button"));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it("hides report button when isOwner is true (shows delete instead)", () => {
    const onReport = jest.fn();
    render(
      <BetaVideoPlayer {...defaultProps} isOwner={true} onReport={onReport} />
    );

    expect(screen.queryByTestId("report-video-button")).toBeNull();
    expect(screen.getByTestId("delete-video-button")).toBeOnTheScreen();
  });

  it("hides report button when onReport is not provided", () => {
    render(<BetaVideoPlayer {...defaultProps} isOwner={false} />);

    expect(screen.queryByTestId("report-video-button")).toBeNull();
    expect(screen.queryByTestId("delete-video-button")).toBeNull();
  });

  // ── Player reset on collapse ──────────────────────────────────

  it("resets player when collapsed after being expanded", () => {
    // When the parent collapses this item, the useEffect should
    // reset isActive to false, destroying the player. This prevents
    // orphaned players buffering in the background.
    mockPlayerStatus = "readyToPlay";

    const { rerender } = render(
      <BetaVideoPlayer {...defaultProps} isExpanded={true} />
    );

    // Activate the player
    fireEvent.press(screen.getByTestId("video-thumbnail"));
    expect(screen.getByTestId("video-view")).toBeOnTheScreen();

    // Parent collapses this item
    rerender(<BetaVideoPlayer {...defaultProps} isExpanded={false} />);

    // Video area should be gone
    expect(screen.queryByTestId("video-view")).toBeNull();
    expect(screen.queryByTestId("video-thumbnail")).toBeNull();

    // Re-expand — should show thumbnail again (player was destroyed)
    rerender(<BetaVideoPlayer {...defaultProps} isExpanded={true} />);
    expect(screen.getByTestId("video-thumbnail")).toBeOnTheScreen();
    expect(screen.getByTestId("icon-play")).toBeOnTheScreen();
  });
});
