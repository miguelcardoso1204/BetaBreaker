/**
 * Logbook Index Screen — Session History + Saved Routes
 *
 * This is the main logbook screen with two segments:
 *   1. "Sessions" — chronological list of past climbing sessions (default)
 *   2. "Saved" — list of bookmarked/favorited routes
 *
 * Users switch segments via a simple tappable control at the top. Each
 * segment fetches its own data via TanStack Query hooks.
 *
 * THREE STATES PER SEGMENT:
 *   - Loading: centered ActivityIndicator while data fetches
 *   - Empty: friendly message when there's nothing to show
 *   - Data: FlatList of tappable cards
 *
 * NAVIGATION:
 * Tapping a session card navigates to the detail screen ([date].tsx)
 * via router.push with the date as a route param.
 *
 * DATA FLOW:
 *   useSessionHistory() → sessionsService.getSessionHistory() → PostgREST
 *   useSavedRoutesList() → savedRoutesService.getUserSavedRoutes() → PostgREST
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { BookOpen, Bookmark } from "lucide-react-native";
import i18n from "@/lib/i18n";
import { useSessionHistory } from "@/hooks/useSessions";
import { useSavedRoutesList } from "@/hooks/useSavedRoutes";
import { canonicalToDisplay } from "@/utils/grades";
import { Badge } from "@/components/ui/Badge";

// ── Types ──────────────────────────────────────────────────────────

/** The two segments available on the logbook screen. */
type Segment = "sessions" | "saved";

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD date string to a user-friendly display format.
 *
 * Uses Intl.DateTimeFormat under the hood via toLocaleDateString.
 * Example: "2026-02-09" → "Feb 9, 2026"
 *
 * Why parse manually instead of `new Date(dateStr)`?
 * When you pass "2026-02-09" to `new Date()`, some environments interpret
 * it as UTC midnight, which could shift the date backwards in negative
 * UTC offsets. Adding "T12:00:00" ensures we land on the correct date
 * regardless of timezone.
 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(i18n.language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Component ──────────────────────────────────────────────────────

export default function LogbookScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // Track which segment is active — "sessions" is the default view
  const [segment, setSegment] = useState<Segment>("sessions");

  // Fetch data for both segments. TanStack Query only runs the queryFn
  // when the hook mounts, so both are fetched regardless of which
  // segment is visible. This means switching tabs is instant (cached).
  const sessionHistory = useSessionHistory();
  const savedRoutes = useSavedRoutesList();

  return (
    <View className="flex-1 bg-background">
      {/* ── Segment Control ──────────────────────────────────────── */}
      {/* Two tappable pills that switch between sessions and saved routes.
          The active segment gets a highlighted background (accent color)
          while the inactive one uses the card background for contrast. */}
      <View className="flex-row mx-4 mt-4 mb-2 bg-card rounded-lg p-1">
        <Pressable
          testID="segment-sessions"
          onPress={() => setSegment("sessions")}
          className={`flex-1 py-2 rounded-md items-center ${
            segment === "sessions" ? "bg-accent" : ""
          }`}
        >
          <Text
            className={`font-semibold ${
              segment === "sessions" ? "text-white" : "text-text-secondary"
            }`}
          >
            {t("logbook.sessions")}
          </Text>
        </Pressable>

        <Pressable
          testID="segment-saved"
          onPress={() => setSegment("saved")}
          className={`flex-1 py-2 rounded-md items-center ${
            segment === "saved" ? "bg-accent" : ""
          }`}
        >
          <Text
            className={`font-semibold ${
              segment === "saved" ? "text-white" : "text-text-secondary"
            }`}
          >
            {t("logbook.saved")}
          </Text>
        </Pressable>
      </View>

      {/* ── Segment Content ──────────────────────────────────────── */}
      {/* Conditionally render the active segment's content. Each segment
          handles its own loading/empty/data states independently. */}
      {segment === "sessions" ? (
        <SessionsSegment
          data={sessionHistory.data}
          isLoading={sessionHistory.isLoading}
          onPressSession={(date) =>
            router.push({
              pathname: "/(tabs)/logbook/[date]" as any,
              params: { date },
            })
          }
        />
      ) : (
        <SavedSegment
          data={savedRoutes.data}
          isLoading={savedRoutes.isLoading}
        />
      )}
    </View>
  );
}

// ── Sessions Segment ─────────────────────────────────────────────

interface SessionsSegmentProps {
  data: any[] | undefined;
  isLoading: boolean;
  onPressSession: (date: string) => void;
}

/**
 * Sessions segment — renders the session history list.
 *
 * Each card shows the date, ascent count, sends/flashes breakdown,
 * and the top grade climbed that day. Tapping navigates to the
 * session detail screen for that date.
 */
function SessionsSegment({
  data,
  isLoading,
  onPressSession,
}: SessionsSegmentProps) {
  const { t } = useTranslation();
  // Loading state — centered spinner
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator
          testID="loading-indicator"
          size="large"
          color="#7C3AED"
        />
      </View>
    );
  }

  // Empty state — friendly message encouraging the user to start climbing
  if (!data || data.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <BookOpen size={64} color="#6B7280" />
        <Text className="text-text-primary text-lg font-semibold mt-4 text-center">
          {t("logbook.noSessions")}
        </Text>
        <Text className="text-text-secondary text-sm mt-2 text-center">
          {t("logbook.startSessionPrompt")}
        </Text>
      </View>
    );
  }

  // Data state — scrollable list of session cards
  return (
    <FlatList
      testID="session-list"
      data={data}
      keyExtractor={(item) => item.date}
      contentContainerClassName="px-4 pb-4"
      renderItem={({ item }) => (
        <Pressable
          testID={`session-card-${item.date}`}
          onPress={() => onPressSession(item.date)}
          className="bg-card rounded-xl p-4 mb-3"
        >
          {/* Top row: date + top grade badge */}
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-text-primary font-semibold text-base">
              {formatDate(item.date)}
            </Text>
            {item.topGrade != null && (
              <Badge
                label={canonicalToDisplay(item.topGrade, "v-scale")}
                variant="default"
                testID={`top-grade-${item.date}`}
              />
            )}
          </View>

          {/* Bottom row: ascent count + sends/flashes breakdown.
              i18next _one/_other suffixes handle pluralization. */}
          <View className="flex-row items-center gap-3">
            <Text className="text-text-secondary text-sm">
              {t("logbook.ascentCount", { count: item.ascentCount })}
            </Text>
            {item.sends > 0 && (
              <Text className="text-text-secondary text-sm">
                {t("logbook.sendCount", { count: item.sends })}
              </Text>
            )}
            {item.flashes > 0 && (
              <Text className="text-text-secondary text-sm">
                {t("logbook.flashCount", { count: item.flashes })}
              </Text>
            )}
          </View>
        </Pressable>
      )}
    />
  );
}

// ── Saved Segment ────────────────────────────────────────────────

interface SavedSegmentProps {
  data: any[] | undefined;
  isLoading: boolean;
}

/**
 * Saved segment — renders the user's bookmarked routes.
 *
 * Each card shows the route name, grade, and save type badge.
 * Currently read-only — tapping to navigate to route detail will
 * be added when route detail deep-linking is implemented (Phase 16).
 */
function SavedSegment({ data, isLoading }: SavedSegmentProps) {
  const { t } = useTranslation();
  // Loading state — centered spinner
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator
          testID="saved-loading-indicator"
          size="large"
          color="#7C3AED"
        />
      </View>
    );
  }

  // Empty state — friendly message encouraging the user to save routes
  if (!data || data.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Bookmark size={64} color="#6B7280" />
        <Text className="text-text-primary text-lg font-semibold mt-4 text-center">
          {t("logbook.noSavedRoutes")}
        </Text>
        <Text className="text-text-secondary text-sm mt-2 text-center">
          {t("logbook.saveRoutesPrompt")}
        </Text>
      </View>
    );
  }

  // Data state — scrollable list of saved route cards
  return (
    <FlatList
      testID="saved-routes-list"
      data={data}
      keyExtractor={(item) => item.id}
      contentContainerClassName="px-4 pb-4"
      renderItem={({ item }) => (
        <View className="bg-card rounded-xl p-4 mb-3">
          {/* Top row: route name + save type badge */}
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-text-primary font-semibold text-base flex-1 mr-2">
              {item.route?.name ?? t("common.unknownRoute")}
            </Text>
            <Badge
              label={item.save_type}
              variant={item.save_type === "favorite" ? "success" : "default"}
            />
          </View>

          {/* Bottom row: grade + color indicator */}
          <View className="flex-row items-center gap-2">
            {item.route?.canonical_grade != null && (
              <Text className="text-text-secondary text-sm">
                {canonicalToDisplay(item.route.canonical_grade, "v-scale")}
              </Text>
            )}
            {item.route?.color && (
              <View
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.route.color }}
              />
            )}
          </View>
        </View>
      )}
    />
  );
}
