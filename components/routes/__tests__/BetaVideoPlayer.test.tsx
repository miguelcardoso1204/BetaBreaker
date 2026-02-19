/**
 * BetaVideoPlayer Tests — Video Playback Component (Step 12.2)
 *
 * Tests the video playback component that displays beta videos uploaded
 * by the climbing community. The component has two states:
 *   1. Thumbnail/placeholder — dark background with a Play icon overlay.
 *      Tapping it activates the player (lazy initialization).
 *   2. Active player — uses expo-video's VideoView for native playback.
 *
 * WHY LAZY INITIALIZATION?
 * In a FlatList of videos, creating all players immediately would cause
 * excessive network requests and memory usage. By deferring player
 * creation until the user taps "play", we only buffer the video the
 * user actually wants to watch.
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
  };
});

// Import the component AFTER mocks are set up so it uses the mocked modules
import { BetaVideoPlayer } from "../BetaVideoPlayer";

// ── Fixtures ─────────────────────────────────────────────────────

/** Default props matching a typical beta video */
const defaultProps = {
  url: "https://storage.example.com/videos/beta-1.mp4",
  uploaderName: "Alex Honnold",
  uploadDate: "2/12/2026",
  isOwner: false,
  onDelete: jest.fn(),
};

// ── Tests ────────────────────────────────────────────────────────

describe("BetaVideoPlayer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to idle status before each test
    mockPlayerStatus = "idle";
  });

  // ── Thumbnail state ──────────────────────────────────────────

  it("renders thumbnail state with play button when not active", () => {
    // Before the user taps, the component should show a placeholder
    // with a Play icon — not the actual VideoView. This is the lazy
    // initialization pattern that prevents all videos from buffering.
    render(<BetaVideoPlayer {...defaultProps} />);

    // Play icon should be visible as the tap target
    expect(screen.getByTestId("icon-play")).toBeOnTheScreen();
    // The actual VideoView should NOT be rendered yet
    expect(screen.queryByTestId("video-view")).toBeNull();
  });

  it("starts playback when thumbnail is tapped", () => {
    // Tapping the thumbnail should activate the player and call play().
    // This is the transition from lazy placeholder to active video.
    mockPlayerStatus = "readyToPlay";

    render(<BetaVideoPlayer {...defaultProps} />);

    // Tap the thumbnail area
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    // After activation, player.play() should have been called
    expect(mockPlay).toHaveBeenCalledTimes(1);
    // VideoView should now be rendered
    expect(screen.getByTestId("video-view")).toBeOnTheScreen();
  });

  // ── VideoView configuration ──────────────────────────────────

  it("renders VideoView with native controls enabled", () => {
    // Native controls (play/pause/scrubber/volume) should be shown
    // so users have full playback control without custom UI.
    mockPlayerStatus = "readyToPlay";

    render(<BetaVideoPlayer {...defaultProps} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    const videoView = screen.getByTestId("video-view");
    const hint = JSON.parse(videoView.props.accessibilityHint);
    expect(hint.nativeControls).toBe(true);
  });

  it("renders VideoView with fullscreen allowed", () => {
    // Users should be able to expand the video to fullscreen for
    // a better viewing experience of climbing beta.
    mockPlayerStatus = "readyToPlay";

    render(<BetaVideoPlayer {...defaultProps} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    const videoView = screen.getByTestId("video-view");
    const hint = JSON.parse(videoView.props.accessibilityHint);
    expect(hint.allowsFullscreen).toBe(true);
  });

  // ── Error handling ───────────────────────────────────────────

  it("shows error fallback when player status is error", () => {
    // If the video URL is invalid or network fails, the player's
    // status changes to 'error'. We should show a user-friendly
    // error message with a retry option instead of a broken player.
    mockPlayerStatus = "error";

    render(<BetaVideoPlayer {...defaultProps} />);
    // Activate the player first
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    // Error message should be visible
    expect(screen.getByText(/failed to load/i)).toBeOnTheScreen();
    // Retry option should be available
    expect(screen.getByText(/tap to retry/i)).toBeOnTheScreen();
  });

  // ── Loading state ────────────────────────────────────────────

  it("shows loading indicator when player is loading", () => {
    // While the video is buffering, show an ActivityIndicator so
    // the user knows something is happening.
    mockPlayerStatus = "loading";

    render(<BetaVideoPlayer {...defaultProps} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    expect(screen.getByTestId("video-loading")).toBeOnTheScreen();
  });

  // ── Uploader info ────────────────────────────────────────────

  it("displays uploader name and date below the video", () => {
    // Each beta video shows who uploaded it and when, so climbers
    // can gauge the relevance (recent tips are more likely current).
    render(<BetaVideoPlayer {...defaultProps} />);

    expect(screen.getByText("Alex Honnold")).toBeOnTheScreen();
    expect(screen.getByText("2/12/2026")).toBeOnTheScreen();
  });

  // ── Delete button (ownership) ─────────────────────────────────

  it("shows delete button when isOwner is true", () => {
    // Users should be able to delete their own video uploads.
    // The delete button is only shown for the owner — RLS enforces
    // this server-side too, but hiding it prevents confusion.
    const onDelete = jest.fn();
    render(
      <BetaVideoPlayer {...defaultProps} isOwner={true} onDelete={onDelete} />
    );

    const deleteButton = screen.getByTestId("delete-video-button");
    expect(deleteButton).toBeOnTheScreen();

    // Tapping delete should call the onDelete callback
    fireEvent.press(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("hides delete button when isOwner is false", () => {
    // Non-owners should NOT see the delete button — they can't
    // delete other users' uploads.
    render(<BetaVideoPlayer {...defaultProps} isOwner={false} />);

    expect(screen.queryByTestId("delete-video-button")).toBeNull();
  });

  // ── Accessibility ──────────────────────────────────────────

  it("thumbnail has accessibilityRole button with label", () => {
    // The thumbnail Pressable should be announced as a button with
    // a label that includes the uploader's name for context.
    render(<BetaVideoPlayer {...defaultProps} />);

    const thumbnail = screen.getByTestId("video-thumbnail");
    expect(thumbnail.props.accessibilityRole).toBe("button");
    expect(thumbnail.props.accessibilityLabel).toBe(
      "Play beta video by Alex Honnold"
    );
  });

  it("retry has accessibilityRole button with label", () => {
    // The retry Pressable should be announced as a button.
    mockPlayerStatus = "error";
    render(<BetaVideoPlayer {...defaultProps} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    const retry = screen.getByTestId("video-retry");
    expect(retry.props.accessibilityRole).toBe("button");
    expect(retry.props.accessibilityLabel).toBe("Retry loading video");
  });

  // ── Retry behavior ───────────────────────────────────────────

  it("resets to thumbnail state when retry is tapped on error", () => {
    // When a video fails to load, tapping "Tap to retry" should
    // reset the component back to the thumbnail state so the user
    // can try again (re-initializes the player from scratch).
    mockPlayerStatus = "error";

    render(<BetaVideoPlayer {...defaultProps} />);
    fireEvent.press(screen.getByTestId("video-thumbnail"));

    // Should be in error state
    expect(screen.getByText(/tap to retry/i)).toBeOnTheScreen();

    // Reset status for the retry
    mockPlayerStatus = "idle";

    // Tap retry
    fireEvent.press(screen.getByTestId("video-retry"));

    // Should be back to thumbnail (Play icon visible, no error)
    expect(screen.getByTestId("icon-play")).toBeOnTheScreen();
    expect(screen.queryByText(/failed to load/i)).toBeNull();
  });
});
