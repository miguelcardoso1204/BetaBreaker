/**
 * Gym Main Page — Central Hub Screen for a Specific Gym
 *
 * This is the landing page users see when they tap a gym from the Home tab
 * or Map Browse. It ties together all gym-specific features: route browsing,
 * leaderboards, style analysis, and session start.
 *
 * DATA FLOW:
 * 1. `useLocalSearchParams()` extracts the gymId from the URL (/gym/[id])
 * 2. `useGym(gymId)` fetches the gym's details via TanStack Query →
 *    gymService.getGymById → PostgREST → Postgres (RLS)
 * 3. `useAuth()` provides the current user's profile (homeGymId for the
 *    favorite star state)
 * 4. `useSetHomeGym()` provides the mutation to set/unset home gym
 *
 * DATA GAPS:
 * - **Operating hours**: no column in gyms table → shows "Hours not available"
 * - **Gym logo**: no logo_url column → uses Avatar initials fallback
 * - **Gym favoriting**: no saved_gyms table → reuses home_gym_id from profiles
 * These can be addressed in future migrations without changing screen structure.
 *
 * STATES:
 * - Loading: centered ActivityIndicator while TanStack Query fetches
 * - Data: scrollable gym detail with header, session button, and nav cards
 *
 * LAYOUT:
 * ScrollView
 *   Header: Avatar + name + star + address + hours + social
 *   Start Session: primary CTA button (placeholder until Phase 5)
 *   Navigation Cards: Routes, Leaderboards, Style Analysis
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  Animated,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Star, MapPin, Clock, ChevronRight, ChevronLeft } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import { useGym, useSetHomeGym } from "@/hooks/useGyms";
import { useAuth } from "@/hooks/useAuth";
import { useSession } from "@/hooks/useSession";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";

/** Day names matching JS Date.getDay() index (0 = Sunday). */
const DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
] as const;

/** Week display order starting from Monday. */
const WEEK_ORDER = [
  "monday", "tuesday", "wednesday", "thursday",
  "friday", "saturday", "sunday",
] as const;

/**
 * Extract today's opening hours from a gym's operating_hours JSON.
 * Returns a formatted string like "06:00 – 22:00", or null if unavailable.
 */
function getTodayHours(operatingHours: unknown): string | null {
  if (!operatingHours || typeof operatingHours !== "object") return null;
  const today = DAY_NAMES[new Date().getDay()];
  const hours = (operatingHours as Record<string, { open?: string; close?: string }>)[today];
  if (!hours?.open || !hours?.close) return null;
  return `${hours.open} – ${hours.close}`;
}

export default function GymMainScreen() {
  // i18n hook — provides t() for translating hardcoded strings.
  const { t } = useTranslation();

  // Extract gymId from the URL path. Expo Router's file-based routing
  // maps /gym/[id] to this component with params.id = gymId.
  const { id: gymId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Fetch gym data via TanStack Query. The result is cached per gymId,
  // so navigating back to this gym from child screens is instant.
  const { data: gym, isLoading } = useGym(gymId);

  // Get the current user's profile to check if this gym is their home gym
  // (drives the star icon color: gold = home gym, white = not).
  const { user, refreshProfile } = useAuth();

  // Mutation to set/unset the user's home gym. After success, the "auth"
  // query cache is invalidated so useAuth().user.homeGymId updates.
  const { mutate: setHomeGym } = useSetHomeGym();

  // Inline overlay instead of native Modal — avoids the slow native window
  // creation on iOS while keeping a smooth fade animation.
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openSchedule = useCallback(() => {
    setScheduleVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const closeSchedule = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setScheduleVisible(false));
  }, [fadeAnim]);

  // Session hook — startSession sets isActive=true in Zustand store with
  // this gymId, so the app knows a climbing session is in progress.
  const { startSession, isActive } = useSession();

  // Local favorite state for instant toggle feedback. Syncs with the
  // server value via useEffect, but updates immediately on press.
  const [localIsHome, setLocalIsHome] = useState(user?.homeGymId === gymId);
  useEffect(() => {
    setLocalIsHome(user?.homeGymId === gymId);
  }, [user?.homeGymId, gymId]);
  const isHomeGym = localIsHome;

  // Extract Instagram handle from the social_links JSONB column.
  // social_links is stored as a JSON object in Postgres (e.g., { instagram: "@handle" }).
  // We cast to Record<string, string> and use optional chaining for safe access.
  const socialLinks = gym?.social_links as Record<string, string> | null;
  const instagramHandle = socialLinks?.instagram;

  // ── Loading state ──────────────────────────────────────────────
  // Show a centered spinner while TanStack Query fetches the gym data.
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

  // Guard: if gym data hasn't loaded yet, render nothing.
  // This shouldn't happen in normal flow (useGym errors if the gym
  // doesn't exist), but TypeScript needs the null check.
  if (!gym) return null;

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Back button — navigates to the previous screen (map, home, etc.) */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        className="px-4 pt-2 pb-1"
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <ChevronLeft size={28} color="#ffffff" />
      </Pressable>

    <ScrollView className="flex-1" testID="gym-main-screen">
      {/* ── Header Section ────────────────────────────────────────── */}
      {/* Shows the gym's identity: avatar (initials fallback since no
          logo_url exists), name with favorite star, address, hours, and
          social media handle. */}
      <View className="flex-row p-4 gap-4">
        {/* Avatar — uses initials from the gym name (e.g., "SC" for
            "Summit Climbing"). Once a logo_url column is added to the
            gyms table, we can pass it as the `uri` prop. */}
        <Avatar name={gym.name} size="lg" variant="square" testID="gym-avatar" />

        {/* Info column — stacked metadata next to the avatar */}
        <View className="flex-1 justify-center gap-2">
          {/* Name row with favorite star toggle */}
          <View className="flex-row items-center justify-between">
            <Text
              className="text-xl font-bold text-text-primary flex-1"
              numberOfLines={2}
            >
              {gym.name}
            </Text>
            {/* Star IconButton toggles the home gym setting.
                Gold (#F59E0B) when this is the user's home gym, white otherwise.
                Pressing calls useSetHomeGym mutation with userId + gymId. */}
            <IconButton
              icon={Star}
              label={isHomeGym ? t("gym.removeHomeGym") : t("gym.setAsHomeGym")}
              onPress={() => {
                const newValue = !isHomeGym;
                setLocalIsHome(newValue);
                setHomeGym(
                  { userId: user!.id, gymId: newValue ? gymId : null },
                  { onSuccess: () => refreshProfile() }
                );
              }}
              color={isHomeGym ? "#F59E0B" : "#FFFFFF"}
              fill={isHomeGym ? "#F59E0B" : "none"}
              testID="favorite-button"
            />
          </View>

          {/* Address row — MapPin icon + gym address text */}
          <View className="flex-row items-center gap-2" testID="gym-address">
            <MapPin size={16} color="#9CA3AF" />
            <Text className="text-text-secondary text-sm flex-1" numberOfLines={2}>
              {gym.address}
            </Text>
          </View>

          {/* Hours row — tappable to open full weekly schedule modal. */}
          <Pressable
            className="flex-row items-center gap-2"
            testID="gym-hours"
            onPress={openSchedule}
          >
            <Clock size={16} color="#9CA3AF" />
            <Text className="text-text-secondary text-sm underline">
              {getTodayHours(gym.operating_hours) ?? t("gym.hoursNotAvailable")}
            </Text>
          </Pressable>

          {/* Social media handle — only shown if the gym has an Instagram
              handle in its social_links JSON column. */}
          {instagramHandle && (
            <Pressable
              className="flex-row items-center gap-2"
              onPress={() => {
                // Strip leading @ if present to build the URL.
                const handle = instagramHandle.replace(/^@/, "");
                Linking.openURL(`https://instagram.com/${handle}`);
              }}
            >
              <Ionicons name="logo-instagram" size={16} color="#9CA3AF" />
              <Text className="text-accent-light text-sm underline">
                {instagramHandle}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Start Session Button ──────────────────────────────────── */}
      {/* Primary CTA for starting a climbing session at this gym.
          Calls startSession(gymId) on the Zustand store (sets isActive=true,
          records startTime and gymId), then navigates to the routes list
          where the user can browse routes and log ascents via QuickLog or
          the Full Ascent Form. If a session is already active, the button
          label changes to indicate they can continue browsing routes. */}
      <View className="px-4 mt-2">
        <Button
          label={isActive ? t("gym.viewRoutes") : t("session.startSession")}
          size="lg"
          onPress={() => {
            if (!isActive) {
              startSession(gymId);
            }
            router.push(`/gym/${gymId}/routes` as any);
          }}
          testID="start-session-button"
        />
      </View>

      {/* ── Navigation Cards ──────────────────────────────────────── */}
      {/* Cards that link to the main gym sub-sections. Only "Routes"
          navigates to a real screen — the others show "Coming Soon" alerts
          until their respective phases are implemented. */}
      <View className="px-4 mt-6 gap-4 pb-8">
        {/* Routes card — navigates to the route browsing screen where
            users can filter and view all routes at this gym. */}
        <Card
          onPress={() => router.push(`/gym/${gymId}/routes` as any)}
          testID="routes-card"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-text-primary text-base font-semibold">
              {t("gym.routes")}
            </Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
        </Card>

        {/* Leaderboards card — navigates to the gym leaderboard screen
            where users can see weekly rankings by different scoring models. */}
        <Card
          onPress={() => router.push(`/gym/${gymId}/leaderboard` as any)}
          testID="leaderboards-card"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-text-primary text-base font-semibold">
              {t("gym.leaderboards")}
            </Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
        </Card>

        {/* Style Analysis card — later-phase feature, shows placeholder alert. */}
        <Card
          onPress={() => {
            Alert.alert(
              t("common.comingSoon"),
              t("gym.styleAnalysisComingSoon")
            );
          }}
          testID="style-analysis-card"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-text-primary text-base font-semibold">
              {t("gym.styleAnalysis")}
            </Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
        </Card>
      </View>
    </ScrollView>

      {/* ── Weekly Schedule Overlay ─────────────────────────────────
          Inline animated overlay instead of native Modal. Modal creates a
          new native window on iOS which is slow to initialize. This overlay
          is part of the existing view tree so it's instant to show. */}
      {scheduleVisible && (
        <Animated.View
          style={{ opacity: fadeAnim }}
          className="absolute inset-0 z-50"
        >
          <Pressable
            className="flex-1 bg-black/60 justify-center items-center px-6"
            onPress={closeSchedule}
          >
            <Pressable
              className="bg-surface rounded-2xl w-full p-5"
              onPress={() => {}}
            >
              <Text className="text-text-primary text-lg font-bold mb-4 text-center">
                {t("gym.schedule")}
              </Text>

              {WEEK_ORDER.map((day) => {
                const opHours = gym.operating_hours as Record<string, { open?: string; close?: string }> | null;
                const dayHours = opHours?.[day];
                const isToday = DAY_NAMES[new Date().getDay()] === day;

                return (
                  <View
                    key={day}
                    className={`flex-row justify-between py-2 ${
                      isToday ? "bg-accent/10 rounded-lg px-3 -mx-3" : ""
                    }`}
                  >
                    <Text className={`text-sm ${isToday ? "text-accent-light font-bold" : "text-text-secondary"}`}>
                      {t(`gym.days.${day}`)}
                    </Text>
                    <Text className={`text-sm ${isToday ? "text-accent-light font-bold" : "text-text-primary"}`}>
                      {dayHours?.open && dayHours?.close
                        ? `${dayHours.open} – ${dayHours.close}`
                        : t("gym.closed")}
                    </Text>
                  </View>
                );
              })}

              <Pressable
                className="mt-4 py-3 rounded-lg bg-accent items-center"
                onPress={closeSchedule}
              >
                <Text className="text-white font-semibold">{t("common.close")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}
