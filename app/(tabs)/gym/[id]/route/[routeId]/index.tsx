/**
 * Route Detail Screen — Full View of a Single Climbing Route
 *
 * This is the destination when a user taps a RouteCard on the Gym Routes
 * list. It displays all metadata about the route (grade, color, wall section,
 * setter, status), an "Add Ascent" CTA, and a video submissions section
 * (empty state until Phase 12).
 *
 * DATA FLOW:
 * 1. `useLocalSearchParams()` extracts gymId and routeId from the URL
 *    (/gym/[id]/route/[routeId])
 * 2. `useRouteDetail(routeId)` fetches the route with setter profile via
 *    TanStack Query → routeService.getRouteById → PostgREST → Postgres (RLS)
 * 3. `canonicalToDisplay()` converts the stored integer grade to a human-
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

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Star, ChevronLeft } from "lucide-react-native";
import { useRouteDetail, useRouteRating } from "@/hooks/useRoutes";
import { useRouteFeedback, useVoteFeedback, useDeleteFeedback } from "@/hooks/useFeedback";
import { useAuth } from "@/hooks/useAuth";
import { canonicalToDisplay } from "@/utils/grades";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { BetaVideoPlayer } from "@/components/routes/BetaVideoPlayer";
import { FeedbackItem } from "@/components/social/FeedbackItem";
import { ReportSheet } from "@/components/social/ReportSheet";
import { useRouteMedia, useLikeMedia, useDeleteMedia } from "@/hooks/useMedia";
import { useSessionStore } from "@/stores/sessionStore";
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

  // Screen width for sizing the color swatch to match the profile avatar
  // (35% of screen width, clamped 80–160px — same formula as Avatar lg).
  const { width: screenWidth } = useWindowDimensions();
  const swatchSize = Math.min(160, Math.max(80, Math.round(screenWidth * 0.35)));

  // Fetch route data with setter profile info via TanStack Query.
  // This is the same hook used by any component needing route detail —
  // the data is cached per routeId, so navigating back and forth is instant.
  const { data: route, isLoading, error } = useRouteDetail(routeId);

  // Average quality/enjoyment rating from user submissions.
  const { averageRating, ratingCount } = useRouteRating(routeId);

  // Current user ID for display purposes (e.g., highlighting own tips).
  const { user } = useAuth();

  // Beta tips — the composer lives on the ascent form so tips are
  // submitted in the context of logging a climb.
  const { feedback, userVotes } = useRouteFeedback(routeId);
  const { mutate: voteFeedback } = useVoteFeedback(routeId);
  const { mutate: deleteFeedback } = useDeleteFeedback(routeId);

  // Beta videos — with like support and sorting.
  // userLikes is a Set<string> of media IDs the current user has liked,
  // used to show filled/outlined hearts per video.
  const { media, userLikes } = useRouteMedia(routeId);
  const { mutate: likeMedia } = useLikeMedia(routeId);
  const { mutate: deleteMedia } = useDeleteMedia(routeId);

  // Sort control for the video list. "newest" keeps the default DB order
  // (created_at desc). "most_liked" sorts by likes_count desc.
  const [videoSort, setVideoSort] = useState<'newest' | 'most_liked'>('newest');

  // Accordion state — tracks which video (by media ID) is currently expanded.
  // Only one video can be expanded at a time; null means all collapsed.
  const [expandedMediaId, setExpandedMediaId] = useState<string | null>(null);

  // Tracks which item the user wants to report (video or feedback tip).
  // When set, the ReportSheet opens with this target. null = sheet hidden.
  const [reportTarget, setReportTarget] = useState<{
    id: string;
    type: "video" | "feedback";
  } | null>(null);

  // Memoize sorted media to avoid re-sorting on every render.
  // For "newest", the data is already sorted from the DB query.
  // For "most_liked", sort by likes_count descending (stable sort
  // preserves original order for items with equal counts).
  const sortedMedia = useMemo(() => {
    if (videoSort === 'most_liked') {
      return [...media].sort((a: any, b: any) => (b.likes_count ?? 0) - (a.likes_count ?? 0));
    }
    return media;
  }, [media, videoSort]);

  // Handle vote/unvote on a beta tip. If the user taps the same vote
  // direction they already have, toggle it off (unvote). Otherwise cast
  // or switch the vote.
  const handleVote = useCallback(
    (feedbackId: string, direction: "up" | "down") => {
      const currentVote = userVotes[feedbackId];
      voteFeedback({
        feedbackId,
        direction: currentVote === direction ? null : direction,
      });
    },
    [userVotes, voteFeedback]
  );

  // Confirmation dialog before deleting a beta tip.
  const confirmDeleteFeedback = useCallback(
    (feedbackId: string) => {
      Alert.alert(
        t("feedback.deleteTip"),
        t("feedback.deleteConfirm"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: () => deleteFeedback({ feedbackId }),
          },
        ]
      );
    },
    [deleteFeedback, t]
  );

  // Confirmation dialog before deleting a video. Prevents accidental
  // taps from immediately removing the user's upload.
  const confirmDelete = useCallback((mediaId: string) => {
    Alert.alert(
      t("video.deleteVideo"),
      t("video.deleteConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMedia({ mediaId }),
        },
      ]
    );
  }, [deleteMedia, t]);

  // Check if the user has an active session at this gym.
  // The "Add Ascent" button should only appear when the climber is
  // actively climbing at this gym — you can't log an ascent without
  // a session to attach it to.
  const sessionActive = useSessionStore((s) => s.isActive);
  const sessionGymId = useSessionStore((s) => s.gymId);
  const hasActiveSessionAtGym = sessionActive && sessionGymId === id;

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

  // Community grade — median of user-submitted perceived grades.
  // Computed by a Postgres trigger after each ascent (requires ≥5 submissions).
  const communityGrade = route.consensus_grade != null
    ? canonicalToDisplay(route.consensus_grade, "v-scale")
    : null;

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
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header — back button + route name */}
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
          {route.name ?? t("route.detail")}
        </Text>
      </View>

    <ScrollView className="flex-1" testID="route-detail-screen">
      {/* ── Route Header ─────────────────────────────────────────── */}
      <View className="flex-row p-4 gap-4">
        {/* Color swatch — a large rounded rectangle filled with the route's
            hold color. Indoor climbing routes are identified by hold color
            (all holds of the same color belong to the same route). This
            large swatch acts as a visual identifier in place of a photo. */}
        <View
          testID="color-swatch"
          className="rounded-xl"
          style={{
            backgroundColor: route.color || "#6366f1",
            width: swatchSize,
            height: swatchSize,
          }}
        />

        {/* Metadata column — route name, grade, dates, setter, status */}
        <View className="flex-1 justify-center gap-1">
          {/* Name row — route name left, star rating right */}
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-bold text-text-primary flex-1" numberOfLines={2}>
              {route.name}
            </Text>
            {ratingCount > 0 && (
              <View testID="average-rating" className="flex-row items-center gap-1 ml-2">
                <Star size={18} color="#F59E0B" fill="#F59E0B" />
                <Text className="text-text-primary text-base font-semibold">
                  {averageRating}
                </Text>
                <Text className="text-text-secondary text-sm">
                  ({ratingCount})
                </Text>
              </View>
            )}
          </View>

          {/* Grade · Community grade */}
          <View className="flex-row items-center flex-wrap gap-1">
            <Text className="text-text-secondary text-base">
              {displayGrade}
            </Text>
            {communityGrade && (
              <>
                <Text className="text-text-secondary text-base">·</Text>
                <Text testID="community-grade" className="text-accent text-base">
                  {t("route.communityGrade")} {communityGrade}
                </Text>
              </>
            )}
          </View>

          {/* Wall · Setter — combined into one row. Either may be absent;
              the dot separator only appears when both are present. */}
          {(route.wall_section || route.setter?.display_name) && (
            <Text className="text-text-secondary text-sm">
              {[route.wall_section, route.setter?.display_name]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}

          {/* Date + status badge on the same row: date left, badge right.
              Keeps the footer compact instead of stacking two single-item rows. */}
          <View className="flex-row items-center justify-between mt-1">
            {setDate && (
              <Text className="text-text-secondary text-sm">
                {setDate}
              </Text>
            )}
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
      {/* "Add Ascent" button only appears when the user has an active
          session at this gym. Ascents belong to sessions, so there's no
          point showing the CTA when the climber isn't checked in. */}
      {hasActiveSessionAtGym && (
        <View className="px-4 mb-4">
          <Button
            label={t("route.addAscent")}
            variant="outline"
            onPress={() => {
              router.push(`/(tabs)/gym/${id}/route/${routeId}/ascent` as any);
            }}
            testID="add-ascent-button"
          />
        </View>
      )}

      {/* ── Beta Tips ──────────────────────────────────────────────── */}
      {/* Shows tips from the community with voting, delete, and report.
          The composer lives on the ascent form so tips are submitted
          in the context of logging a climb. */}
      <View className="px-4 mb-4">
        <Text className="text-lg font-bold text-text-primary mb-2">
          {t("route.betaTips")}{feedback.length > 0 ? ` (${feedback.length})` : ""}
        </Text>
        {feedback.length > 0 ? (
          feedback.map((item: any) => (
            <FeedbackItem
              key={item.id}
              feedback={item}
              userVote={userVotes[item.id] ?? null}
              currentUserId={user?.id ?? ""}
              onVote={handleVote}
              onDelete={confirmDeleteFeedback}
              onReport={(id) => setReportTarget({ id, type: "feedback" })}
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

      {/* ── Video Submissions ──────────────────────────────────────── */}
      {/* Shows existing beta videos with like buttons and optional sort.
          Upload is on the ascent form; delete is owner-only. */}
      <View className="px-4 mb-4">
        <Text className="text-lg font-bold text-text-primary mb-2">
          {t("route.videoSubmissions")}
        </Text>

        {/* Sort toggle pills — only shown when there are 2+ videos.
            With 0-1 videos sorting is pointless and adds visual noise. */}
        {media.length >= 2 && (
          <View className="flex-row gap-2 mb-3" testID="sort-controls">
            <Pressable
              testID="sort-newest"
              onPress={() => { setVideoSort('newest'); setExpandedMediaId(null); }}
              className={`px-3 py-1 rounded-full ${
                videoSort === 'newest' ? 'bg-accent' : 'bg-surface'
              }`}
            >
              <Text className={videoSort === 'newest' ? 'text-white font-medium' : 'text-text-secondary'}>
                {t("video.sortNewest")}
              </Text>
            </Pressable>
            <Pressable
              testID="sort-most-liked"
              onPress={() => { setVideoSort('most_liked'); setExpandedMediaId(null); }}
              className={`px-3 py-1 rounded-full ${
                videoSort === 'most_liked' ? 'bg-accent' : 'bg-surface'
              }`}
            >
              <Text className={videoSort === 'most_liked' ? 'text-white font-medium' : 'text-text-secondary'}>
                {t("video.sortMostLiked")}
              </Text>
            </Pressable>
          </View>
        )}

        <FlatList
          data={sortedMedia}
          extraData={[userLikes, expandedMediaId]}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BetaVideoPlayer
              url={item.url}
              uploaderName={item.profile?.display_name ?? "Unknown"}
              uploaderAvatarUrl={item.profile?.avatar_url ?? undefined}
              uploadDate={new Date(item.created_at).toLocaleDateString()}
              isOwner={item.user_id === user?.id}
              onDelete={() => confirmDelete(item.id)}
              onReport={item.user_id !== user?.id ? () => setReportTarget({ id: item.id, type: "video" }) : undefined}
              likesCount={item.likes_count ?? 0}
              isLiked={userLikes.has(item.id)}
              onLike={() => likeMedia({ mediaId: item.id, liked: userLikes.has(item.id) })}
              isExpanded={expandedMediaId === item.id}
              onToggleExpand={() => setExpandedMediaId(prev => prev === item.id ? null : item.id)}
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
    </ScrollView>

      {/* ReportSheet — slides up when a user taps the Flag icon on
          another user's video. Targets the video's media ID so the
          content_reports row links back to the specific video. */}
      <ReportSheet
        visible={!!reportTarget}
        onDismiss={() => setReportTarget(null)}
        targetType={reportTarget?.type ?? "video"}
        targetId={reportTarget?.id ?? ""}
      />
    </SafeAreaView>
  );
}
