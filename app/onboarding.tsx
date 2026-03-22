// app/onboarding.tsx
//
// Onboarding wizard — a 4-step flow for new users to set up their profile.
//
// Steps:
//   0. Welcome — introduces the app
//   1. Gym Selection — favorite one or more gyms (optional, multi-select)
//   2. Grade System — choose V-Scale, Font, or YDS
//   3. Done — summary + finish button
//
// ARCHITECTURE:
// This is a single-screen wizard managed by local `step` state (not
// nested routes). Grade system is held in component state until the user
// finishes, then saved via useUpdateProfile. Favorited gyms are saved
// immediately via useToggleFavoriteGym so the favorite_gyms table is
// populated even if the user skips later steps.
//
// NAVIGATION FLOW:
// AuthGate routes new users here (onboardingCompleted === false).
// On save, useUpdateProfile's onSuccess calls refreshProfile(), which
// updates useAuth's user.onboardingCompleted to true. AuthGate's
// useEffect detects this change and redirects to /(tabs).

import React, { useState } from "react";
import {
  Text,
  View,
  Pressable,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Mountain, Check } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateProfile } from "@/hooks/useProfile";
import { useGyms, useToggleFavoriteGym } from "@/hooks/useGyms";
import { Button } from "@/components/ui/Button";
import type { GradeSystem } from "@/utils/grades";

// The three grade systems users can choose from — same as profile.tsx.
// Uses labelKey instead of label so that t() can be called at render time
// (GRADE_SYSTEMS is defined outside the component, where hooks aren't available).
const GRADE_SYSTEMS: { value: GradeSystem; labelKey: string }[] = [
  { value: "v-scale", labelKey: "gradeSystem.vScale" },
  { value: "font", labelKey: "gradeSystem.font" },
  { value: "yds", labelKey: "gradeSystem.yds" },
];

/** Total number of steps in the wizard, used for progress dots. */
const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { user, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile(refreshProfile);
  const { data: gyms } = useGyms();
  const toggleFavorite = useToggleFavoriteGym();

  // ── Local wizard state ────────────────────────────────────────────
  const [step, setStep] = useState(0);
  // Multi-select: track which gym IDs the user has favorited during onboarding.
  const [selectedGymIds, setSelectedGymIds] = useState<Set<string>>(new Set());
  const [selectedGradeSystem, setSelectedGradeSystem] =
    useState<GradeSystem>("v-scale");

  // Derive the selected gym names for the summary screen
  const selectedGymNames = gyms
    ?.filter((g: any) => selectedGymIds.has(g.id))
    .map((g: any) => g.name) ?? [];

  // ── Handlers ──────────────────────────────────────────────────────

  /** Toggle a gym's selection state and persist it to favorite_gyms. */
  function handleToggleGym(gymId: string) {
    if (!user) return;
    const isCurrentlySelected = selectedGymIds.has(gymId);

    // Update local state for instant feedback
    setSelectedGymIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        next.delete(gymId);
      } else {
        next.add(gymId);
      }
      return next;
    });

    // Persist to favorite_gyms table immediately
    toggleFavorite.mutate({
      userId: user.id,
      gymId,
      isFavorited: isCurrentlySelected,
    });
  }

  /** Save grade system preference and mark onboarding complete. */
  function handleFinish() {
    if (!user) return;
    updateProfile.mutate({
      userId: user.id,
      fields: {
        preferred_grade_system: selectedGradeSystem,
        onboarding_completed: true,
      },
    });
  }

  /** Skip setup entirely — mark onboarding complete with defaults. */
  function handleSkipAll() {
    if (!user) return;
    updateProfile.mutate({
      userId: user.id,
      fields: { onboarding_completed: true },
    });
  }

  // ── Progress Dots ─────────────────────────────────────────────────
  // Visual indicator of how far through the wizard the user is.
  // Active dot is accent-colored, inactive dots are surface-colored.

  function ProgressDots() {
    return (
      <View className="flex-row justify-center gap-2 mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            testID={`dot-${i}`}
            className={`w-2 h-2 rounded-full ${
              i === step ? "bg-accent" : "bg-surface"
            }`}
          />
        ))}
      </View>
    );
  }

  // ── Step Content ──────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 pt-8">
        <ProgressDots />

        {/* Step 0: Welcome */}
        {step === 0 && (
          <View className="flex-1 items-center justify-center">
            <Mountain size={64} color="#7C3AED" />
            <Text className="text-text-primary text-2xl font-bold mt-6 text-center">
              {t("onboarding.welcome")}
            </Text>
            <Text className="text-text-secondary text-base mt-3 text-center">
              {t("onboarding.welcomeSubtitle")}
            </Text>
            <View className="mt-10 w-full">
              <Button
                label={t("onboarding.letsGetStarted")}
                onPress={() => setStep(1)}
                size="lg"
              />
            </View>
            <Pressable onPress={handleSkipAll} className="mt-4 py-2">
              <Text className="text-text-secondary underline">{t("onboarding.skipSetup")}</Text>
            </Pressable>
          </View>
        )}

        {/* Step 1: Gym Selection (multi-select favorites) */}
        {step === 1 && (
          <View className="flex-1">
            <Text className="text-text-primary text-2xl font-bold mb-1">
              {t("onboarding.favoriteGyms")}
            </Text>
            <Text className="text-text-secondary text-sm mb-4">
              {t("onboarding.favoriteGymsSubtitle")}
            </Text>

            {/* FlatList of available gyms — tap to toggle favorite */}
            <FlatList
              data={gyms ?? []}
              keyExtractor={(item: any) => item.id}
              className="flex-1"
              renderItem={({ item }: { item: any }) => {
                const isSelected = selectedGymIds.has(item.id);
                return (
                  <Pressable
                    onPress={() => handleToggleGym(item.id)}
                    testID={`gym-item-${item.id}`}
                    className={`py-3 px-4 mb-2 rounded-lg ${
                      isSelected ? "bg-accent" : "bg-surface"
                    }`}
                  >
                    <Text
                      className={
                        isSelected
                          ? "text-white font-semibold"
                          : "text-text-primary"
                      }
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />

            {/* Bottom action buttons */}
            <View className="py-4">
              <Button
                label={t("common.next")}
                onPress={() => setStep(2)}
                size="lg"
              />
              <Pressable
                onPress={() => setStep(2)}
                className="mt-3 py-2 items-center"
              >
                <Text className="text-text-secondary">{t("common.skip")}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Step 2: Grade System */}
        {step === 2 && (
          <View className="flex-1 justify-center">
            <Text className="text-text-primary text-2xl font-bold mb-1">
              {t("onboarding.gradeSystem")}
            </Text>
            <Text className="text-text-secondary text-sm mb-6">
              {t("onboarding.gradeSystemPrompt")}
            </Text>

            {/* 3-option row — same pattern as profile.tsx grade picker */}
            <View className="flex-row gap-2 mb-8">
              {GRADE_SYSTEMS.map((gs) => (
                <Pressable
                  key={gs.value}
                  onPress={() => setSelectedGradeSystem(gs.value)}
                  testID={`grade-option-${gs.value}`}
                  className={`flex-1 py-3 items-center rounded-lg ${
                    selectedGradeSystem === gs.value
                      ? "bg-accent"
                      : "bg-surface"
                  }`}
                >
                  <Text
                    className={
                      selectedGradeSystem === gs.value
                        ? "text-white font-semibold"
                        : "text-text-primary"
                    }
                  >
                    {t(gs.labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Button
              label={t("common.next")}
              onPress={() => setStep(3)}
              size="lg"
            />
          </View>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <View className="flex-1 items-center justify-center">
            <Check size={64} color="#22C55E" />
            <Text className="text-text-primary text-2xl font-bold mt-6 text-center">
              {t("onboarding.allSet")}
            </Text>

            {/* Summary of selections */}
            <View className="mt-6 w-full bg-surface rounded-lg p-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-secondary">{t("onboarding.favoriteGymsLabel")}</Text>
                <Text className="text-text-primary font-semibold">
                  {selectedGymNames.length > 0
                    ? selectedGymNames.join(", ")
                    : t("onboarding.noGymsSelected")}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-text-secondary">{t("onboarding.gradeSystem")}</Text>
                <Text className="text-text-primary font-semibold">
                  {t(GRADE_SYSTEMS.find((gs) => gs.value === selectedGradeSystem)
                    ?.labelKey ?? selectedGradeSystem)}
                </Text>
              </View>
            </View>

            <View className="mt-10 w-full">
              <Button
                label={t("onboarding.getStarted")}
                onPress={handleFinish}
                size="lg"
                loading={updateProfile.isPending}
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
