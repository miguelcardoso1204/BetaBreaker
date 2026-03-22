/**
 * Session Detail Screen — Drill-Down for a Specific Session
 *
 * Displays the full details for a single climbing session:
 * gym name, date, duration, and a list of individual ascents
 * logged during that session.
 *
 * DATA FLOW:
 * 1. `useLocalSearchParams()` extracts the sessionId from the URL
 * 2. `sessionsService.getSessionById()` fetches session metadata + gym name
 * 3. `sessionsService.getAscentsForSession()` fetches ascents linked to this session
 * 4. Both queries run in parallel via Promise.all
 *
 * WHY BY SESSION ID (NOT DATE)?
 * A user can have multiple sessions on the same day at different gyms.
 * Querying by session_id returns only the ascents that belong to this
 * specific session, not everything logged that calendar day.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react-native";
import { Image } from "expo-image";
import { sessionsService } from "@/services/sessions.service";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/Badge";
import { canonicalToDisplay } from "@/utils/grades";
import i18n from "@/lib/i18n";

// ── Helpers ────────────────────────────────────────────────────────

/** Format an ISO timestamp to a user-friendly date string. */
function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString(i18n.language, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format an ISO timestamp to a time-only string (e.g., "2:30 PM"). */
function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString(i18n.language, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Format duration in minutes to "Xh Ym" or "Xm". */
function formatDuration(mins: number | null): string {
  if (!mins) return "0m";
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return hours > 0 ? `${hours}h ${remaining}m` : `${mins}m`;
}

/** Maps ascent status to Badge variant colors. */
const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "default"> = {
  flash: "success",
  send: "default",
  attempt: "warning",
};

// ── Component ──────────────────────────────────────────────────────

export default function SessionByIdScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { user } = useAuth();

  // Fetch session metadata + ascents in parallel.
  const { data, isLoading, error } = useQuery({
    queryKey: ["sessions", "byId", sessionId],
    queryFn: async () => {
      const [session, ascents] = await Promise.all([
        sessionsService.getSessionById(sessionId),
        sessionsService.getAscentsForSession(sessionId),
      ]);
      return { session, ascents };
    },
    enabled: !!sessionId,
  });

  // ── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="loading-indicator"
      >
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {(error as Error).message || t("logbook.failedToLoad")}
        </Text>
      </View>
    );
  }

  if (!data?.session) return null;

  const { session, ascents } = data;

  // Count ascent statuses for the summary.
  let sends = 0;
  let flashes = 0;
  let attempts = 0;
  for (const a of ascents) {
    if (a.status === "send") sends++;
    else if (a.status === "flash") flashes++;
    else if (a.status === "attempt") attempts++;
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
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
          {session.gym?.name ?? "Session Detail"}
        </Text>
      </View>

    <ScrollView className="flex-1" testID="session-detail-screen">
      {/* ── Session Info Card ──────────────────────────────────────── */}
      <View className="mx-4 mt-4 bg-card rounded-xl p-4">
        {/* Gym logo + name row */}
        <View className="flex-row items-center mb-3">
          {session.gym?.logo_url ? (
            <Image
              source={{ uri: session.gym.logo_url }}
              style={{ width: 48, height: 48, borderRadius: 10 }}
              contentFit="cover"
            />
          ) : (
            <View className="bg-accent rounded-lg w-12 h-12 items-center justify-center">
              <Text className="text-white font-bold text-lg">
                {(session.gym?.name ?? "?").charAt(0)}
              </Text>
            </View>
          )}
          <View className="ml-3">
            <Text className="text-text-primary text-lg font-bold">
              {session.gym?.name ?? "Unknown Gym"}
            </Text>
            <Text className="text-text-secondary text-sm">
              {formatDate(session.started_at)}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View className="flex-row justify-between">
          <View className="items-center flex-1">
            <Text className="text-text-primary text-xl font-bold">
              {formatDuration(session.duration_minutes)}
            </Text>
            <Text className="text-text-secondary text-xs">{t("logbook.duration")}</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-text-primary text-xl font-bold">{ascents.length}</Text>
            <Text className="text-text-secondary text-xs">{t("logbook.ascents")}</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-text-primary text-xl font-bold text-green-400">{flashes + sends}</Text>
            <Text className="text-text-secondary text-xs">{t("logbook.sends")}</Text>
          </View>
        </View>
      </View>

      {/* ── Ascents List ─────────────────────────────────────────── */}
      <View className="px-4 pt-4 pb-8">
        <Text className="text-lg font-bold text-text-primary mb-3">
          {t("logbook.ascents")}
        </Text>

        {ascents.length === 0 ? (
          <Text className="text-text-secondary text-center py-4">
            {t("logbook.noAscents")}
          </Text>
        ) : (
          ascents.map((ascent: any) => (
            <View
              key={ascent.id}
              className="bg-card rounded-xl p-3 mb-2 flex-row items-center"
              testID={`ascent-${ascent.id}`}
            >
              {/* Route color dot */}
              {ascent.route?.color && (
                <View
                  className="w-4 h-4 rounded-full mr-3"
                  style={{ backgroundColor: ascent.route.color }}
                />
              )}

              {/* Route name + grade */}
              <View className="flex-1 mr-2">
                <Text className="text-text-primary font-semibold">
                  {ascent.route?.name ?? "Unknown Route"}
                </Text>
                {ascent.route?.canonical_grade != null && (
                  <Text className="text-text-secondary text-xs">
                    {canonicalToDisplay(ascent.route.canonical_grade, "v-scale")}
                  </Text>
                )}
              </View>

              {/* Status badge */}
              <Badge
                label={ascent.status}
                variant={STATUS_BADGE_VARIANT[ascent.status] || "default"}
              />

              {/* Timestamp */}
              <Text className="text-text-secondary text-xs ml-2 w-16 text-right">
                {formatTime(ascent.created_at)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
