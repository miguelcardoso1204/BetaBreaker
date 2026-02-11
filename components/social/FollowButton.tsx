/**
 * FollowButton — Self-Contained Follow/Unfollow Toggle
 *
 * A single button that handles the full follow lifecycle:
 *   - Reads follow state via useToggleFollow hook
 *   - Shows "Follow" (primary) or "Following" (outline)
 *   - Triggers follow/unfollow mutation on press
 *   - Disables with spinner during mutation
 *
 * Self-contained means the parent only needs to provide the
 * target user ID — all state management happens internally
 * via TanStack Query hooks.
 */

import React from "react";
import { Button } from "@/components/ui/Button";
import { useToggleFollow } from "@/hooks/useSocial";

export interface FollowButtonProps {
  targetUserId: string;
}

export function FollowButton({ targetUserId }: FollowButtonProps) {
  const { isFollowing, toggleFollow, isPending } =
    useToggleFollow(targetUserId);

  return (
    <Button
      testID="follow-button"
      label={isFollowing ? "Following" : "Follow"}
      variant={isFollowing ? "outline" : "primary"}
      onPress={toggleFollow}
      loading={isPending}
      size="sm"
    />
  );
}
