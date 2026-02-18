// app/start-session.tsx
//
// Start Session Modal — Location-Aware Gym Finder
//
// This modal opens when the user taps the FAB (floating action button)
// in the center of the tab bar. It detects the user's GPS position,
// finds the nearest gym, and offers a quick "Start session at [gym]?"
// prompt. This eliminates manual gym selection for the common case
// where the user is already at a gym.
//
// THREE STATES:
//   1. Loading — Requesting location permission + fetching position.
//      Shows a spinner and "Finding nearby gyms..." text.
//   2. Prompt — Nearest gym found. Shows gym name, address, and two
//      buttons: "Yes, start session!" → gym page, "Choose another" → map.
//   3. Error — Location denied or no gyms with coordinates. Shows a
//      fallback message with a "Browse gyms on map" button.
//
// WHY NOT ZUSTAND?
// The loading/prompt/error state is ephemeral — it resets every time
// the modal opens. useState is simpler and more appropriate than a
// global store for single-screen, disposable state.
//
// WHY router.replace INSTEAD OF router.push?
// When the user picks a gym or taps "Browse map", we want to REPLACE
// this modal screen in the navigation stack. If we pushed, pressing
// back would return to the modal (which makes no sense — the decision
// is already made). replace() removes the modal from the stack.

import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { MapPin } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useGyms } from "@/hooks/useGyms";
import { useSession } from "@/hooks/useSession";
import { findNearestGym } from "@/utils/geo";

/**
 * Represents the three possible states of the modal.
 * Using a discriminated union makes it impossible to be in an
 * invalid state (e.g., "loading" with a gym set, or "prompt" with
 * no gym). TypeScript narrows the type in switch/if branches.
 */
type ModalState =
  | { status: "loading" }
  | { status: "prompt"; gym: { id: string; name: string; address: string | null } }
  | { status: "error"; message: string };

export default function StartSessionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: gyms } = useGyms();
  const { startSession } = useSession();
  const [state, setState] = useState<ModalState>({ status: "loading" });

  useEffect(() => {
    // Don't run the location flow until gyms have loaded from the cache/network.
    // useGyms returns undefined while the query is pending — we need the gym
    // list to run findNearestGym. Once gyms are available, we proceed.
    if (!gyms) return;

    let cancelled = false;

    async function detectNearestGym() {
      try {
        // Step 1: Request foreground location permission.
        // We only need "when in use" — no background tracking needed.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (status !== "granted") {
          setState({
            status: "error",
            message: t("session.locationPermission"),
          });
          return;
        }

        // Step 2: Get the user's current GPS position.
        // accuracy: Balanced gives ~100m precision, which is plenty for
        // determining which gym building the user is in or near.
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        // Step 3: Find the nearest gym using Haversine distance.
        // The non-null assertion (!) is safe here because the useEffect
        // guard above (`if (!gyms) return`) prevents this code from running
        // when gyms is undefined. TypeScript can't narrow across async
        // function boundaries, so we assert manually.
        const nearest = findNearestGym(
          position.coords.latitude,
          position.coords.longitude,
          gyms!
        );

        if (nearest) {
          setState({
            status: "prompt",
            gym: {
              id: nearest.id,
              name: nearest.name,
              address: nearest.address,
            },
          });
        } else {
          // All gyms have null coordinates — can't determine nearest.
          setState({
            status: "error",
            message: t("session.noGymsFound"),
          });
        }
      } catch {
        if (cancelled) return;
        setState({
          status: "error",
          message: t("session.locationError"),
        });
      }
    }

    detectNearestGym();

    // Cleanup: if the component unmounts before the async work finishes
    // (e.g., user swipes the modal away), don't call setState on an
    // unmounted component.
    return () => {
      cancelled = true;
    };
  }, [gyms, t]);

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      {/* Loading state — spinner + message while fetching location */}
      {state.status === "loading" && (
        <View className="items-center" testID="loading-state">
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text className="text-text-secondary text-base mt-4">
            {t("session.findingGyms")}
          </Text>
        </View>
      )}

      {/* Prompt state — nearest gym found, ask user to confirm */}
      {state.status === "prompt" && (
        <View className="items-center w-full" testID="prompt-state">
          {/* MapPin icon — visual cue that this is location-related */}
          <MapPin size={48} color="#7C3AED" />

          <Text className="text-text-secondary text-base mt-4">
            {t("session.startSessionAt")}
          </Text>

          {/* Gym name in accent color — the focal point of the modal */}
          <Text className="text-accent text-2xl font-bold mt-1 text-center">
            {state.gym.name}
          </Text>

          {/* Gym address (if available) for confirmation */}
          {state.gym.address && (
            <Text className="text-text-secondary text-sm mt-1 text-center">
              {state.gym.address}
            </Text>
          )}

          {/* Primary CTA — start the session in Zustand store and navigate
              to the gym page where the user can browse routes and log ascents. */}
          <View className="w-full mt-8">
            <Button
              label={t("session.yesStart")}
              onPress={() => {
                startSession(state.gym.id);
                router.replace(`/gym/${state.gym.id}`);
              }}
              size="lg"
            />
          </View>

          {/* Secondary action — user wants a different gym, go to map */}
          <View className="mt-3">
            <Button
              label={t("session.chooseAnother")}
              variant="ghost"
              onPress={() => router.replace("/(tabs)/map")}
            />
          </View>
        </View>
      )}

      {/* Error state — location denied or no gyms available */}
      {state.status === "error" && (
        <View className="items-center w-full" testID="error-state">
          <MapPin size={48} color="#6B7280" />

          <Text className="text-text-secondary text-base mt-4 text-center">
            {state.message}
          </Text>

          {/* Fallback CTA — browse gyms manually on the map */}
          <View className="w-full mt-8">
            <Button
              label={t("session.browseGyms")}
              onPress={() => router.replace("/(tabs)/map")}
              size="lg"
            />
          </View>
        </View>
      )}
    </View>
  );
}
