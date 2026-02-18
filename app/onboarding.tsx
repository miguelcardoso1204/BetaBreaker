// app/onboarding.tsx
//
// Onboarding wizard — a 4-step flow for new users to set up their profile.
//
// Steps:
//   0. Welcome — introduces the app
//   1. Gym Selection — pick a home gym (optional)
//   2. Grade System — choose V-Scale, Font, or YDS
//   3. Done — summary + finish button
//
// ARCHITECTURE:
// This is a single-screen wizard managed by local `step` state (not
// nested routes). All selections are held in component state until the
// user finishes, then batch-saved via useUpdateProfile in one mutation.
//
// NAVIGATION FLOW:
// AuthGate routes new users here (onboardingCompleted === false).
// On save, useUpdateProfile's onSuccess calls refreshProfile(), which
// updates useAuth's user.onboardingCompleted to true. AuthGate's
// useEffect detects this change and redirects to /(tabs).
//
// WHY A BATCH SAVE?
// One mutation is simpler and faster than saving each step individually.
// If the user backs out before finishing, no partial state is written.

import React, { useState } from "react";
import {
  Text,
  View,
  Pressable,
  FlatList,
  SafeAreaView,
} from "react-native";
import { Mountain, Check } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateProfile } from "@/hooks/useProfile";
import { useGyms } from "@/hooks/useGyms";
import { Button } from "@/components/ui/Button";
import type { GradeSystem } from "@/utils/grades";

// The three grade systems users can choose from — same as profile.tsx
const GRADE_SYSTEMS: { value: GradeSystem; label: string }[] = [
  { value: "v-scale", label: "V-Scale" },
  { value: "font", label: "Font" },
  { value: "yds", label: "YDS" },
];

/** Total number of steps in the wizard, used for progress dots. */
const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile(refreshProfile);
  const { data: gyms } = useGyms();

  // ── Local wizard state ────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [selectedGradeSystem, setSelectedGradeSystem] =
    useState<GradeSystem>("v-scale");

  // Derive the selected gym's name for the summary screen
  const selectedGymName =
    gyms?.find((g: any) => g.id === selectedGymId)?.name ?? null;

  // ── Handlers ──────────────────────────────────────────────────────

  /** Save all preferences and mark onboarding complete. */
  function handleFinish() {
    if (!user) return;
    updateProfile.mutate({
      userId: user.id,
      fields: {
        home_gym_id: selectedGymId,
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
              Welcome to Beta Breaker
            </Text>
            <Text className="text-text-secondary text-base mt-3 text-center">
              Track your climbing, share beta, compete with friends.
            </Text>
            <View className="mt-10 w-full">
              <Button
                label="Let's get started"
                onPress={() => setStep(1)}
                size="lg"
              />
            </View>
            <Pressable onPress={handleSkipAll} className="mt-4 py-2">
              <Text className="text-text-secondary underline">Skip setup</Text>
            </Pressable>
          </View>
        )}

        {/* Step 1: Gym Selection */}
        {step === 1 && (
          <View className="flex-1">
            <Text className="text-text-primary text-2xl font-bold mb-1">
              Select Your Home Gym
            </Text>
            <Text className="text-text-secondary text-sm mb-4">
              You can change this later in settings.
            </Text>

            {/* FlatList of available gyms — tap to select, tap again to deselect */}
            <FlatList
              data={gyms ?? []}
              keyExtractor={(item: any) => item.id}
              className="flex-1"
              renderItem={({ item }: { item: any }) => {
                const isSelected = selectedGymId === item.id;
                return (
                  <Pressable
                    onPress={() =>
                      setSelectedGymId(isSelected ? null : item.id)
                    }
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
                label="Next"
                onPress={() => setStep(2)}
                size="lg"
              />
              <Pressable
                onPress={() => {
                  setSelectedGymId(null);
                  setStep(2);
                }}
                className="mt-3 py-2 items-center"
              >
                <Text className="text-text-secondary">Skip</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Step 2: Grade System */}
        {step === 2 && (
          <View className="flex-1 justify-center">
            <Text className="text-text-primary text-2xl font-bold mb-1">
              Grade System
            </Text>
            <Text className="text-text-secondary text-sm mb-6">
              How do you read grades?
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
                    {gs.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Button
              label="Next"
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
              You're all set!
            </Text>

            {/* Summary of selections */}
            <View className="mt-6 w-full bg-surface rounded-lg p-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-secondary">Home Gym</Text>
                <Text className="text-text-primary font-semibold">
                  {selectedGymName ?? "No gym selected"}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-text-secondary">Grade System</Text>
                <Text className="text-text-primary font-semibold">
                  {GRADE_SYSTEMS.find((gs) => gs.value === selectedGradeSystem)
                    ?.label ?? selectedGradeSystem}
                </Text>
              </View>
            </View>

            <View className="mt-10 w-full">
              <Button
                label="Get Started"
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
