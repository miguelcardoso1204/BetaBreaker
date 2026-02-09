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

import React from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Star, MapPin, Clock, ChevronRight } from "lucide-react-native";
import { useGym, useSetHomeGym } from "@/hooks/useGyms";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";

export default function GymMainScreen() {
  // Extract gymId from the URL path. Expo Router's file-based routing
  // maps /gym/[id] to this component with params.id = gymId.
  const { id: gymId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Fetch gym data via TanStack Query. The result is cached per gymId,
  // so navigating back to this gym from child screens is instant.
  const { data: gym, isLoading } = useGym(gymId);

  // Get the current user's profile to check if this gym is their home gym
  // (drives the star icon color: gold = home gym, white = not).
  const { user } = useAuth();

  // Mutation to set/unset the user's home gym. After success, the "auth"
  // query cache is invalidated so useAuth().user.homeGymId updates.
  const { mutate: setHomeGym } = useSetHomeGym();

  // Determine if this gym is the user's home gym — controls star color.
  const isHomeGym = user?.homeGymId === gymId;

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
    <ScrollView className="flex-1 bg-background" testID="gym-main-screen">
      {/* ── Header Section ────────────────────────────────────────── */}
      {/* Shows the gym's identity: avatar (initials fallback since no
          logo_url exists), name with favorite star, address, hours, and
          social media handle. */}
      <View className="flex-row p-4 gap-4">
        {/* Avatar — uses initials from the gym name (e.g., "SC" for
            "Summit Climbing"). Once a logo_url column is added to the
            gyms table, we can pass it as the `uri` prop. */}
        <Avatar name={gym.name} size="lg" testID="gym-avatar" />

        {/* Info column — stacked metadata next to the avatar */}
        <View className="flex-1 justify-center gap-1">
          {/* Name row with favorite star toggle */}
          <View className="flex-row items-center justify-between">
            <Text
              className="text-xl font-bold text-primary flex-1"
              numberOfLines={2}
            >
              {gym.name}
            </Text>
            {/* Star IconButton toggles the home gym setting.
                Gold (#F59E0B) when this is the user's home gym, white otherwise.
                Pressing calls useSetHomeGym mutation with userId + gymId. */}
            <IconButton
              icon={Star}
              label={isHomeGym ? "Remove home gym" : "Set as home gym"}
              onPress={() =>
                setHomeGym({ userId: user!.id, gymId })
              }
              color={isHomeGym ? "#F59E0B" : "#FFFFFF"}
              testID="favorite-button"
            />
          </View>

          {/* Address row — MapPin icon + gym address text */}
          <View className="flex-row items-center gap-2" testID="gym-address">
            <MapPin size={16} color="#9CA3AF" />
            <Text className="text-secondary text-sm flex-1" numberOfLines={2}>
              {gym.address}
            </Text>
          </View>

          {/* Hours row — Clock icon + placeholder text.
              No operating_hours column exists in the gyms table yet, so we
              show a static placeholder. When hours data is added, this section
              will display actual hours and an open/closed indicator dot. */}
          <View className="flex-row items-center gap-2" testID="gym-hours">
            <Clock size={16} color="#9CA3AF" />
            <Text className="text-secondary text-sm">
              Hours not available
            </Text>
          </View>

          {/* Social media handle — only shown if the gym has an Instagram
              handle in its social_links JSON column. */}
          {instagramHandle && (
            <Text className="text-accent-light text-sm">
              {instagramHandle}
            </Text>
          )}
        </View>
      </View>

      {/* ── Start Session Button ──────────────────────────────────── */}
      {/* Primary CTA for starting a climbing session at this gym.
          Phase 5 (Tick-Logging) will wire this to real session management.
          For now, it shows a placeholder Alert explaining the feature. */}
      <View className="px-4 mt-2">
        <Button
          label="Start Session"
          size="lg"
          onPress={() => {
            Alert.alert(
              "Coming Soon",
              "Session management will be available in a future update."
            );
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
            <Text className="text-primary text-base font-semibold">
              Routes
            </Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
        </Card>

        {/* Leaderboards card — Phase 10 feature, shows placeholder alert. */}
        <Card
          onPress={() => {
            Alert.alert(
              "Coming Soon",
              "Leaderboards will be available in a future update."
            );
          }}
          testID="leaderboards-card"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-primary text-base font-semibold">
              Leaderboards
            </Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
        </Card>

        {/* Style Analysis card — later-phase feature, shows placeholder alert. */}
        <Card
          onPress={() => {
            Alert.alert(
              "Coming Soon",
              "Style Analysis will be available in a future update."
            );
          }}
          testID="style-analysis-card"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-primary text-base font-semibold">
              Style Analysis
            </Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
