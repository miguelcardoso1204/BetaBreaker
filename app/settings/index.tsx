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
//   3. Language — interactive picker modal with supported languages.
//      Uses changeLanguage() from lib/i18n.ts to switch + persist.
//
//   4. About — app version from expo-constants, plus disabled Privacy Policy
//      and Terms of Service rows (no URLs defined yet).
//
//   5. Sign Out — red-styled button with Alert confirmation before calling
//      signOut() from useAuth.

import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, Modal, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import {
  ArrowLeft,
  ChevronRight,
  Bell,
  BookOpen,
  Globe,
  LogOut,
  Check,
  Download,
  Trash2,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateProfile, useExportData, useDeleteAccount } from "@/hooks/useProfile";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { changeLanguage, SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { useAccessibilityStore } from "@/stores";
import type { GradeSystem } from "@/utils/grades";

// The three grade systems users can choose from — same set as the profile
// edit mode, but here changes are persisted immediately on tap.
// Translation keys are used for labels so they update when language changes.
const GRADE_SYSTEMS: { value: GradeSystem; labelKey: string }[] = [
  { value: "v-scale", labelKey: "gradeSystem.vScale" },
  { value: "font", labelKey: "gradeSystem.font" },
  { value: "yds", labelKey: "gradeSystem.yds" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
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

  // Language picker modal visibility state
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  // Color-aware mode toggle — shows color names next to hold swatches
  // for users who have difficulty distinguishing colors.
  const colorAwareMode = useAccessibilityStore((s) => s.colorAwareMode);
  const setColorAwareMode = useAccessibilityStore((s) => s.setColorAwareMode);

  /** Persist grade system change immediately (no save button needed). */
  function handleGradeChange(gs: GradeSystem) {
    if (!user || gs === currentGradeSystem) return;
    updateProfile.mutate({
      userId: user.id,
      fields: { preferred_grade_system: gs },
    });
  }

  // Account action mutations — export data and delete account
  const exportData = useExportData();
  const deleteAccount = useDeleteAccount(signOut);

  /** Export user data — confirm first, then trigger the mutation. */
  function handleExportData() {
    Alert.alert(
      t("profile.exportConfirmTitle"),
      t("profile.exportConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.export"),
          onPress: async () => {
            await exportData.mutateAsync();
            Alert.alert(t("profile.exportCompleteTitle"), t("profile.exportCompleteBody"));
          },
        },
      ]
    );
  }

  /** Delete account — double-confirm before triggering the mutation. */
  function handleDeleteAccount() {
    Alert.alert(
      t("profile.deleteConfirmTitle"),
      t("profile.deleteConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await deleteAccount.mutateAsync();
          },
        },
      ]
    );
  }

  /** Show confirmation dialog before signing out. */
  function handleSignOut() {
    Alert.alert(
      t("settings.signOutConfirmTitle"),
      t("settings.signOutConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.signOut"),
          style: "destructive",
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  }

  /** Handle language selection from the picker modal. */
  async function handleLanguageSelect(code: string) {
    setLanguagePickerVisible(false);
    await changeLanguage(code);
  }

  // Find the display name for the current language
  const currentLanguageName =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.name ??
    "English";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Header: back button + title */}
      <View className="px-4 pt-2 pb-4 flex-row items-center">
        <IconButton
          icon={ArrowLeft}
          label={t("common.goBack")}
          onPress={() => router.back()}
          size={24}
          color="#FFFFFF"
        />
        <Text className="text-text-primary text-xl font-bold ml-3">
          {t("settings.title")}
        </Text>
      </View>

      {/* ── Grade System ────────────────────────────────────────────── */}
      <View className="px-4 py-3">
        <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wide mb-2">
          {t("settings.gradeSystem")}
        </Text>
        <View className="flex-row gap-2">
          {GRADE_SYSTEMS.map((gs) => (
            <Pressable
              key={gs.value}
              onPress={() => handleGradeChange(gs.value)}
              testID={`grade-option-${gs.value}`}
              accessibilityRole="radio"
              accessibilityLabel={t(gs.labelKey)}
              accessibilityState={{ selected: currentGradeSystem === gs.value }}
              className={`flex-1 py-2 items-center rounded-lg min-h-[44px] justify-center ${
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
                {t(gs.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Navigation Rows ──────────────────────────────────────────── */}
      <View className="mt-4">
        <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wide px-4 mb-2">
          {t("settings.preferences")}
        </Text>

        {/* Notification Preferences */}
        <Pressable
          onPress={() => router.push("/settings/notification-preferences")}
          accessibilityRole="button"
          accessibilityLabel={t("settings.notificationPreferences")}
          className="flex-row items-center px-4 py-4 border-b border-surface"
        >
          <Bell size={20} color="#9CA3AF" />
          <Text className="text-text-primary text-base flex-1 ml-3">
            {t("settings.notificationPreferences")}
          </Text>
          <ChevronRight size={20} color="#6B7280" />
        </Pressable>

        {/* Community Guidelines */}
        <Pressable
          onPress={() => router.push("/settings/guidelines")}
          accessibilityRole="button"
          accessibilityLabel={t("settings.communityGuidelines")}
          className="flex-row items-center px-4 py-4 border-b border-surface"
        >
          <BookOpen size={20} color="#9CA3AF" />
          <Text className="text-text-primary text-base flex-1 ml-3">
            {t("settings.communityGuidelines")}
          </Text>
          <ChevronRight size={20} color="#6B7280" />
        </Pressable>

        {/* Color-aware mode — shows color names next to hold color swatches
            for users who have difficulty distinguishing colors (FR-Q2). */}
        <Pressable
          testID="color-aware-toggle"
          onPress={() => setColorAwareMode(!colorAwareMode)}
          accessibilityRole="switch"
          accessibilityLabel={t("settings.colorAwareMode")}
          accessibilityState={{ checked: colorAwareMode }}
          className="flex-row items-center px-4 py-4 border-b border-surface"
        >
          <View className="flex-1">
            <Text className="text-text-primary text-base">
              {t("settings.colorAwareMode")}
            </Text>
            <Text className="text-text-secondary text-sm">
              {t("settings.colorAwareModeDesc")}
            </Text>
          </View>
          <Switch
            value={colorAwareMode}
            onValueChange={setColorAwareMode}
            trackColor={{ true: "#7C3AED" }}
          />
        </Pressable>

        {/* Language — interactive picker that opens a modal */}
        <Pressable
          testID="language-row"
          onPress={() => setLanguagePickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t("settings.language")}
          className="flex-row items-center px-4 py-4 border-b border-surface"
        >
          <Globe size={20} color="#9CA3AF" />
          <View className="flex-1 ml-3">
            <Text className="text-text-primary text-base">
              {t("settings.language")}
            </Text>
            <Text className="text-text-secondary text-sm">
              {currentLanguageName}
            </Text>
          </View>
          <ChevronRight size={20} color="#6B7280" />
        </Pressable>
      </View>

      {/* ── About ────────────────────────────────────────────────────── */}
      <View className="mt-4">
        <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wide px-4 mb-2">
          {t("settings.about")}
        </Text>

        <View className="px-4 py-4 border-b border-surface">
          <Text className="text-text-primary text-base">
            {t("settings.version", { version: appVersion })}
          </Text>
        </View>

        {/* Privacy Policy — placeholder, no URL defined yet */}
        <View className="flex-row items-center px-4 py-4 border-b border-surface opacity-50">
          <Text className="text-text-primary text-base flex-1">
            {t("settings.privacyPolicy")}
          </Text>
          <Badge label={t("common.comingSoon")} variant="default" />
        </View>

        {/* Terms of Service — placeholder, no URL defined yet */}
        <View className="flex-row items-center px-4 py-4 border-b border-surface opacity-50">
          <Text className="text-text-primary text-base flex-1">
            {t("settings.termsOfService")}
          </Text>
          <Badge label={t("common.comingSoon")} variant="default" />
        </View>
      </View>

      {/* ── Account ──────────────────────────────────────────────────── */}
      <View className="mt-4">
        <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wide px-4 mb-2">
          {t("profile.account")}
        </Text>

        {/* Export data */}
        <Pressable
          onPress={handleExportData}
          testID="export-data-button"
          accessibilityRole="button"
          accessibilityLabel={t("profile.exportData")}
          className="flex-row items-center px-4 py-4 border-b border-surface"
        >
          <Download size={20} color="#9CA3AF" />
          <Text className="text-text-primary text-base flex-1 ml-3">
            {t("profile.exportData")}
          </Text>
        </Pressable>

        {/* Delete account */}
        <Pressable
          onPress={handleDeleteAccount}
          testID="delete-account-button"
          accessibilityRole="button"
          accessibilityLabel={t("profile.deleteAccount")}
          className="flex-row items-center px-4 py-4 border-b border-surface"
        >
          <Trash2 size={20} color="#DC2626" />
          <Text className="text-red-600 text-base flex-1 ml-3">
            {t("profile.deleteAccount")}
          </Text>
        </Pressable>
      </View>

      {/* ── Sign Out ─────────────────────────────────────────────────── */}
      <View className="px-4 mt-6">
        <Pressable
          onPress={handleSignOut}
          testID="sign-out-button"
          accessibilityRole="button"
          accessibilityLabel={t("settings.signOut")}
          className="flex-row items-center justify-center py-3 rounded-lg bg-red-100"
        >
          <LogOut size={20} color="#DC2626" />
          <Text className="text-red-600 font-semibold ml-2">
            {t("settings.signOut")}
          </Text>
        </Pressable>
      </View>

      {/* ── Language Picker Modal ──────────────────────────────────── */}
      {/* A simple bottom-sheet style modal with the list of supported
          languages. Tapping one calls changeLanguage() which switches
          the language and persists to SecureStore. */}
      <Modal
        visible={languagePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguagePickerVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={() => setLanguagePickerVisible(false)}
        >
          <Pressable className="bg-background rounded-t-2xl pb-8 pt-4 px-4">
            <Text className="text-text-primary text-lg font-bold mb-4 text-center">
              {t("settings.languagePickerTitle")}
            </Text>

            {SUPPORTED_LANGUAGES.map((lang) => {
              const isActive = i18n.language === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  testID={`language-option-${lang.code}`}
                  onPress={() => handleLanguageSelect(lang.code)}
                  accessibilityRole="radio"
                  accessibilityLabel={lang.name}
                  accessibilityState={{ selected: isActive }}
                  className={`flex-row items-center px-4 py-4 rounded-lg mb-2 ${
                    isActive ? "bg-accent/10" : ""
                  }`}
                >
                  <Text
                    className={`text-base flex-1 ${
                      isActive
                        ? "text-accent font-semibold"
                        : "text-text-primary"
                    }`}
                  >
                    {lang.name}
                  </Text>
                  {isActive && <Check size={20} color="#7C3AED" />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
    </SafeAreaView>
  );
}
