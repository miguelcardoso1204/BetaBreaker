/**
 * FeedbackItem — Single Beta Tip Card with Voting
 *
 * Renders one beta tip in the route detail's "Beta Tips" section.
 * Each card shows:
 *   - Author avatar + display name + relative time
 *   - The tip body text with a right-aligned like button
 *   - A delete button (only for the tip's author)
 *
 * PRESENTATIONAL COMPONENT:
 * This is a "dumb" component — it receives all data and callbacks
 * via props and has no internal state or side effects. The parent
 * (route detail screen) manages the data fetching via hooks and
 * passes everything down. This pattern makes the component easy
 * to test because you control all inputs.
 *
 * LIKE COLOR SCHEME (matches video submissions):
 *   - Liked: filled red (#EF4444)
 *   - Not liked: outline gray (#9CA3AF)
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Heart, Trash2, Flag } from "lucide-react-native";
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
  /**
   * Optional callback for reporting this tip. When provided, a flag icon
   * appears next to the delete button (but only for tips the user didn't
   * author — you don't report your own content).
   */
  onReport?: (feedbackId: string) => void;
}

export function FeedbackItem({
  feedback,
  userVote,
  currentUserId,
  onVote,
  onDelete,
  onReport,
}: FeedbackItemProps) {
  const router = useRouter();
  const { profile } = feedback;
  const isAuthor = feedback.user_id === currentUserId;

  const isLiked = userVote === "up";

  return (
    <View className="bg-surface rounded-lg p-3 mb-2">
      {/* ── Author row: avatar + name (tappable) + time + delete ── */}
      <View className="flex-row items-center mb-2">
        <Pressable
          className="flex-row items-center flex-1"
          onPress={() => router.push(`/profile/${feedback.user_id}` as any)}
          accessibilityRole="link"
          accessibilityLabel={`View ${profile.display_name}'s profile`}
        >
          <Avatar
            uri={profile.avatar_url ?? undefined}
            name={profile.display_name}
            size="sm"
            testID="feedback-avatar"
          />
          <Text className="text-text-primary font-medium ml-2 flex-1">
            {profile.display_name}
          </Text>
        </Pressable>
        {/* Report button — only visible for tips the user did NOT author.
            You don't report your own content. The flag icon opens the
            ReportSheet via the parent's callback. */}
        {!isAuthor && onReport && (
          <Pressable
            testID="report-button"
            onPress={() => onReport(feedback.id)}
            accessibilityRole="button"
            accessibilityLabel="Report tip"
            className="p-1 mr-1"
          >
            <Flag size={16} color="#6B6B80" />
          </Pressable>
        )}
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

      {/* ── Body + like row ─────────────────────────────────────── */}
      <View className="flex-row items-end">
        <Text className="text-text-primary text-sm flex-1">
          {feedback.body}
        </Text>

        {/* Heart button — filled red when liked, outline gray when not.
            Matches the video submissions like pattern. */}
        <Pressable
          testID="like-button"
          onPress={() => onVote(feedback.id, "up")}
          accessibilityRole="button"
          accessibilityLabel={isLiked ? "Unlike" : "Like"}
          className="flex-row items-center p-1 ml-2"
        >
          {feedback.score > 0 && (
            <Text testID="like-count" className="text-text-secondary text-sm mr-1">
              {feedback.score}
            </Text>
          )}
          <Heart
            size={18}
            color={isLiked ? "#EF4444" : "#9CA3AF"}
            fill={isLiked ? "#EF4444" : "none"}
          />
        </Pressable>
      </View>
    </View>
  );
}
