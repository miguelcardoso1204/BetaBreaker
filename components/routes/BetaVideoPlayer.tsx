/**
 * BetaVideoPlayer — Accordion Item for Climbing Beta Videos (Step 12.2)
 *
 * Each video is rendered as a compact info row. Tapping the row expands it
 * to reveal the video player below. Only one video can be expanded at a time
 * (accordion behavior managed by the parent via isExpanded/onToggleExpand).
 *
 * WHY ACCORDION?
 * A 16:9 rectangle per video wastes vertical space when idle. The info row
 * (avatar + name + date + action buttons) gives enough context to identify
 * the video, and expanding on demand keeps the list scannable.
 *
 * WHY LAZY INITIALIZATION?
 * Even when expanded, the player isn't created until the user taps play.
 * Passing `null` to `useVideoPlayer` avoids allocating native resources
 * until the user actually wants to watch.
 *
 * STATES (when expanded):
 *   1. Inactive (thumbnail) — dark background + Play icon. No player exists.
 *   2. Loading — player created, ActivityIndicator shown while buffering.
 *   3. Ready/Playing — VideoView with native controls + fullscreen support.
 *   4. Error — "Failed to load" message with "Tap to retry".
 *
 * DATA FLOW:
 *   Parent passes `url` (Supabase Storage public URL) → useVideoPlayer
 *   creates a streaming player → VideoView renders the native player.
 */

import React, { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { Play, AlertCircle, Trash2, Heart, Flag, ChevronDown, ChevronUp } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/Avatar";

export interface BetaVideoPlayerProps {
  /** Public Supabase Storage URL for the video */
  url: string;
  /** Display name of the uploader */
  uploaderName: string;
  /** Avatar URL of the uploader (passed to the Avatar component) */
  uploaderAvatarUrl?: string;
  /** Formatted date string (e.g., "2/12/2026") */
  uploadDate: string;
  /** Whether the current user uploaded this video (controls delete visibility) */
  isOwner: boolean;
  /** Callback triggered when the user taps Delete on their own video */
  onDelete: () => void;
  /** Number of likes on this video */
  likesCount: number;
  /** Whether the current user has liked this video */
  isLiked: boolean;
  /** Callback triggered when the user taps the heart button */
  onLike: () => void;
  /** Callback triggered when a non-owner taps the Flag icon to report */
  onReport?: () => void;
  /** Whether this accordion item is currently expanded (shows the video area) */
  isExpanded: boolean;
  /** Callback to toggle the expanded state (parent manages accordion logic) */
  onToggleExpand: () => void;
}

/**
 * BetaVideoPlayer — Accordion item with lazy-loaded video playback.
 *
 * COLLAPSED: Shows an info row (avatar, name, date, action buttons, chevron).
 * Tapping the row calls `onToggleExpand` so the parent can manage which
 * item is expanded (accordion = only one open at a time).
 *
 * EXPANDED: Info row (chevron flips up) + video area below. The video
 * area starts as a thumbnail placeholder; tapping it creates the player.
 *
 * When the parent collapses this item (isExpanded false), a useEffect
 * resets `isActive` to false — destroying the player and freeing memory.
 */
export function BetaVideoPlayer({
  url,
  uploaderName,
  uploaderAvatarUrl,
  uploadDate,
  isOwner,
  onDelete,
  likesCount,
  isLiked,
  onLike,
  onReport,
  isExpanded,
  onToggleExpand,
}: BetaVideoPlayerProps) {
  const { t } = useTranslation();

  // Controls whether the video player is initialized.
  // Starts false — the player is only created when the user taps play.
  const [isActive, setIsActive] = useState(false);

  // When the parent collapses this item, destroy the player to free
  // memory. Without this, switching accordion items would leave
  // orphaned players buffering in the background.
  useEffect(() => {
    if (!isExpanded) {
      setIsActive(false);
    }
  }, [isExpanded]);

  // Create the player only when active. Passing null tells useVideoPlayer
  // not to allocate any native resources until we have a real URL.
  const player = useVideoPlayer(isActive ? url : null, (p) => {
    // Auto-play when the player is first created (user just tapped play)
    p.play();
  });

  // Subscribe to player status changes via expo's useEvent hook.
  // This returns a reactive value that updates when the player's status
  // transitions between 'idle', 'loading', 'readyToPlay', and 'error'.
  const { status, error: playerError } = useEvent(player, "statusChange", {
    status: player?.status ?? "idle",
    error: null,
  });

  /**
   * Activate the player — called when the user taps the thumbnail.
   * This triggers useVideoPlayer to create the player instance and
   * auto-play via the setup callback above.
   */
  const handleActivate = useCallback(() => {
    setIsActive(true);
  }, [url]);

  /**
   * Reset to thumbnail state — used as a retry mechanism when the
   * player encounters an error. Flipping isActive back to false
   * destroys the current player, and the user can tap again to
   * create a fresh one.
   */
  const handleRetry = useCallback(() => {
    setIsActive(false);
  }, []);

  // Pick the correct chevron direction based on expand state.
  const ChevronIcon = isExpanded ? ChevronUp : ChevronDown;

  return (
    <View className="mb-2">
      {/* ── Info Row (always visible) ──────────────────────────────── */}
      {/* The entire row is a tap target to toggle expand/collapse.
          Nested Pressables (heart, delete, flag) don't bubble in RN,
          so tapping them won't accidentally toggle the accordion. */}
      <Pressable
        testID="video-info-row"
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityLabel={t("video.tapToExpand", { name: uploaderName })}
      >
        <View className="flex-row items-center justify-between px-1 py-2">
          {/* Left side: avatar + uploader name and date */}
          <View className="flex-row items-center flex-1">
            <Avatar
              uri={uploaderAvatarUrl}
              name={uploaderName}
              size="sm"
              testID="uploader-avatar"
            />
            <View className="ml-2 flex-1">
              <Text className="text-text-primary font-medium">
                {uploaderName}
              </Text>
              <Text className="text-text-secondary text-sm">{uploadDate}</Text>
            </View>
          </View>

          {/* Right side: heart button + action button + chevron */}
          <View className="flex-row items-center">
            {/* Heart button — filled red when liked, outline gray when not.
                The count is only shown when > 0 to keep the UI clean. */}
            <Pressable
              testID="like-button"
              onPress={onLike}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? t("video.unlike") : t("video.like")}
              className="flex-row items-center p-2"
            >
              {likesCount > 0 && (
                <Text
                  testID="like-count"
                  className="text-text-secondary text-sm mr-1"
                >
                  {likesCount}
                </Text>
              )}
              <Heart
                size={18}
                color={isLiked ? "#EF4444" : "#9CA3AF"}
                fill={isLiked ? "#EF4444" : "none"}
              />
            </Pressable>

            {/* Action button — mutually exclusive: owners see Delete,
                non-owners see Flag (if onReport is provided). Same slot
                to keep the layout consistent across all video cards. */}
            {isOwner ? (
              <Pressable
                testID="delete-video-button"
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel={t("video.deleteVideo")}
                className="p-2"
              >
                <Trash2 size={18} color="#EF4444" />
              </Pressable>
            ) : onReport ? (
              <Pressable
                testID="report-video-button"
                onPress={onReport}
                accessibilityRole="button"
                accessibilityLabel={t("video.reportVideo")}
                className="p-2"
              >
                <Flag size={18} color="#9CA3AF" />
              </Pressable>
            ) : null}

            {/* Chevron — points down when collapsed, up when expanded.
                No testID here so each icon's own identity is preserved
                in tests (icon-chevron-down vs icon-chevron-up). */}
            <ChevronIcon size={18} color="#9CA3AF" />
          </View>
        </View>
      </Pressable>

      {/* ── Video Area (expanded only) ─────────────────────────────── */}
      {/* Conditionally rendered so collapsed items use zero vertical
          space for video content. The player is destroyed on collapse
          via the useEffect above, so re-expanding starts fresh. */}
      {isExpanded && (
        <View className="mt-1">
          {!isActive ? (
            // THUMBNAIL STATE: Dark placeholder with a centered Play icon.
            // Tapping anywhere on it activates the player.
            <Pressable
              testID="video-thumbnail"
              onPress={handleActivate}
              accessibilityRole="button"
              accessibilityLabel={t("video.playBeta", { name: uploaderName })}
            >
              <View className="bg-gray-800 rounded-xl items-center justify-center aspect-video">
                <Play size={48} color="#FFFFFF" />
              </View>
            </Pressable>
          ) : status === "error" ? (
            // ERROR STATE: Video failed to load (bad URL, network error, etc.)
            <Pressable
              testID="video-retry"
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel={t("video.retryLoad")}
            >
              <View className="bg-gray-800 rounded-xl items-center justify-center aspect-video">
                <AlertCircle size={32} color="#EF4444" />
                <Text className="text-red-400 mt-2 font-medium">
                  {t("video.failedToLoad")}
                </Text>
                <Text className="text-gray-400 text-sm mt-1">{t("video.tapToRetry")}</Text>
              </View>
            </Pressable>
          ) : status === "loading" || status === "idle" ? (
            // LOADING STATE: Player is created but still buffering.
            <View
              testID="video-loading"
              className="bg-gray-800 rounded-xl items-center justify-center aspect-video"
            >
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text className="text-gray-400 mt-2">{t("video.loadingVideo")}</Text>
            </View>
          ) : (
            // READY STATE: Player is loaded — show the native VideoView.
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
        </View>
      )}
    </View>
  );
}
