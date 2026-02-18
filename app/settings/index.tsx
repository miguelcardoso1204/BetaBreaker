// app/settings/index.tsx
//
// Settings hub screen — the central place for app preferences and account
// actions. Accessible from the profile screen's gear icon.
//
// SECTIONS:
//   1. Grade System — 3-option picker (V-Scale, Font, YDS). Unlike the
//      profile edit mode which batches changes, this persists immediately
//      via useUpdateProfile. This gives instant feedback without a save step.
//
//   2. Navigation Rows — links to Notification Preferences and Community
//      Guidelines, which are separate screens under app/settings/.
//
//   3. Language — disabled row showing "English" with a "Coming Soon" badge.
//      i18n infrastructure (FR-Q1) is deferred to Phase 18.
//
//   4. About — app version from expo-constants, plus disabled Privacy Policy
//      and Terms of Service rows (no URLs defined yet).
//
//   5. Sign Out — red-styled button with Alert confirmation before calling
//      signOut() from useAuth.

import React from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import {
  ArrowLeft,
  ChevronRight,
  Bell,
  BookOpen,
  Globe,
  LogOut,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateProfile } from "@/hooks/useProfile";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import type { GradeSystem } from "@/utils/grades";

// The three grade systems users can choose from — same set as the profile
// edit mode, but here changes are persisted immediately on tap.
const GRADE_SYSTEMS: { value: GradeSystem; label: string }[] = [
  { value: "v-scale", label: "V-Scale" },
  { value: "font", label: "Font" },
  { value: "yds", label: "YDS" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut, refreshProfile } = useAuth();

  // useUpdateProfile takes refreshProfile as a param so that after a
  // successful mutation, useAuth's cached profile is re-fetched and the
  // UI reflects the new grade system immediately.
  const updateProfile = useUpdateProfile(refreshProfile);

  // Read the app version from Expo's build config. This is set in
  // app.json and embedded at build time by the Expo bundler.
  const appVersion = Constants.expoConfig?.version ?? "unknown";

  // Current grade system from the user's profile (default to v-scale)
  const currentGradeSystem =
    (user?.preferredGradeSystem as GradeSystem) ?? "v-scale";

  /** Persist grade system change immediately (no save button needed). */
  function handleGradeChange(gs: GradeSystem) {
    if (!user || gs === currentGradeSystem) return;
    updateProfile.mutate({
      userId: user.id,
      fields: { preferred_grade_system: gs },
    });
  }

  /** Show confirmation dialog before signing out. */
  function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Header: back button + title (same pattern as notification-preferences) */}
      <View className="px-4 pt-14 pb-4 flex-row items-center">
        <IconButton
          icon={ArrowLeft}
          label="Go back"
          onPress={() => router.back()}
          size={24}
          color="#FFFFFF"
        />
        <Text className="text-text-primary text-xl font-bold ml-3">
          Settings
        </Text>
      </View>

      {/* ── Grade System ────────────────────────────────────────────── */}
      <View className="px-4 py-3">
        <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wide mb-2">
          Grade System
        </Text>
        <View className="flex-row gap-2">
          {GRADE_SYSTEMS.map((gs) => (
            <Pressable
              key={gs.value}
              onPress={() => handleGradeChange(gs.value)}
              testID={`grade-option-${gs.value}`}
              className={`flex-1 py-2 items-center rounded-lg ${
                currentGradeSystem === gs.value ? "bg-accent" : "bg-surface"
              }`}
            >
              <Text
                className={
                  currentGradeSystem === gs.value
                    ? "text-white font-semibold"
                    : "text-text-primary"
                }
              >
                {gs.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Navigation Rows ──────────────────────────────────────────── */}
      <View className="mt-4">
        <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wide px-4 mb-2">
          Preferences
        </Text>

        {/* Notification Preferences */}
        <Pressable
          onPress={() => router.push("/settings/notification-preferences")}
          className="flex-row items-center px-4 py-4 border-b border-surface"
        >
          <Bell size={20} color="#9CA3AF" />
          <Text className="text-text-primary text-base flex-1 ml-3">
            Notification Preferences
          </Text>
          <ChevronRight size={20} color="#6B7280" />
        </Pressable>

        {/* Community Guidelines */}
        <Pressable
          onPress={() => router.push("/settings/guidelines")}
          className="flex-row items-center px-4 py-4 border-b border-surface"
        >
          <BookOpen size={20} color="#9CA3AF" />
          <Text className="text-text-primary text-base flex-1 ml-3">
            Community Guidelines
          </Text>
          <ChevronRight size={20} color="#6B7280" />
        </Pressable>

        {/* Language — disabled with "Coming Soon" badge.
            i18n is deferred to Phase 18 (FR-Q1). */}
        <View className="flex-row items-center px-4 py-4 border-b border-surface opacity-50">
          <Globe size={20} color="#9CA3AF" />
          <View className="flex-1 ml-3">
            <Text className="text-text-primary text-base">Language</Text>
            <Text className="text-text-secondary text-sm">English</Text>
          </View>
          <Badge label="Coming Soon" variant="default" />
        </View>
      </View>

      {/* ── About ────────────────────────────────────────────────────── */}
      <View className="mt-4">
        <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wide px-4 mb-2">
          About
        </Text>

        <View className="px-4 py-4 border-b border-surface">
          <Text className="text-text-primary text-base">
            Version {appVersion}
          </Text>
        </View>

        {/* Privacy Policy — placeholder, no URL defined yet */}
        <View className="flex-row items-center px-4 py-4 border-b border-surface opacity-50">
          <Text className="text-text-primary text-base flex-1">
            Privacy Policy
          </Text>
          <Badge label="Coming Soon" variant="default" />
        </View>

        {/* Terms of Service — placeholder, no URL defined yet */}
        <View className="flex-row items-center px-4 py-4 border-b border-surface opacity-50">
          <Text className="text-text-primary text-base flex-1">
            Terms of Service
          </Text>
          <Badge label="Coming Soon" variant="default" />
        </View>
      </View>

      {/* ── Sign Out ─────────────────────────────────────────────────── */}
      <View className="px-4 mt-6">
        <Pressable
          onPress={handleSignOut}
          testID="sign-out-button"
          className="flex-row items-center justify-center py-3 rounded-lg bg-red-100"
        >
          <LogOut size={20} color="#DC2626" />
          <Text className="text-red-600 font-semibold ml-2">Sign Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
