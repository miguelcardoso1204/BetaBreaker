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
 *   ActionSection: "Add Ascent" button (placeholder until Phase 5)
 *   VideoSubmissionsSection: heading + empty state (until Phase 12)
 */

import React from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Star } from "lucide-react-native";
import { useRouteDetail } from "@/hooks/useRoutes";
import { useIsFavorite, useToggleFavorite } from "@/hooks/useSavedRoutes";
import { canonicalToDisplay } from "@/utils/grades";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
  // Extract both the gymId (id) and routeId from the URL path.
  // Expo Router's file-based routing maps /gym/[id]/route/[routeId]
  // to this component with both params available.
  const { routeId } = useLocalSearchParams<{
    id: string;
    routeId: string;
  }>();

  // Fetch route data with setter profile info via TanStack Query.
  // This is the same hook used by any component needing route detail —
  // the data is cached per routeId, so navigating back and forth is instant.
  const { data: route, isLoading, error } = useRouteDetail(routeId);

  // Favorite state: whether the star icon should be filled or outlined.
  const { isFavorite } = useIsFavorite(routeId);
  const { mutate: toggleFavorite } = useToggleFavorite(routeId);

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
          {error.message || "Failed to load route"}
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
              label={isFavorite ? "Unfavorite route" : "Favorite route"}
              onPress={() => toggleFavorite()}
              color={isFavorite ? "#F59E0B" : "#FFFFFF"}
              testID="favorite-button"
            />
          </View>

          {/* Grade — converted from canonical integer to display string */}
          <Text className="text-text-secondary text-base">
            Grade: {displayGrade}
          </Text>

          {/* Set date — when the route was created/set on the wall */}
          {setDate && (
            <Text className="text-text-secondary text-sm">
              Set on: {setDate}
            </Text>
          )}

          {/* Wall section — helps climbers physically locate the route */}
          {route.wall_section && (
            <Text className="text-text-secondary text-sm">
              Wall: {route.wall_section}
            </Text>
          )}

          {/* Setter name — who set (created) this route */}
          {route.setter?.display_name && (
            <Text className="text-text-secondary text-sm">
              Setter: {route.setter.display_name}
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
            This route is retiring soon!
          </Text>
        </View>
      )}

      {/* ── Action Section ───────────────────────────────────────── */}
      {/* "Add Ascent" button — the primary CTA for logging a send.
          Phase 5 (Tick-Logging) will wire this to real session management.
          For now, it shows a placeholder Alert explaining the feature. */}
      <View className="px-4 mb-4">
        <Button
          label="Add Ascent"
          variant="outline"
          onPress={() => {
            Alert.alert(
              "Coming Soon",
              "Start a session first to log ascents. Session management will be available in a future update."
            );
          }}
          testID="add-ascent-button"
        />
      </View>

      {/* ── Video Submissions Section ────────────────────────────── */}
      {/* Beta videos are short clips showing how to climb a route
          ("beta" is climbing slang for route information/technique).
          The beta_videos table doesn't exist yet (Phase 12), so we
          render the section heading and an empty state message.
          Phase 12 will replace this with a FlatList of video thumbnails. */}
      <View className="px-4 mb-4">
        <Text className="text-lg font-bold text-text-primary mb-2">
          Video Submissions
        </Text>
        <View className="items-center py-8" testID="empty-videos">
          <Text className="text-text-secondary text-center">
            No beta videos yet — be the first to share!
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
