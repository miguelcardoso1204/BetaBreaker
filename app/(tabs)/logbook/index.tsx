/**
 * Logbook Index Screen — Session History
 *
 * Chronological list of past climbing sessions. Each card shows the date,
 * ascent count, sends/flashes breakdown, and top grade climbed that day.
 *
 * THREE STATES:
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
 */

import React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { BookOpen } from "lucide-react-native";
import i18n from "@/lib/i18n";
import { useSessionHistory } from "@/hooks/useSessions";
import { canonicalToDisplay } from "@/utils/grades";
import { Badge } from "@/components/ui/Badge";

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

  const sessionHistory = useSessionHistory();

  // Loading state — centered spinner
  if (sessionHistory.isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator
          testID="loading-indicator"
          size="large"
          color="#7C3AED"
        />
      </View>
    );
  }

  // Empty state — friendly message encouraging the user to start climbing
  if (!sessionHistory.data || sessionHistory.data.length === 0) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
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
    <View className="flex-1 bg-background">
      <FlatList
        testID="session-list"
        data={sessionHistory.data}
        keyExtractor={(item) => item.date}
        contentContainerClassName="px-4 pt-4 pb-4"
        renderItem={({ item }) => (
          <Pressable
            testID={`session-card-${item.date}`}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/logbook/[date]" as any,
                params: { date: item.date },
              })
            }
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
    </View>
  );
}
