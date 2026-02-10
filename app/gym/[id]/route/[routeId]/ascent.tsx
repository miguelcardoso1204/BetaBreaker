/**
 * Full Ascent Form Screen — Rich Logging Beyond QuickLog
 *
 * This screen provides a detailed form for logging climbing ascents with:
 *   1. Route header card (name, grade, color swatch, status)
 *   2. Status selection (Flash / Send / Attempt)
 *   3. Attempts stepper (+/- with auto-lock for Flash)
 *   4. Star rating (perceived difficulty, 1–5 scale)
 *   5. Video upload placeholder (Phase 12)
 *   6. Comment text area with character counter
 *   7. Style tags (multi-select climbing skill categories)
 *   8. Submit button → logAscent mutation → navigate back
 *
 * DIFFERENCE FROM QUICKLOG:
 * QuickLogSheet is a quick modal for logging during an active session —
 * just status, attempts, and optional notes. This Full Ascent Form is
 * accessed from the Route Detail screen's "Add Ascent" button and captures
 * richer feedback (star rating, style tags, comments, video) that feeds
 * the gamification, social, and analytics systems.
 *
 * DATA FLOW:
 *   useLocalSearchParams → routeId → useRouteDetail (route data)
 *   Form state (local useState) → useSession().logAscent.mutate() → Supabase
 *   On success → haptic feedback → router.back() to Route Detail
 *
 * NO SESSION REQUIRED:
 * Unlike QuickLog (which runs during an active session timer), this form
 * works standalone. It only needs authentication (via useSession's useAuth).
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Minus, Plus, Video } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useRouteDetail } from "@/hooks/useRoutes";
import { useSession } from "@/hooks/useSession";
import { canonicalToDisplay } from "@/utils/grades";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StarRating } from "@/components/ui/StarRating";
import { ASCENT_STATUSES, STYLE_TAGS } from "@/lib/constants";
import type { AscentStatus, StyleTagKey } from "@/lib/constants";

// ── Display labels for status buttons ────────────────────────────────

/**
 * Map ascent status DB values to user-friendly labels.
 * Same mapping as QuickLogSheet — DRY principle would suggest a shared
 * constant, but duplicating 3 strings is simpler than a shared import
 * for two screens in different parts of the app tree.
 */
const STATUS_LABELS: Record<AscentStatus, string> = {
  flash: "Flash",
  send: "Send",
  attempt: "Attempt",
};

// ── Constants ────────────────────────────────────────────────────────

/** Maximum characters allowed in the comment field. */
const MAX_COMMENT_LENGTH = 200;

// ── Component ────────────────────────────────────────────────────────

export default function AscentFormScreen() {
  // ── URL params ──────────────────────────────────────────────────
  const { id, routeId } = useLocalSearchParams<{
    id: string;
    routeId: string;
  }>();
  const router = useRouter();

  // ── Data hooks ──────────────────────────────────────────────────
  // Fetch route data for the header card (name, grade, color, status).
  // This shares the TanStack Query cache with Route Detail, so if the
  // user just came from there, this is an instant cache hit.
  const { data: route, isLoading } = useRouteDetail(routeId);

  // logAscent mutation from useSession — persists the ascent to Supabase.
  const { logAscent } = useSession();

  // ── Local form state ────────────────────────────────────────────
  // All form values are ephemeral — they live in useState and don't
  // persist across screen unmounts. This is appropriate because the
  // form is a single-use action (log one ascent, then navigate back).
  const [status, setStatus] = useState<AscentStatus | null>(null);
  const [attempts, setAttempts] = useState(1);
  const [starRating, setStarRating] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<StyleTagKey>>(
    new Set()
  );

  // ── Status handler ──────────────────────────────────────────────
  // Same logic as QuickLog: selecting "flash" locks attempts to 1.
  const handleStatusSelect = useCallback((selected: AscentStatus) => {
    setStatus(selected);
    if (selected === "flash") {
      setAttempts(1);
    }
  }, []);

  // ── Tag toggle handler ──────────────────────────────────────────
  // Multi-select: tapping a tag adds it to the set; tapping again removes it.
  // We create a new Set each time because React state updates must be
  // immutable — mutating the existing Set wouldn't trigger a re-render.
  const handleTagToggle = useCallback((tagKey: StyleTagKey) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagKey)) {
        next.delete(tagKey);
      } else {
        next.add(tagKey);
      }
      return next;
    });
  }, []);

  // ── Submit handler ──────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!status) return;

    logAscent.mutate({
      routeId,
      status,
      attempts,
      // Only include notes if the user typed something non-empty.
      notes: comment.trim() || undefined,
      // Star rating maps to perceivedGrade. 0 means "not rated".
      perceivedGrade: starRating > 0 ? starRating : undefined,
    });

    // Haptic feedback for a satisfying "logged!" confirmation.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Navigate back to the Route Detail screen.
    router.back();
  }, [status, routeId, attempts, comment, starRating, logAscent, router]);

  // ── Loading state ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="ascent-loading"
      >
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // Convert canonical grade to display string for the header card.
  const displayGrade = route
    ? canonicalToDisplay(route.canonical_grade, "v-scale")
    : "";

  return (
    <ScrollView
      className="flex-1 bg-background"
      testID="ascent-form-screen"
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Route Header Card ──────────────────────────────────────── */}
      {/* Compact version of the Route Detail header so the user knows
          which route they're logging an ascent for. Shows color swatch,
          name, grade, and status badge. */}
      {route && (
        <View className="flex-row p-4 gap-3 items-center" testID="route-header">
          {/* Color swatch — smaller than Route Detail (56x56 vs 112x112) */}
          <View
            className="w-14 h-14 rounded-lg"
            style={{ backgroundColor: route.color || "#6366f1" }}
          />
          <View className="flex-1">
            <Text
              className="text-lg font-bold text-text-primary"
              numberOfLines={1}
            >
              {route.name}
            </Text>
            <Text className="text-text-secondary text-sm">
              {displayGrade}
            </Text>
          </View>
          <Badge
            label={
              route.status
                .split("_")
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")
            }
            variant={
              route.status === "active"
                ? "success"
                : route.status === "retiring_soon"
                  ? "warning"
                  : "default"
            }
          />
        </View>
      )}

      {/* ── Status Selection ──────────────────────────────────────── */}
      {/* Three buttons: Flash / Send / Attempt. Same visual pattern
          as QuickLogSheet — selected button gets accent background,
          unselected buttons get a subtle border. */}
      <View className="px-4 mb-4">
        <Text className="text-text-primary text-base font-medium mb-2">
          Result
        </Text>
        <View className="flex-row gap-3">
          {ASCENT_STATUSES.map((s) => {
            const isSelected = status === s;
            return (
              <Pressable
                key={s}
                onPress={() => handleStatusSelect(s)}
                accessibilityRole="button"
                accessibilityLabel={`${STATUS_LABELS[s]} status`}
                accessibilityState={{ selected: isSelected }}
                testID={`status-${s}`}
                className={`flex-1 items-center py-3 rounded-xl ${
                  isSelected
                    ? "bg-accent"
                    : "border border-border"
                }`}
              >
                <Text
                  className={`font-semibold ${
                    isSelected ? "text-white" : "text-text-secondary"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Attempts Stepper ──────────────────────────────────────── */}
      {/* +/- buttons with count. Locked to 1 when status is "flash"
          (a flash is by definition a first-attempt completion). */}
      <View className="flex-row items-center justify-between px-4 mb-4">
        <Text className="text-text-primary text-base font-medium">
          Attempts
        </Text>
        <View className="flex-row items-center gap-4">
          <Pressable
            testID="attempts-decrement"
            onPress={() => setAttempts((prev) => Math.max(1, prev - 1))}
            disabled={attempts <= 1 || status === "flash"}
            accessibilityRole="button"
            accessibilityLabel="Decrease attempts"
            className={`w-10 h-10 rounded-lg items-center justify-center border border-border ${
              attempts <= 1 || status === "flash" ? "opacity-30" : ""
            }`}
          >
            <Minus size={18} color="#EAEAF0" />
          </Pressable>

          <Text
            testID="attempts-count"
            className="text-text-primary text-lg font-bold min-w-[24px] text-center"
          >
            {attempts}
          </Text>

          <Pressable
            testID="attempts-increment"
            onPress={() => setAttempts((prev) => Math.min(99, prev + 1))}
            disabled={status === "flash"}
            accessibilityRole="button"
            accessibilityLabel="Increase attempts"
            className={`w-10 h-10 rounded-lg items-center justify-center border border-border ${
              status === "flash" ? "opacity-30" : ""
            }`}
          >
            <Plus size={18} color="#EAEAF0" />
          </Pressable>
        </View>
      </View>

      {/* ── Star Rating ───────────────────────────────────────────── */}
      {/* 5-star input for perceived difficulty. The 1–5 value stores
          directly in the `perceived_grade` column as a simplified
          difficulty perception (1 = easy for the grade, 5 = very hard). */}
      <View className="px-4 mb-4">
        <Text className="text-text-primary text-base font-medium mb-2">
          How would you rate this route?
        </Text>
        <StarRating value={starRating} onChange={setStarRating} />
      </View>

      {/* ── Video Upload Placeholder ──────────────────────────────── */}
      {/* Beta video uploads will be implemented in Phase 12 (Media).
          For now, the button shows a placeholder Alert explaining the
          feature isn't available yet. The dashed border style signals
          "upload target" to users familiar with drag-and-drop UIs. */}
      <View className="px-4 mb-4">
        <Pressable
          testID="video-upload-button"
          onPress={() => {
            Alert.alert(
              "Coming Soon",
              "Beta video uploads will be available in a future update (Phase 12)."
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Add Beta Video"
          className="items-center justify-center py-6 rounded-xl border-2 border-dashed border-border"
        >
          <Video size={28} color="#6B7280" />
          <Text className="text-text-secondary mt-2">Add Beta Video</Text>
        </Pressable>
      </View>

      {/* ── Comment Section ───────────────────────────────────────── */}
      {/* Free-text area for beta tips, conditions, or personal notes.
          Uses RN's TextInput directly (not AppTextInput) because we need
          multiline support with a character counter. */}
      <View className="px-4 mb-4">
        <Text className="text-text-primary text-base font-medium mb-2">
          Comments
        </Text>
        <TextInput
          testID="comment-input"
          value={comment}
          onChangeText={(text) => setComment(text.slice(0, MAX_COMMENT_LENGTH))}
          placeholder="Share your beta, conditions, or thoughts..."
          placeholderTextColor="#6B7280"
          multiline
          numberOfLines={4}
          maxLength={MAX_COMMENT_LENGTH}
          // Dark theme styling to match the app's color palette.
          // NativeWind doesn't fully support TextInput multiline styling
          // on all platforms, so we use inline styles for reliability.
          style={{
            backgroundColor: "#1C1C28",
            color: "#EAEAF0",
            borderWidth: 1,
            borderColor: "#2A2A3C",
            borderRadius: 12,
            padding: 12,
            minHeight: 100,
            textAlignVertical: "top",
            fontSize: 14,
          }}
        />
        {/* Character counter — shows how many of 200 chars are used. */}
        <Text testID="char-counter" className="text-text-secondary text-xs mt-1 text-right">
          {comment.length}/{MAX_COMMENT_LENGTH}
        </Text>
      </View>

      {/* ── Style Tags ────────────────────────────────────────────── */}
      {/* Multi-select grid of climbing style categories. Selected tags
          get full-color Badge styling; unselected tags are dimmed.
          Tags are tracked in local state only — not persisted to DB yet
          (no style_tags column exists). Phase 9+ will add persistence. */}
      <View className="px-4 mb-6">
        <Text className="text-text-primary text-base font-medium mb-2">
          Climbing Style
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {STYLE_TAGS.map((tag) => {
            const isSelected = selectedTags.has(tag.key);
            return (
              <Pressable
                key={tag.key}
                testID={`tag-${tag.key}`}
                onPress={() => handleTagToggle(tag.key)}
                accessibilityRole="button"
                accessibilityLabel={`${tag.label} style tag`}
                accessibilityState={{ selected: isSelected }}
                // Dim unselected tags to 40% opacity so selected tags
                // visually "pop" with their full color.
                style={{ opacity: isSelected ? 1 : 0.4 }}
              >
                <Badge label={tag.label} variant="tag" color={tag.color} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Submit Button ─────────────────────────────────────────── */}
      {/* Primary CTA that logs the ascent. Disabled until a status is
          selected (star rating, tags, and comment are all optional). */}
      <View className="px-4 pb-8">
        <Button
          label="Add Ascent"
          onPress={handleSubmit}
          size="lg"
          disabled={status === null}
          loading={logAscent.isPending}
          testID="submit-ascent-button"
        />
      </View>
    </ScrollView>
  );
}
