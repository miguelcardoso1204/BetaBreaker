/**
 * BetaVideoPlayer — Video Playback for Climbing Beta (Step 12.2)
 *
 * Renders a single beta video with lazy-loaded playback. Videos start as
 * a dark thumbnail placeholder with a Play icon overlay. When the user
 * taps the thumbnail, the video player initializes and playback begins.
 *
 * WHY LAZY INITIALIZATION?
 * In a list of beta videos (rendered via FlatList), creating all video
 * players immediately would trigger simultaneous network requests and
 * consume excessive memory. By deferring player creation until the user
 * explicitly taps "play", we only buffer the video they want to watch.
 * The `useVideoPlayer` hook receives `null` until activation, which
 * tells expo-video not to create a player instance.
 *
 * STATES:
 *   1. Inactive (thumbnail) — dark background + Play icon. No player exists.
 *   2. Loading — player created, ActivityIndicator shown while buffering.
 *   3. Ready/Playing — VideoView with native controls + fullscreen support.
 *   4. Error — "Failed to load" message with "Tap to retry" that resets
 *      back to the thumbnail state for a fresh attempt.
 *
 * DATA FLOW:
 *   Parent passes `url` (Supabase Storage public URL) → useVideoPlayer
 *   creates a streaming player → VideoView renders the native player.
 *   No full download needed — expo-video streams by default.
 */

import React, { useState, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { Play, AlertCircle, Trash2 } from "lucide-react-native";

export interface BetaVideoPlayerProps {
  /** Public Supabase Storage URL for the video */
  url: string;
  /** Display name of the uploader */
  uploaderName: string;
  /** Formatted date string (e.g., "2/12/2026") */
  uploadDate: string;
  /** Whether the current user uploaded this video (controls delete visibility) */
  isOwner: boolean;
  /** Callback triggered when the user taps Delete on their own video */
  onDelete: () => void;
}

/**
 * BetaVideoPlayer — Lazy-loaded video playback with thumbnail preview.
 *
 * The component starts in "inactive" mode showing a placeholder thumbnail.
 * Tapping it flips `isActive` to true, which causes `useVideoPlayer` to
 * receive the actual URL (instead of null) and create the player instance.
 *
 * `useEvent` from expo hooks into the player's 'statusChange' event to
 * track whether the player is 'loading', 'readyToPlay', or 'error'.
 * This drives which UI is shown: spinner, VideoView, or error fallback.
 */
export function BetaVideoPlayer({
  url,
  uploaderName,
  uploadDate,
  isOwner,
  onDelete,
}: BetaVideoPlayerProps) {
  // Controls whether the video player is initialized.
  // Starts false — the player is only created when the user taps play.
  const [isActive, setIsActive] = useState(false);

  // Create the player only when active. Passing null tells useVideoPlayer
  // not to allocate any native resources until we have a real URL.
  const player = useVideoPlayer(isActive ? url : null, (p) => {
    // Auto-play when the player is first created (user just tapped play)
    p.play();
  });

  // Subscribe to player status changes via expo's useEvent hook.
  // This returns a reactive value that updates when the player's status
  // transitions between 'idle', 'loading', 'readyToPlay', and 'error'.
  const { status } = useEvent(player, "statusChange", {
    status: player?.status ?? "idle",
  });

  /**
   * Activate the player — called when the user taps the thumbnail.
   * This triggers useVideoPlayer to create the player instance and
   * auto-play via the setup callback above.
   */
  const handleActivate = useCallback(() => {
    setIsActive(true);
  }, []);

  /**
   * Reset to thumbnail state — used as a retry mechanism when the
   * player encounters an error. Flipping isActive back to false
   * destroys the current player, and the user can tap again to
   * create a fresh one.
   */
  const handleRetry = useCallback(() => {
    setIsActive(false);
  }, []);

  return (
    <View className="mb-4">
      {/* ── Video Area ─────────────────────────────────────────────── */}
      {!isActive ? (
        // THUMBNAIL STATE: Dark placeholder with a centered Play icon.
        // Tapping anywhere on it activates the player.
        <Pressable testID="video-thumbnail" onPress={handleActivate}>
          <View className="bg-gray-800 rounded-xl items-center justify-center aspect-video">
            <Play size={48} color="#FFFFFF" />
          </View>
        </Pressable>
      ) : status === "error" ? (
        // ERROR STATE: Video failed to load (bad URL, network error, etc.)
        // Show a user-friendly message and a retry button that resets
        // the player so they can try again.
        <Pressable testID="video-retry" onPress={handleRetry}>
          <View className="bg-gray-800 rounded-xl items-center justify-center aspect-video">
            <AlertCircle size={32} color="#EF4444" />
            <Text className="text-red-400 mt-2 font-medium">
              Failed to load video
            </Text>
            <Text className="text-gray-400 text-sm mt-1">Tap to retry</Text>
          </View>
        </Pressable>
      ) : status === "loading" || status === "idle" ? (
        // LOADING STATE: Player is created but still buffering.
        // Show a spinner so the user knows playback is starting.
        <View
          testID="video-loading"
          className="bg-gray-800 rounded-xl items-center justify-center aspect-video"
        >
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text className="text-gray-400 mt-2">Loading video...</Text>
        </View>
      ) : (
        // READY STATE: Player is loaded — show the native VideoView.
        // nativeControls gives the user play/pause/scrubber/volume.
        // allowsFullscreen lets them expand for a better view of the beta.
        // contentFit="contain" preserves the video's aspect ratio.
        <View className="rounded-xl overflow-hidden">
          <VideoView
            testID="video-view"
            player={player!}
            style={{ width: "100%", aspectRatio: 16 / 9 }}
            contentFit="contain"
            nativeControls={true}
            allowsFullscreen={true}
          />
        </View>
      )}

      {/* ── Info Row ───────────────────────────────────────────────── */}
      {/* Shows who uploaded the video and when. If the current user is
          the owner, a delete button appears on the right side. */}
      <View className="flex-row items-center justify-between mt-2 px-1">
        <View className="flex-1">
          <Text className="text-text-primary font-medium">
            {uploaderName}
          </Text>
          <Text className="text-text-secondary text-sm">{uploadDate}</Text>
        </View>

        {/* Delete button — only visible to the video owner.
            RLS enforces deletion server-side too, but hiding the button
            avoids showing non-functional UI to non-owners. */}
        {isOwner && (
          <Pressable
            testID="delete-video-button"
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete video"
            className="p-2"
          >
            <Trash2 size={18} color="#EF4444" />
          </Pressable>
        )}
      </View>
    </View>
  );
}
