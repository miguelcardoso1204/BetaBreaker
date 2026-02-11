/**
 * FeedbackItem — Single Beta Tip Card with Voting
 *
 * Renders one beta tip in the route detail's "Beta Tips" section.
 * Each card shows:
 *   - Author avatar + display name + relative time
 *   - The tip body text
 *   - Upvote/downvote buttons with the current score
 *   - A delete button (only for the tip's author)
 *
 * PRESENTATIONAL COMPONENT:
 * This is a "dumb" component — it receives all data and callbacks
 * via props and has no internal state or side effects. The parent
 * (route detail screen) manages the data fetching via hooks and
 * passes everything down. This pattern makes the component easy
 * to test because you control all inputs.
 *
 * VOTE COLOR SCHEME:
 *   - Active upvote: green (#22C55E) — positive/approval
 *   - Active downvote: red (#EF4444) — negative/disagreement
 *   - Inactive: muted gray (#6B6B80) — neutral/available
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { ThumbsUp, ThumbsDown, Trash2 } from "lucide-react-native";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Shape of a feedback row with its author profile joined via PostgREST.
 * This matches what getRouteFeedback returns from the service layer.
 */
export interface FeedbackWithProfile {
  id: string;
  route_id: string;
  user_id: string;
  body: string;
  score: number;
  created_at: string;
  profile: {
    display_name: string;
    avatar_url: string | null;
  };
}

export interface FeedbackItemProps {
  /** The feedback data including joined author profile */
  feedback: FeedbackWithProfile;
  /** The current user's vote on this tip: 'up', 'down', or null */
  userVote: string | null;
  /** The authenticated user's ID — used to show/hide the delete button */
  currentUserId: string;
  /** Called when a vote button is pressed: (feedbackId, direction) */
  onVote: (feedbackId: string, direction: "up" | "down") => void;
  /** Called when the delete button is pressed: (feedbackId) */
  onDelete: (feedbackId: string) => void;
}

/**
 * Formats a timestamp into a relative time string like "2h ago" or "3d ago".
 *
 * Uses simple math on millisecond differences rather than a library like
 * date-fns. This keeps the bundle small — we only need rough relative
 * times, not precise "2 hours, 14 minutes ago" formatting.
 */
function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function FeedbackItem({
  feedback,
  userVote,
  currentUserId,
  onVote,
  onDelete,
}: FeedbackItemProps) {
  const { profile } = feedback;
  const isAuthor = feedback.user_id === currentUserId;

  // Determine icon colors based on the user's current vote.
  // Active state uses a bright color; inactive uses muted gray.
  const upColor = userVote === "up" ? "#22C55E" : "#6B6B80";
  const downColor = userVote === "down" ? "#EF4444" : "#6B6B80";

  return (
    <View className="bg-surface rounded-lg p-3 mb-2">
      {/* ── Author row: avatar + name + time + delete ──────────── */}
      <View className="flex-row items-center mb-2">
        <Avatar
          uri={profile.avatar_url ?? undefined}
          name={profile.display_name}
          size="sm"
          testID="feedback-avatar"
        />
        <Text className="text-text-primary font-medium ml-2 flex-1">
          {profile.display_name}
        </Text>
        <Text className="text-text-secondary text-xs mr-2">
          {timeAgo(feedback.created_at)}
        </Text>
        {/* Delete button — only visible when the current user authored this tip.
            The UI hides it for other users' tips; RLS enforces this at the DB
            level as a security boundary. */}
        {isAuthor && (
          <Pressable
            testID="delete-button"
            onPress={() => onDelete(feedback.id)}
            accessibilityRole="button"
            accessibilityLabel="Delete tip"
            className="p-1"
          >
            <Trash2 size={16} color="#6B6B80" />
          </Pressable>
        )}
      </View>

      {/* ── Tip body text ──────────────────────────────────────── */}
      <Text className="text-text-primary text-sm mb-2">
        {feedback.body}
      </Text>

      {/* ── Vote row: up arrow + score + down arrow ────────────── */}
      {/* The vote buttons use Pressable for the modern touch API.
          Each button calls onVote with the feedback ID and direction.
          The parent (route detail) handles the actual vote/unvote logic
          by checking the current userVote state. */}
      <View className="flex-row items-center gap-3">
        <Pressable
          testID="vote-up-button"
          onPress={() => onVote(feedback.id, "up")}
          accessibilityRole="button"
          accessibilityLabel="Upvote"
          className="p-1"
        >
          <ThumbsUp size={18} color={upColor} />
        </Pressable>

        <Text className="text-text-primary text-sm font-medium min-w-[20px] text-center">
          {feedback.score}
        </Text>

        <Pressable
          testID="vote-down-button"
          onPress={() => onVote(feedback.id, "down")}
          accessibilityRole="button"
          accessibilityLabel="Downvote"
          className="p-1"
        >
          <ThumbsDown size={18} color={downColor} />
        </Pressable>
      </View>
    </View>
  );
}
