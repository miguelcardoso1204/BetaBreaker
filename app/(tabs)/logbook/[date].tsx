/**
 * Session Detail Screen — Per-Date Drill-Down
 *
 * Displays the full details for a single day's climbing session:
 * a SessionSummary card (aggregated stats + grade distribution) and
 * a list of individual ascents logged that day.
 *
 * DATA FLOW:
 * 1. `useLocalSearchParams()` extracts the date from the URL
 *    (e.g., "2026-02-09" from /(tabs)/logbook/[date])
 * 2. `useSessionDetail(date)` fetches both summary + raw ascents in
 *    parallel via sessionsService
 * 3. SessionSummary card renders the aggregated stats
 * 4. Below the card, each ascent is rendered inline with route name,
 *    grade, status badge, and timestamp
 *
 * WHY INLINE ASCENT ITEMS (NOT A SEPARATE COMPONENT)?
 * Each ascent row is a simple 3-element layout (name, grade, status badge).
 * Creating a dedicated component for this adds indirection without any
 * reuse benefit — no other screen renders individual ascent rows like this.
 * If the layout grows more complex (expandable details, swipe actions),
 * extracting a component would be warranted.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import i18n from "@/lib/i18n";
import { useSessionDetail } from "@/hooks/useSessions";
import { SessionSummary } from "@/components/session/SessionSummary";
import { Badge } from "@/components/ui/Badge";
import { canonicalToDisplay } from "@/utils/grades";

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD string to a user-friendly display format.
 * Example: "2026-02-09" → "Feb 9, 2026"
 *
 * Adding T12:00:00 avoids timezone-shifting issues — see logbook/index.tsx
 * for the full explanation.
 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(i18n.language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format an ISO timestamp to a time-only string (e.g., "2:30 PM").
 *
 * Used to show when each ascent was logged during the session.
 * This helps climbers reconstruct their session chronology —
 * "I warmed up at 6 PM, sent the project at 7:30 PM."
 */
function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString(i18n.language, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Maps ascent status to Badge variant colors.
 * "flash" = green (success), "send" = purple (default), "attempt" = amber (warning).
 */
const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "default"> = {
  flash: "success",
  send: "default",
  attempt: "warning",
};

// ── Component ──────────────────────────────────────────────────────

export default function SessionDetailScreen() {
  const { t } = useTranslation();
  // Extract the date param from the URL (e.g., "2026-02-09")
  const { date } = useLocalSearchParams<{ date: string }>();

  // Fetch both summary and raw ascents for this date
  const { data, isLoading, error } = useSessionDetail(date);

  // ── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="loading-indicator"
      >
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text testID="error-message" className="text-error text-center">
          {(error as Error).message || t("logbook.failedToLoad")}
        </Text>
      </View>
    );
  }

  // ── No data guard ──────────────────────────────────────────────
  if (!data) return null;

  const { summary, ascents } = data;

  // Calculate session duration as 0 — the sessions table doesn't exist,
  // so we can't compute a real duration. The SessionSummary component
  // will display "0 min" which is acceptable for this iteration.
  // Phase 5.7+ could add duration tracking via a sessions table.
  const durationMinutes = 0;

  return (
    <ScrollView
      className="flex-1 bg-background"
      testID="session-detail-screen"
    >
      {/* ── Session Summary Card ─────────────────────────────────── */}
      {/* Reuses the SessionSummary component from Step 5.5. Fed with
          data from getSessionSummary — includes grade distribution
          bars since we have route grade info from the service. */}
      <View className="p-4">
        <SessionSummary
          date={formatDate(date)}
          durationMinutes={durationMinutes}
          totalAscents={summary.totalAscents}
          sends={summary.sends}
          flashes={summary.flashes}
          attempts={summary.attempts}
          gradeDistribution={summary.gradeDistribution}
          gradeSystem="v-scale"
          testID="session-summary"
        />
      </View>

      {/* ── Ascents List ─────────────────────────────────────────── */}
      {/* Rendered inline below the summary card. Each ascent shows
          the route name, grade, status badge, and timestamp. */}
      <View className="px-4 pb-8">
        <Text className="text-lg font-bold text-text-primary mb-3">
          {t("logbook.ascents")}
        </Text>

        {ascents.length === 0 ? (
          <Text className="text-text-secondary text-center py-4">
            {t("logbook.noAscents")}
          </Text>
        ) : (
          ascents.map((ascent) => (
            <View
              key={ascent.id}
              className="bg-card rounded-xl p-3 mb-2 flex-row items-center"
              testID={`ascent-${ascent.id}`}
            >
              {/* Route color indicator — small circle matching the route's
                  hold color for quick visual identification */}
              {ascent.route?.color && (
                <View
                  className="w-4 h-4 rounded-full mr-3"
                  style={{ backgroundColor: ascent.route.color }}
                />
              )}

              {/* Route name + grade — the main identifying info */}
              <View className="flex-1 mr-2">
                <Text className="text-text-primary font-semibold">
                  {ascent.route?.name ?? t("common.unknownRoute")}
                </Text>
                {ascent.route?.canonical_grade != null && (
                  <Text className="text-text-secondary text-xs">
                    {canonicalToDisplay(
                      ascent.route.canonical_grade,
                      "v-scale"
                    )}
                  </Text>
                )}
              </View>

              {/* Status badge — flash/send/attempt color coded */}
              <Badge
                label={ascent.status}
                variant={STATUS_BADGE_VARIANT[ascent.status] || "default"}
              />

              {/* Timestamp — when the ascent was logged */}
              <Text className="text-text-secondary text-xs ml-2 w-16 text-right">
                {formatTime(ascent.created_at)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
