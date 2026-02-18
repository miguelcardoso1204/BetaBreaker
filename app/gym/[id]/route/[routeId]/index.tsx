/**
 * Route Detail Screen — Full View of a Single Climbing Route
 *
 * This is the destination when a user taps a RouteCard on the Gym Routes
 * list. It displays all metadata about the route (grade, color, wall section,
 * setter, status), a favorite toggle star, an "Add Ascent" CTA, and a
 * video submissions section (empty state until Phase 12).
 *
 * DATA FLOW:
 * 1. `useLocalSearchParams()` extracts gymId and routeId from the URL
 *    (/gym/[id]/route/[routeId])
 * 2. `useRouteDetail(routeId)` fetches the route with setter profile via
 *    TanStack Query → routeService.getRouteById → PostgREST → Postgres (RLS)
 * 3. `useIsFavorite(routeId)` checks if the current user has favorited
 *    this route (drives the star icon fill state)
 * 4. `useToggleFavorite(routeId)` provides the mutation to add/remove favorite
 * 5. `canonicalToDisplay()` converts the stored integer grade to a human-
 *    readable string (e.g., canonical 10 → "V4" in V-scale)
 *
 * STATES:
 * - Loading: centered ActivityIndicator while TanStack Query fetches
 * - Error: centered error message if the fetch fails
 * - Data: scrollable route detail with all sections
 *
 * LAYOUT:
 * ScrollView
 *   RouteHeader: color swatch + metadata column (name, grade, setter, etc.)
 *   StatusBanner: conditional "Retiring Soon" warning
 *   ActionSection: "Add Ascent" button → navigates to Full Ascent Form
 *   VideoSubmissionsSection: heading + empty state (until Phase 12)
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react-native";
import { useRouteDetail } from "@/hooks/useRoutes";
import { useIsFavorite, useToggleFavorite } from "@/hooks/useSavedRoutes";
import {
  useRouteFeedback,
  useCreateFeedback,
  useDeleteFeedback,
  useVoteFeedback,
} from "@/hooks/useFeedback";
import { useAuth } from "@/hooks/useAuth";
import { canonicalToDisplay } from "@/utils/grades";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FeedbackItem } from "@/components/social/FeedbackItem";
import { FeedbackComposer } from "@/components/social/FeedbackComposer";
import { ReportSheet } from "@/components/social/ReportSheet";
import { VideoUploadButton } from "@/components/routes/VideoUploadButton";
import { BetaVideoPlayer } from "@/components/routes/BetaVideoPlayer";
import { useRouteMedia, useDeleteMedia } from "@/hooks/useMedia";
import { mediaService } from "@/services/media.service";
import type { RouteStatus } from "@/lib/constants";

/**
 * Maps route status values to Badge variant colors.
 *
 * "active" routes get a green "success" badge — they're on the wall and
 * ready to climb. "retiring_soon" gets an amber "warning" badge to signal
 * urgency. Other statuses (draft, archived) use the default purple.
 */
const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "default"> = {
  active: "success",
  retiring_soon: "warning",
};

/**
 * Formats a status string for display by capitalizing and replacing
 * underscores with spaces: "retiring_soon" → "Retiring Soon".
 *
 * Why not store display names in a constant?
 * Route statuses come from the database as snake_case strings. This
 * lightweight formatter avoids maintaining a parallel mapping and
 * handles any future status values automatically.
 */
function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function RouteDetailScreen() {
  // i18n hook — provides t() for translating hardcoded strings.
  const { t } = useTranslation();

  // Extract both the gymId (id) and routeId from the URL path.
  // Expo Router's file-based routing maps /gym/[id]/route/[routeId]
  // to this component with both params available.
  const { id, routeId } = useLocalSearchParams<{
    id: string;
    routeId: string;
  }>();

  // Router for navigating to the Full Ascent Form sub-route.
  const router = useRouter();

  // Fetch route data with setter profile info via TanStack Query.
  // This is the same hook used by any component needing route detail —
  // the data is cached per routeId, so navigating back and forth is instant.
  const { data: route, isLoading, error } = useRouteDetail(routeId);

  // Favorite state: whether the star icon should be filled or outlined.
  const { isFavorite } = useIsFavorite(routeId);
  const { mutate: toggleFavorite } = useToggleFavorite(routeId);

  // Beta tips (feedback) — text-based climbing advice from the community.
  // useRouteFeedback fetches tips + the current user's votes in one query.
  const { user } = useAuth();
  const { feedback, userVotes } = useRouteFeedback(routeId);
  const { mutate: createFeedback, isPending: isCreating } =
    useCreateFeedback(routeId);
  const { mutate: deleteFeedback } = useDeleteFeedback(routeId);
  const { mutate: voteFeedback } = useVoteFeedback(routeId);

  // Beta video media — videos uploaded by the community showing how
  // to climb this route. useRouteMedia fetches the list, useDeleteMedia
  // provides a mutation for removing your own uploads.
  const { media } = useRouteMedia(routeId);
  const { mutate: deleteMedia } = useDeleteMedia(routeId);

  // ── Report sheet state ────────────────────────────────────────────
  // Tracks whether the ReportSheet is visible and which feedback ID
  // is being reported. Set by the Flag button on each FeedbackItem.
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  /**
   * Handle vote button presses on a feedback item.
   *
   * If the user taps the same vote direction they already have active,
   * it's a toggle-off (unvote). Otherwise it's a new vote or direction switch.
   * The hook's mutation handles the actual service call.
   */
  function handleVote(feedbackId: string, direction: "up" | "down") {
    const currentVote = userVotes[feedbackId];
    if (currentVote === direction) {
      // Tapping the same button again → remove the vote
      voteFeedback({ feedbackId, direction: null });
    } else {
      // New vote or switching direction
      voteFeedback({ feedbackId, direction });
    }
  }

  // ── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background" testID="loading-indicator">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4" testID="error-state">
        <Text className="text-error text-center">
          {error.message || t("route.failedToLoad")}
        </Text>
      </View>
    );
  }

  // ── No data guard ──────────────────────────────────────────────
  // This shouldn't happen in normal flow (useRouteDetail errors if
  // the route doesn't exist), but TypeScript needs the null check.
  if (!route) return null;

  // Convert the canonical integer grade to a display string.
  // Hardcoded to "v-scale" until user preferences are implemented.
  const displayGrade = canonicalToDisplay(route.canonical_grade, "v-scale");

  // Cast status for type-safe badge variant lookup.
  const status = route.status as RouteStatus;

  // Format the set date for display (e.g., "Jan 15, 2026").
  const setDate = route.created_at
    ? new Date(route.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <ScrollView className="flex-1 bg-background" testID="route-detail-screen">
      {/* ── Route Header ─────────────────────────────────────────── */}
      <View className="flex-row p-4 gap-4">
        {/* Color swatch — a large rounded rectangle filled with the route's
            hold color. Indoor climbing routes are identified by hold color
            (all holds of the same color belong to the same route). This
            large swatch acts as a visual identifier in place of a photo. */}
        <View
          testID="color-swatch"
          className="w-28 h-28 rounded-xl"
          style={{ backgroundColor: route.color || "#6366f1" }}
        />

        {/* Metadata column — route name, grade, dates, setter, status */}
        <View className="flex-1 justify-center gap-1">
          {/* Name row with favorite toggle */}
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-bold text-text-primary flex-1" numberOfLines={2}>
              {route.name}
            </Text>
            {/* Star IconButton toggles the favorite state.
                The `color` prop changes based on isFavorite to give visual
                feedback: gold when favorited, white when not. */}
            <IconButton
              icon={Star}
              label={isFavorite ? t("route.unfavorite") : t("route.favorite")}
              onPress={() => toggleFavorite()}
              color={isFavorite ? "#F59E0B" : "#FFFFFF"}
              testID="favorite-button"
            />
          </View>

          {/* Grade — converted from canonical integer to display string */}
          <Text className="text-text-secondary text-base">
            {t("route.grade")} {displayGrade}
          </Text>

          {/* Set date — when the route was created/set on the wall */}
          {setDate && (
            <Text className="text-text-secondary text-sm">
              {t("route.setOn")} {setDate}
            </Text>
          )}

          {/* Wall section — helps climbers physically locate the route */}
          {route.wall_section && (
            <Text className="text-text-secondary text-sm">
              {t("route.wall")} {route.wall_section}
            </Text>
          )}

          {/* Setter name — who set (created) this route */}
          {route.setter?.display_name && (
            <Text className="text-text-secondary text-sm">
              {t("route.setter")} {route.setter.display_name}
            </Text>
          )}

          {/* Status badge — shows route lifecycle state with color coding */}
          <View className="flex-row mt-1">
            <Badge
              label={formatStatus(status)}
              variant={STATUS_BADGE_VARIANT[status] || "default"}
              testID="status-badge"
            />
          </View>
        </View>
      </View>

      {/* ── Status Banner (conditional) ──────────────────────────── */}
      {/* When a route is "retiring_soon", show a prominent warning banner
          so climbers know to attempt it before it's taken off the wall.
          This is separate from the small badge — the banner is more
          attention-grabbing and includes action-oriented messaging. */}
      {status === "retiring_soon" && (
        <View
          testID="status-banner"
          className="mx-4 mb-4 p-3 rounded-lg bg-warning/20"
        >
          <Text className="text-warning text-center font-semibold">
            {t("route.retiringSoon")}
          </Text>
        </View>
      )}

      {/* ── Action Section ───────────────────────────────────────── */}
      {/* "Add Ascent" button navigates to the Full Ascent Form screen.
          The form is a sub-route at /gym/[id]/route/[routeId]/ascent,
          which provides star rating, style tags, comments, and video
          upload (placeholder) in addition to the basic status/attempts. */}
      <View className="px-4 mb-4">
        <Button
          label={t("route.addAscent")}
          variant="outline"
          onPress={() => {
            router.push(`/gym/${id}/route/${routeId}/ascent`);
          }}
          testID="add-ascent-button"
        />
      </View>

      {/* ── Beta Tips Section ──────────────────────────────────────── */}
      {/* Text-based climbing tips from the community. Users can post
          tips and upvote/downvote to surface the best advice. The list
          is sorted by score descending (best tips first). */}
      <View className="px-4 mb-4">
        <Text className="text-lg font-bold text-text-primary mb-2">
          {t("route.betaTips")}{feedback.length > 0 ? ` (${feedback.length})` : ""}
        </Text>

        {/* Composer — authenticated users can submit new tips */}
        {user && (
          <FeedbackComposer
            onSubmit={(body) => createFeedback({ body })}
            isSubmitting={isCreating}
          />
        )}

        {/* Tip list or empty state */}
        {feedback.length > 0 ? (
          feedback.map((item: any) => (
            <FeedbackItem
              key={item.id}
              feedback={item}
              userVote={userVotes[item.id] ?? null}
              currentUserId={user?.id ?? ""}
              onVote={handleVote}
              onDelete={(feedbackId) => deleteFeedback({ feedbackId })}
              onReport={(feedbackId) => setReportTarget(feedbackId)}
            />
          ))
        ) : (
          <View className="items-center py-8" testID="empty-feedback">
            <Text className="text-text-secondary text-center">
              {t("route.noBetaTips")}
            </Text>
          </View>
        )}
      </View>

      {/* ── Video Submissions Section ────────────────────────────── */}
      {/* Beta videos are short clips showing how to climb a route.
          Each video is rendered by BetaVideoPlayer, which uses lazy-loaded
          expo-video playback. Videos start as thumbnails and only buffer
          when the user taps play — preventing excessive network usage. */}
      <View className="px-4 mb-4">
        <Text className="text-lg font-bold text-text-primary mb-2">
          {t("route.videoSubmissions")}
        </Text>

        {/* Upload button at the top of the section for quick access */}
        <View className="mb-4">
          <VideoUploadButton routeId={routeId} />
        </View>

        {/* FlatList renders BetaVideoPlayer for each uploaded video.
            scrollEnabled={false} because this FlatList is nested inside
            the parent ScrollView — we want the lazy renderItem optimization
            without scroll conflicts. Each item gets its own video player
            with lazy initialization (player only created on tap). */}
        <FlatList
          data={media}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BetaVideoPlayer
              url={item.url}
              uploaderName={item.profile?.display_name ?? "Unknown"}
              uploadDate={new Date(item.created_at).toLocaleDateString()}
              isOwner={item.user_id === user?.id}
              onDelete={() =>
                deleteMedia({
                  mediaId: item.id,
                  storagePath: mediaService.extractStoragePath(item.url),
                })
              }
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-8" testID="empty-videos">
              <Text className="text-text-secondary text-center">
                {t("route.noVideos")}
              </Text>
            </View>
          }
          scrollEnabled={false}
        />
      </View>

      {/* ── Report Sheet ──────────────────────────────────────────── */}
      {/* Slides up when a user taps the Flag icon on a FeedbackItem.
          The reportTarget state tracks which feedback ID is being reported.
          Dismissing clears the state, hiding the sheet. */}
      <ReportSheet
        visible={reportTarget !== null}
        onDismiss={() => setReportTarget(null)}
        targetType="feedback"
        targetId={reportTarget ?? ""}
      />
    </ScrollView>
  );
}
