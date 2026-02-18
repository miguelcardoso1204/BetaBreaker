/**
 * Admin Dashboard Screen (Step 15.1)
 *
 * Gym-scoped overview for gym admins showing:
 *   1. Stat widgets — active routes, retiring soon, total ascents
 *   2. Recent activity feed — latest ascents with climber/route info
 *
 * DATA FLOW:
 *   1. useAuth() → get homeGymId for the current admin
 *   2. useAdminDashboard(homeGymId) → dashboardService → PostgREST
 *      → Postgres (RLS: gym_admin/super_admin policy)
 *
 * STATES:
 *   - Loading: centered ActivityIndicator
 *   - Empty: "No activity yet" (new gym, no routes or ascents)
 *   - Data: stat widgets + FlatList of recent ascents
 *   - Error: error message
 *
 * SPEC DEVIATIONS:
 * - "Sets in progress" → "Retiring Soon" (no draft status exists)
 * - "Scan count" → "Total Ascents" (no qr_scans table exists)
 */

import React from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useAdminDashboard } from "@/hooks/useAdminDashboard";
import type { RecentActivityItem } from "@/services/dashboard.service";
import { canonicalToDisplay } from "@/utils/grades";

/**
 * Maps ascent status to a background color for the status badge.
 * Using semantic colors consistent with the app's color scheme:
 *   send    → green (success/completion)
 *   flash   → amber (impressive achievement)
 *   attempt → gray (not completed)
 */
function statusColor(status: string): string {
  switch (status) {
    case "send":
      return "bg-green-600";
    case "flash":
      return "bg-amber-500";
    default:
      return "bg-gray-500";
  }
}

/**
 * Stat widget component — displays a single numeric metric with label.
 * Used for active routes, retiring soon, and total ascents.
 */
function StatWidget({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 bg-surface rounded-lg p-3 items-center">
      <Text className="text-text-primary text-2xl font-bold">{value}</Text>
      <Text className="text-text-secondary text-xs mt-1">{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const gymId = user?.homeGymId ?? null;

  const {
    activeRoutes,
    retiringRoutes,
    totalAscents,
    recentActivity,
    isLoading,
    error,
  } = useAdminDashboard(gymId);

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
          {error.message || t("admin.dashboard.failedToLoad")}
        </Text>
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (activeRoutes === 0 && retiringRoutes === 0 && totalAscents === 0 && recentActivity.length === 0) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="empty-state"
      >
        <Text className="text-text-secondary text-center text-base">
          {t("admin.dashboard.noActivity")}
        </Text>
      </View>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background" testID="dashboard-screen">
      <Text className="text-xl font-bold text-text-primary px-4 pt-4 pb-2">
        {t("admin.dashboard.title")}
      </Text>

      {/* Stat widgets row — three key metrics side by side */}
      <View className="flex-row gap-3 px-4 mb-4">
        <StatWidget value={activeRoutes} label={t("admin.dashboard.activeRoutes")} />
        <StatWidget value={retiringRoutes} label={t("admin.dashboard.retiringSoon")} />
        <StatWidget value={totalAscents} label={t("admin.dashboard.totalAscents")} />
      </View>

      {/* Recent Activity section header */}
      <Text className="text-lg font-semibold text-text-primary px-4 mb-2">
        {t("admin.dashboard.recentActivity")}
      </Text>

      {/* Activity feed — latest ascents at this gym */}
      <FlatList
        data={recentActivity}
        keyExtractor={(item: RecentActivityItem) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }: { item: RecentActivityItem }) => (
          <View className="bg-surface rounded-lg p-3 mb-2">
            {/* Top row: climber name + status badge */}
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-text-primary font-medium">
                {item.climber?.display_name ?? t("common.unknown")}
              </Text>
              <View
                className={`px-2 py-0.5 rounded-full ${statusColor(item.status)}`}
              >
                <Text className="text-white text-xs font-medium">
                  {item.status}
                </Text>
              </View>
            </View>

            {/* Bottom row: route name + grade */}
            <Text className="text-text-secondary text-sm">
              {item.route?.name ?? t("common.unknownRoute")}
              {item.route?.canonical_grade != null &&
                ` · ${canonicalToDisplay(item.route.canonical_grade, "v-scale")}`}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
