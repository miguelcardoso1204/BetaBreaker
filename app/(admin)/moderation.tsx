/**
 * Admin Moderation Queue Screen
 *
 * Displays all pending content reports for admin review. Each report card
 * shows who reported it, what type of content (video/feedback/user), the
 * reason, and when it was submitted. Admins can either:
 *   - "Dismiss" — mark as false alarm (status → 'dismissed')
 *   - "Reviewed" — mark as reviewed/actioned (status → 'reviewed')
 *
 * DATA FLOW:
 *   1. useReports("pending") → moderationService.getReports("pending")
 *      → PostgREST → Postgres (RLS: is_admin() policy)
 *   2. Admin taps action button → useResolveReport().mutate()
 *      → moderationService.resolveReport() → UPDATE content_reports
 *   3. onSettled invalidates ["reports"] → list refetches → resolved
 *      report disappears from the pending queue
 *
 * STATES:
 *   - Loading: centered ActivityIndicator
 *   - Empty: "No pending reports" message (the ideal state!)
 *   - Data: FlatList of report cards with action buttons
 *   - Error: error message
 */

import React from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useReports, useResolveReport } from "@/hooks/useModeration";

/**
 * Formats a timestamp into a short locale string.
 * Used to show when each report was submitted.
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Maps target_type to a translation key.
 * target_type is stored as lowercase in the DB ('video', 'feedback', 'user').
 */
const TARGET_TYPE_KEYS: Record<string, string> = {
  video: "admin.moderation.typeVideo",
  feedback: "admin.moderation.typeBetaTip",
  user: "admin.moderation.typeUser",
};

export default function ModerationScreen() {
  const { t } = useTranslation();
  // Fetch only pending reports — the primary admin use case.
  // Resolved reports can be viewed via a separate "history" tab
  // in a future iteration.
  const { reports, isLoading, error } = useReports("pending");
  const { mutate: resolveReport } = useResolveReport();

  // ── Loading state ────────────────────────────────────────────────
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

  // ── Error state ──────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || t("admin.moderation.failedToLoad")}
        </Text>
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (reports.length === 0) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="empty-state"
      >
        <Text className="text-text-secondary text-center text-base">
          {t("admin.moderation.noReports")}
        </Text>
      </View>
    );
  }

  // ── Report list ──────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background" testID="moderation-screen">
      <Text className="text-xl font-bold text-text-primary px-4 pt-4 pb-2">
        {t("admin.moderation.title")} ({reports.length})
      </Text>

      <FlatList
        data={reports}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }: { item: any }) => (
          <View className="bg-surface rounded-lg p-4 mb-3">
            {/* Reporter info + timestamp */}
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-text-primary font-medium">
                {item.reporter?.display_name ?? t("common.unknown")}
              </Text>
              <Text className="text-text-secondary text-xs">
                {formatDate(item.created_at)}
              </Text>
            </View>

            {/* Target type + reason */}
            <Text className="text-text-secondary text-sm mb-1">
              {t("admin.moderation.type")} {t(TARGET_TYPE_KEYS[item.target_type] ?? item.target_type)}
            </Text>
            <Text className="text-text-primary text-sm mb-3">
              {t("admin.moderation.reason")} {item.reason}
            </Text>

            {/* Action buttons — Dismiss (false alarm) or Reviewed (action taken) */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={() =>
                  resolveReport({ reportId: item.id, status: "dismissed" })
                }
                accessibilityRole="button"
                className="flex-1 py-2 rounded-lg border border-border items-center"
              >
                <Text className="text-text-secondary font-medium">
                  {t("admin.moderation.dismiss")}
                </Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  resolveReport({ reportId: item.id, status: "reviewed" })
                }
                accessibilityRole="button"
                className="flex-1 py-2 rounded-lg bg-accent items-center"
              >
                <Text className="text-white font-medium">{t("admin.moderation.reviewed")}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}
