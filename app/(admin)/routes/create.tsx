/**
 * Create Route Screen — Form for Adding a New Climbing Route
 *
 * Admins fill in route details: grade (required), name, color, wall section,
 * and optionally assign a setter. On submit, useCreateRoute fires an INSERT
 * into the routes table. On success, navigates back to the route list.
 *
 * GRADE PICKER:
 * Uses GRADE_TABLE to build a chip-style picker of unique V-scale grades.
 * Each chip maps to the first canonical integer for that V-scale label
 * (e.g., V4 → canonical 10). This keeps things simple while covering
 * the full gym-relevant range (V0–V12).
 *
 * SETTER PICKER:
 * useGymSetters fetches users with setter/admin roles at the gym.
 * Displayed as tappable chips — the selected setter is highlighted.
 *
 * DATA FLOW:
 *   1. Admin fills form → local state holds field values
 *   2. Submit → useCreateRoute().mutate({ gymId, name, canonicalGrade, ... })
 *   3. Hook transforms camelCase → snake_case → routeService.createRoute()
 *   4. On success → router.back() to return to route list
 */

import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useCreateRoute, useGymSetters } from "@/hooks/useAdminRoutes";
import { GRADE_TABLE } from "@/utils/grades";

/**
 * Build a deduplicated list of V-scale grades for the picker.
 * Multiple canonical values can map to the same V-scale label (e.g., V4 = 10,11,12).
 * We take the first canonical value for each unique label — this is the value
 * stored in the database when the admin picks that grade.
 */
const GRADE_OPTIONS = GRADE_TABLE.reduce<{ label: string; canonical: number }[]>(
  (acc, entry, index) => {
    // Only add if we haven't seen this V-scale label before
    if (!acc.some((g) => g.label === entry.v)) {
      acc.push({ label: entry.v, canonical: index });
    }
    return acc;
  },
  []
);

export default function CreateRouteScreen() {
  const { user, adminGymId } = useAuth();
  const router = useRouter();
  const createRoute = useCreateRoute();
  const { setters } = useGymSetters(adminGymId);

  // ── Form state ────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [canonicalGrade, setCanonicalGrade] = useState<number | null>(null);
  const [color, setColor] = useState("");
  const [wallSection, setWallSection] = useState("");
  const [setterId, setSetterId] = useState<string | null>(null);

  // ── Submit handler ────────────────────────────────────────────────
  function handleSubmit() {
    // Grade is the only required field — can't create a route without difficulty
    if (canonicalGrade === null) return;
    if (!adminGymId) return;

    createRoute.mutate(
      {
        gymId: adminGymId,
        name: name.trim() || undefined,
        canonicalGrade,
        color: color.trim() || undefined,
        wallSection: wallSection.trim() || undefined,
        setterId: setterId ?? undefined,
      },
      {
        onSuccess: () => router.back(),
      }
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background px-4 pt-4">
      <Text className="text-xl font-bold text-text-primary mb-4">
        New Route
      </Text>

      {/* Route name (optional — some gyms number routes instead of naming) */}
      <Text className="text-text-secondary text-sm mb-1">Name</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        placeholder="Route name"
        placeholderTextColor="#9ca3af"
        value={name}
        onChangeText={setName}
      />

      {/* Grade picker — chip-style V-scale selector (required) */}
      <Text className="text-text-secondary text-sm mb-2">
        Grade {canonicalGrade === null ? "(required)" : ""}
      </Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {GRADE_OPTIONS.map((grade) => (
          <Pressable
            key={grade.canonical}
            onPress={() => setCanonicalGrade(grade.canonical)}
            accessibilityRole="button"
            className={`px-3 py-2 rounded-lg ${
              canonicalGrade === grade.canonical ? "bg-accent" : "bg-surface"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                canonicalGrade === grade.canonical
                  ? "text-white"
                  : "text-text-secondary"
              }`}
            >
              {grade.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Color (hold/tape color at the wall) */}
      <Text className="text-text-secondary text-sm mb-1">Color</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        placeholder="Hold color"
        placeholderTextColor="#9ca3af"
        value={color}
        onChangeText={setColor}
      />

      {/* Wall section */}
      <Text className="text-text-secondary text-sm mb-1">Wall Section</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        placeholder="Wall section"
        placeholderTextColor="#9ca3af"
        value={wallSection}
        onChangeText={setWallSection}
      />

      {/* Setter assignment — tappable chips from gym setter list */}
      <Text className="text-text-secondary text-sm mb-2">Setter</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {/* "None" option to clear setter assignment */}
        <Pressable
          onPress={() => setSetterId(null)}
          accessibilityRole="button"
          className={`px-3 py-2 rounded-lg ${
            setterId === null ? "bg-accent" : "bg-surface"
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              setterId === null ? "text-white" : "text-text-secondary"
            }`}
          >
            None
          </Text>
        </Pressable>
        {setters.map((setter: any) => (
          <Pressable
            key={setter.user_id}
            onPress={() => setSetterId(setter.user_id)}
            accessibilityRole="button"
            className={`px-3 py-2 rounded-lg ${
              setterId === setter.user_id ? "bg-accent" : "bg-surface"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                setterId === setter.user_id
                  ? "text-white"
                  : "text-text-secondary"
              }`}
            >
              {setter.profile?.display_name ?? "Unknown"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Submit button */}
      <Pressable
        onPress={handleSubmit}
        accessibilityRole="button"
        className="bg-accent py-3 rounded-lg items-center mt-2 mb-8"
      >
        <Text className="text-white font-bold text-base">Create Route</Text>
      </Pressable>
    </ScrollView>
  );
}
