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
  Keyboard,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Minus, Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useRouteDetail } from "@/hooks/useRoutes";
import { useSession } from "@/hooks/useSession";
import { useCreateFeedback } from "@/hooks/useFeedback";
import { canonicalToDisplay } from "@/utils/grades";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { GradeSlider } from "@/components/ui/GradeSlider";
import { StarRating } from "@/components/ui/StarRating";
import { VideoUploadButton } from "@/components/routes/VideoUploadButton";
import { ASCENT_STATUSES, STYLE_TAGS } from "@/lib/constants";
import type { AscentStatus, StyleTagKey } from "@/lib/constants";

// ── Display labels for status buttons ────────────────────────────────

/**
 * Map ascent status DB values to user-friendly labels.
 * Same mapping as QuickLogSheet — DRY principle would suggest a shared
 * constant, but duplicating 3 strings is simpler than a shared import
 * for two screens in different parts of the app tree.
 */
// NOTE: Labels are translation keys resolved via t() at render time.
// This lets us keep the static map outside the component while supporting i18n.
const STATUS_LABEL_KEYS: Record<AscentStatus, string> = {
  flash: "session.flash",
  send: "session.send",
  attempt: "session.attempt",
};

// ── Constants ────────────────────────────────────────────────────────

/** Maximum characters allowed in the comment field. */
const MAX_COMMENT_LENGTH = 200;

// ── Component ────────────────────────────────────────────────────────

export default function AscentFormScreen() {
  // i18n hook — provides t() for translating hardcoded strings.
  const { t } = useTranslation();

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

  // createFeedback mutation — if the user writes a comment, it also gets
  // posted as a beta tip on the route so other climbers can see it.
  const { mutate: createFeedback } = useCreateFeedback(routeId);

  // Screen width for sizing the color swatch to match the profile avatar.
  const { width: screenWidth } = useWindowDimensions();
  const swatchSize = Math.min(160, Math.max(80, Math.round(screenWidth * 0.35)));

  // ── Local form state ────────────────────────────────────────────
  // All form values are ephemeral — they live in useState and don't
  // persist across screen unmounts. This is appropriate because the
  // form is a single-use action (log one ascent, then navigate back).
  const [status, setStatus] = useState<AscentStatus | null>(null);
  const [attempts, setAttempts] = useState(1);
  // Perceived grade defaults to the route's canonical grade — the user
  // adjusts the slider if they think it should be harder or easier.
  const [perceivedGrade, setPerceivedGrade] = useState<number | null>(null);
  // Quality/enjoyment rating (1–5 stars). 0 means unset → submitted as undefined.
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<StyleTagKey>>(
    new Set()
  );

  // ── Status handler ──────────────────────────────────────────────
  // Flash locks attempts to 1 (first-try by definition).
  // Send starts at 2 (1 attempt = flash, not send).
  const handleStatusSelect = useCallback((selected: AscentStatus) => {
    setStatus(selected);
    if (selected === "flash") {
      setAttempts(1);
    } else if (selected === "send") {
      setAttempts((prev) => Math.max(2, prev));
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

    const trimmedComment = comment.trim();

    logAscent.mutate({
      routeId,
      status,
      attempts,
      // Only include notes if the user typed something non-empty.
      notes: trimmedComment || undefined,
      // Slider value is a canonical grade (0–30). null means untouched.
      perceivedGrade: perceivedGrade ?? undefined,
      // Star rating for quality/enjoyment. 0 means unset → don't submit.
      rating: rating > 0 ? rating : undefined,
    });

    // If the user wrote a comment, also post it as a beta tip so it
    // appears in the route detail's Beta Tips section for other climbers.
    if (trimmedComment) {
      createFeedback({ body: trimmedComment });
    }

    // Haptic feedback for a satisfying "logged!" confirmation.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Navigate back to the Route Detail screen.
    router.back();
  }, [status, routeId, attempts, comment, perceivedGrade, rating, logAscent, createFeedback, router]);

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
    <SafeAreaView className="flex-1 bg-background" edges={["top"]} onTouchStart={Keyboard.dismiss}>
      {/* Header — back button + screen title, matching parent screens */}
      <View className="flex-row items-center px-4 pt-2 pb-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={28} color="#ffffff" />
        </Pressable>
        <Text className="text-text-primary text-lg font-bold ml-2" numberOfLines={1}>
          {t("route.addAscent")}
        </Text>
      </View>

    <ScrollView
      className="flex-1"
      testID="ascent-form-screen"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
    >
      {/* ── Route Header Card ──────────────────────────────────────── */}
      {route && (
        <View className="flex-row p-4 gap-3 items-center" testID="route-header">
          <View
            className="rounded-lg"
            style={{ width: swatchSize, height: swatchSize, backgroundColor: route.color || "#6366f1" }}
          />
          <View className="flex-1">
            <Text className="text-lg font-bold text-text-primary" numberOfLines={1}>
              {route.name}
            </Text>
            <Text className="text-text-secondary text-sm">{displayGrade}</Text>
          </View>
        </View>
      )}

      {/* ═══ GROUP 1: Your Climb ═══════════════════════════════════ */}
      <View className="bg-surface rounded-xl p-4 mx-4 mb-4">
        <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">
          {t("ascent.yourClimb")}
        </Text>

        {/* Status: Flash / Send / Attempt */}
        <View className="flex-row gap-3 mb-4">
          {ASCENT_STATUSES.map((s) => {
            const isSelected = status === s;
            return (
              <Pressable
                key={s}
                onPress={() => handleStatusSelect(s)}
                accessibilityRole="button"
                accessibilityLabel={`${t(STATUS_LABEL_KEYS[s])} status`}
                accessibilityState={{ selected: isSelected }}
                testID={`status-${s}`}
                className={`flex-1 items-center py-3 rounded-xl ${
                  isSelected ? "bg-accent" : "border border-border"
                }`}
              >
                <Text className={`font-semibold ${isSelected ? "text-white" : "text-text-secondary"}`}>
                  {t(STATUS_LABEL_KEYS[s])}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Attempts stepper */}
        <View className="flex-row items-center justify-between">
          <Text className="text-text-primary text-base font-medium">
            {t("session.attempts")}
          </Text>
          <View className="flex-row items-center gap-4">
            <Pressable
              testID="attempts-decrement"
              onPress={() => setAttempts((prev) => Math.max(status === "send" ? 2 : 1, prev - 1))}
              disabled={attempts <= (status === "send" ? 2 : 1) || status === "flash"}
              accessibilityRole="button"
              accessibilityLabel={t("session.decreaseAttempts")}
              className={`w-10 h-10 rounded-lg items-center justify-center border border-border ${
                attempts <= (status === "send" ? 2 : 1) || status === "flash" ? "opacity-30" : ""
              }`}
            >
              <Minus size={18} color="#EAEAF0" />
            </Pressable>
            <Text testID="attempts-count" className="text-text-primary text-lg font-bold min-w-[24px] text-center">
              {attempts}
            </Text>
            <Pressable
              testID="attempts-increment"
              onPress={() => setAttempts((prev) => Math.min(99, prev + 1))}
              disabled={status === "flash"}
              accessibilityRole="button"
              accessibilityLabel={t("session.increaseAttempts")}
              className={`w-10 h-10 rounded-lg items-center justify-center border border-border ${
                status === "flash" ? "opacity-30" : ""
              }`}
            >
              <Plus size={18} color="#EAEAF0" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ═══ GROUP 2: Share ════════════════════════════════════════ */}
      <View className="bg-surface rounded-xl p-4 mx-4 mb-4">
        <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">
          {t("ascent.share")}
        </Text>

        {/* Comment input */}
        <TextInput
          testID="comment-input"
          value={comment}
          onChangeText={(text) => setComment(text.slice(0, MAX_COMMENT_LENGTH))}
          placeholder={t("route.commentsPlaceholder")}
          placeholderTextColor="#6B7280"
          multiline
          numberOfLines={4}
          maxLength={MAX_COMMENT_LENGTH}
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
        <Text testID="char-counter" className="text-text-secondary text-xs mt-1 text-right">
          {comment.length}/{MAX_COMMENT_LENGTH}
        </Text>

        {/* Video upload */}
        <View className="mt-3">
          <VideoUploadButton routeId={routeId as string} />
        </View>
      </View>

      {/* ═══ GROUP 3: Your Opinion ═════════════════════════════════ */}
      <View className="bg-surface rounded-xl p-4 mx-4 mb-4">
        <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">
          {t("ascent.yourOpinion")}
        </Text>

        {/* Perceived grade slider */}
        <Text className="text-text-primary text-sm font-medium mb-2">
          {t("route.whatGrade")}
        </Text>
        <GradeSlider
          value={perceivedGrade ?? route?.canonical_grade ?? 0}
          onChange={setPerceivedGrade}
        />

        {/* Quality star rating */}
        <Text className="text-text-primary text-sm font-medium mt-4 mb-2">
          {t("route.howWouldYouRate")}
        </Text>
        <StarRating value={rating} onChange={setRating} />

        {/* Style tags */}
        <Text className="text-text-primary text-sm font-medium mt-4 mb-2">
          {t("route.climbingStyle")}
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
                style={{ opacity: isSelected ? 1 : 0.4 }}
              >
                <Badge label={tag.label} variant="tag" color={tag.color} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Submit Button ─────────────────────────────────────────── */}
      <View className="px-4 pb-8">
        <Button
          label={t("route.addAscent")}
          onPress={handleSubmit}
          size="lg"
          disabled={status === null}
          loading={logAscent.isPending}
          testID="submit-ascent-button"
        />
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
