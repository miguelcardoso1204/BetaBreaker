// app/(tabs)/active-session.tsx
//
// Active Session Screen — the "session hub" for an ongoing climbing session.
//
// This screen shows the user everything about their current session: which gym
// they're at, how long they've been climbing, what they've logged, and quick
// actions to browse routes, scan QR codes, or finish the session.
//
// THREE STATES:
//   1. Active session (isActive=true): timer ticking, action buttons, pending logs list
//   2. Post-session (isActive=false, endTime set): SessionSummary with stats + "Done" button
//   3. No session (isActive=false, no endTime): redirect to tabs (stale navigation guard)
//
// WHY A HIDDEN TAB SCREEN (href: null)?
// Living inside the (tabs) group means the real CustomTabBar stays visible.
// The user can navigate to other tabs, browse routes, or scan QR codes — and
// the FAB (showing a Timer icon during active sessions) always brings them back.
// Using `router.navigate` for in-tab navigation avoids slide animations,
// making transitions feel like tab switches rather than page pushes.
//
// DATA FLOW:
// - useSession() → session state (isActive, gymId, pendingLogs, endSession, reset)
// - useGym(gymId) → gym name for the header
// - useRoutes({ gymId }) → route metadata for pending log display (name, grade, color)
// - canonicalToDisplay() → converts canonical grade integers to display strings

import React, { useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Route, ScanLine, Trash2 } from "lucide-react-native";

import { useSession } from "@/hooks/useSession";
import { useGym } from "@/hooks/useGyms";
import { useRoutes } from "@/hooks/useRoutes";
import { SessionTimer } from "@/components/session/SessionTimer";
import { SessionSummary } from "@/components/session/SessionSummary";
import { canonicalToDisplay } from "@/utils/grades";
import { useSessionStore } from "@/stores/sessionStore";
import type { PendingLog } from "@/stores/sessionStore";

// ── Component ────────────────────────────────────────────────────────

export default function ActiveSessionScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  // Pull session state and actions from the unified hook.
  // isActive tells us if the timer is running; endTime tells us if we're
  // in the post-session summary state (just finished).
  const {
    isActive,
    startTime,
    endTime,
    gymId,
    pendingLogs,
    duration,
    endSession,
    reset,
  } = useSession();

  // Fetch gym metadata (name) for the header display.
  // gymId can be null when there's no session, so we pass an empty string
  // and let the query return nothing — the guard below redirects anyway.
  const { data: gym } = useGym(gymId ?? "");

  // Fetch route data for the gym to resolve pending log route IDs to
  // human-readable names, grades, and colors. Without this, pending logs
  // would only show UUIDs.
  const { data: routes } = useRoutes({ gymId: gymId ?? "" });

  // Build a lookup map from route ID → route object for O(1) access
  // when rendering pending log rows. useMemo avoids rebuilding on every
  // render — only rebuilds when routes data changes.
  const routeMap = useMemo(() => {
    const map = new Map<string, any>();
    if (routes) {
      for (const route of routes) {
        map.set(route.id, route);
      }
    }
    return map;
  }, [routes]);

  // Get removePendingLog directly from the store — we need it for the
  // trash icon on each pending log row, and it's a stable action reference.
  const removePendingLog = useSessionStore((s) => s.removePendingLog);

  // ── Navigation guard ─────────────────────────────────────────────
  // If there's no active session AND no endTime (not in post-session state),
  // the user reached this screen through stale navigation (e.g., back button
  // after the session was cleared). Redirect to the home tab.
  useEffect(() => {
    if (!isActive && !endTime) {
      router.replace("/(tabs)");
    }
  }, [isActive, endTime]);

  // ── Stats computation ────────────────────────────────────────────
  // Compute breakdown of pending logs by status for the stats row.
  const stats = useMemo(() => {
    let flashes = 0;
    let sends = 0;
    let attempts = 0;
    for (const log of pendingLogs) {
      if (log.status === "flash") flashes++;
      else if (log.status === "send") sends++;
      else if (log.status === "attempt") attempts++;
    }
    return { flashes, sends, attempts, total: pendingLogs.length };
  }, [pendingLogs]);

  // ── Handlers ─────────────────────────────────────────────────────

  // Use router.replace for in-tab navigation so the content swaps in-place
  // without a slide animation. router.push would add to the root Stack on
  // top of the tab navigator; replace stays within the tab navigator.
  const handleBrowseRoutes = () => {
    if (gymId) {
      router.push(`/(tabs)/gym/${gymId}/routes` as any);
    }
  };

  const handleScanQR = () => {
    router.replace("/(tabs)/scan");
  };

  // Show a native confirmation dialog before ending the session.
  // Alert.alert is the standard cross-platform way to show confirmation
  // dialogs in React Native — no external dependency needed.
  const handleFinishSession = () => {
    Alert.alert(
      t("session.finishConfirmTitle"),
      t("session.finishConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("session.finishSession"),
          style: "destructive",
          onPress: () => endSession(),
        },
      ]
    );
  };

  // After viewing the post-session summary, reset the store and go home.
  const handleDone = () => {
    reset();
    router.replace("/(tabs)");
  };

  // ── Post-session summary state ───────────────────────────────────
  // When !isActive but endTime is set, the user just finished their session.
  // Show the SessionSummary component with computed stats and a "Done" button.
  if (!isActive && endTime) {
    return (
      <SafeAreaView className="flex-1 bg-background" testID="post-session-view">
        <View className="px-4 pt-4">
          {/* Header */}
          <Text className="text-xl font-bold text-white text-center mb-4">
            {t("session.activeSession")}
          </Text>
        </View>

        <View className="flex-1 px-4 justify-center">
          <SessionSummary
            testID="session-summary"
            date={new Date(endTime).toLocaleDateString()}
            durationMinutes={duration}
            totalAscents={stats.total}
            sends={stats.sends}
            flashes={stats.flashes}
            attempts={stats.attempts}
          />
        </View>

        {/* Done button — clears session state and returns to home tab */}
        <View className="px-4 pb-4">
          <Pressable
            testID="done-button"
            onPress={handleDone}
            className="bg-accent rounded-xl py-4 items-center"
          >
            <Text className="text-white font-bold text-base">
              {t("session.done")}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── No session guard (render nothing while redirect fires) ───────
  if (!isActive) {
    return null;
  }

  // ── Active session view ──────────────────────────────────────────

  // Renders a single pending log row showing route name, grade, status badge,
  // and a trash icon to remove it.
  const renderPendingLog = ({ item }: { item: PendingLog }) => {
    const route = routeMap.get(item.routeId);
    const routeName = route?.name ?? t("common.unknownRoute");
    const gradeLabel = route?.grade != null
      ? canonicalToDisplay(route.grade, route?.grade_system ?? "v-scale")
      : "";
    const colorHex = route?.color ?? "#888";

    // Map status to a user-facing label and background color for the badge.
    const statusConfig: Record<string, { label: string; bg: string }> = {
      flash: { label: t("session.flash"), bg: "bg-green-600" },
      send: { label: t("session.send"), bg: "bg-accent" },
      attempt: { label: t("session.attempt"), bg: "bg-amber-600" },
    };
    const { label: statusLabel, bg: statusBg } = statusConfig[item.status] ?? {
      label: item.status,
      bg: "bg-gray-600",
    };

    return (
      <View
        testID={`pending-log-${item.id}`}
        className="flex-row items-center bg-surface rounded-xl px-4 py-3 mb-2"
      >
        {/* Color swatch — a small circle showing the route's hold color */}
        <View
          className="w-4 h-4 rounded-full mr-3"
          style={{ backgroundColor: colorHex }}
        />

        {/* Route name and grade */}
        <View className="flex-1">
          <Text className="text-white text-sm font-medium" numberOfLines={1}>
            {routeName}
          </Text>
          {gradeLabel ? (
            <Text className="text-text-secondary text-xs">{gradeLabel}</Text>
          ) : null}
        </View>

        {/* Status badge */}
        <View className={`${statusBg} rounded-full px-2 py-0.5 mr-3`}>
          <Text className="text-white text-xs font-medium">{statusLabel}</Text>
        </View>

        {/* Trash icon to remove this pending log */}
        <Pressable
          testID={`remove-log-${item.id}`}
          onPress={() => removePendingLog(item.id)}
          accessibilityLabel={t("session.removeAscent")}
          hitSlop={8}
        >
          <Trash2 size={18} color="#EF4444" strokeWidth={2} />
        </Pressable>
      </View>
    );
  };

  // Empty state component shown when no ascents have been logged yet.
  const EmptyState = () => (
    <View className="items-center py-12" testID="empty-state">
      <Text className="text-text-secondary text-base mb-1">
        {t("session.noAscentsYet")}
      </Text>
      <Text className="text-text-secondary text-sm">
        {t("session.tapToLog")}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      testID="active-session-view"
      edges={["top"]}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <View className="flex-row items-center px-4 pt-2 pb-4">
        <Pressable
          onPress={() => router.back()}
          testID="back-button"
          accessibilityLabel={t("common.goBack")}
          hitSlop={8}
        >
          <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
        <Text className="text-lg font-bold text-white ml-3">
          {t("session.activeSession")}
        </Text>
      </View>

      {/* ── Gym name ────────────────────────────────────────────── */}
      {gym && (
        <Text
          testID="gym-name"
          className="text-text-secondary text-sm text-center mb-2"
        >
          {t("session.sessionAt", { gym: gym.name })}
        </Text>
      )}

      {/* ── Timer ───────────────────────────────────────────────── */}
      <SessionTimer className="mb-4" testID="session-timer" />

      {/* ── Stats row ───────────────────────────────────────────── */}
      <View className="flex-row justify-around px-4 mb-4">
        <View className="items-center">
          <Text className="text-white text-xl font-bold">{stats.total}</Text>
          <Text className="text-text-secondary text-xs">{t("session.routesLogged")}</Text>
        </View>
        <View className="items-center">
          <Text className="text-green-400 text-xl font-bold">{stats.flashes}</Text>
          <Text className="text-text-secondary text-xs">{t("session.flash")}</Text>
        </View>
        <View className="items-center">
          <Text className="text-accent text-xl font-bold">{stats.sends}</Text>
          <Text className="text-text-secondary text-xs">{t("session.send")}</Text>
        </View>
        <View className="items-center">
          <Text className="text-amber-400 text-xl font-bold">{stats.attempts}</Text>
          <Text className="text-text-secondary text-xs">{t("session.attempt")}</Text>
        </View>
      </View>

      {/* ── Action buttons ──────────────────────────────────────── */}
      <View className="flex-row px-4 gap-3 mb-4">
        <Pressable
          testID="browse-routes-button"
          onPress={handleBrowseRoutes}
          className="flex-1 flex-row items-center justify-center bg-surface rounded-xl py-3 gap-2"
        >
          <Route size={18} color="#7C3AED" strokeWidth={2} />
          <Text className="text-white text-sm font-medium">
            {t("session.browseRoutes")}
          </Text>
        </Pressable>

        <Pressable
          testID="scan-qr-button"
          onPress={handleScanQR}
          className="flex-1 flex-row items-center justify-center bg-surface rounded-xl py-3 gap-2"
        >
          <ScanLine size={18} color="#7C3AED" strokeWidth={2} />
          <Text className="text-white text-sm font-medium">
            {t("scan.scanQR")}
          </Text>
        </Pressable>
      </View>

      {/* ── Pending logs list ───────────────────────────────────── */}
      <View className="flex-1 px-4">
        <Text className="text-white text-sm font-semibold mb-2">
          {t("session.routesLogged")} ({stats.total})
        </Text>
        <FlatList
          data={pendingLogs}
          keyExtractor={(item) => item.id}
          renderItem={renderPendingLog}
          ListEmptyComponent={EmptyState}
        />
      </View>

      {/* ── Finish Session button ───────────────────────────────── */}
      <View className="px-4 pb-4">
        <Pressable
          testID="finish-session-button"
          onPress={handleFinishSession}
          className="bg-red-600 rounded-xl py-4 items-center"
        >
          <Text className="text-white font-bold text-base">
            {t("session.finishSession")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
