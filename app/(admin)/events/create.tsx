/**
 * Create Event Screen — Form for New Competition Events
 *
 * Admins fill in event details: name, scoring model, start/end dates.
 * On submit, useCreateEvent fires an INSERT into the events table with
 * status defaulting to 'draft'. On success, navigates back to the list.
 *
 * FORM FIELDS:
 *   - Name: free text input (required)
 *   - Scoring model: 4 options as selectable chips
 *   - Start date: date string input (simplified — a future iteration
 *     will use a proper date picker component)
 *   - End date: date string input
 *
 * WHY NOT A REAL DATE PICKER?
 * Date pickers require native module support (e.g., @react-native-community/
 * datetimepicker). For this step, we use text inputs with ISO date strings.
 * Step 20 (polish) will add proper date picker components.
 *
 * DATA FLOW:
 *   1. Admin fills form → local state holds field values
 *   2. Submit → useCreateEvent().mutate({ gymId, name, scoringModel, ... })
 *   3. Hook transforms camelCase → snake_case → eventsService.createEvent()
 *   4. On success → router.back() to return to event list
 */

import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useCreateEvent } from "@/hooks/useEvents";
import type { ScoringModel } from "@/services/events.service";

/** The four scoring models with display labels. */
const SCORING_OPTIONS: { value: ScoringModel; label: string }[] = [
  { value: "tops_and_zones", label: "Tops & Zones" },
  { value: "points", label: "Points" },
  { value: "thousand_divide_by", label: "1000/Attempts" },
  { value: "redpoint", label: "Redpoint" },
];

export default function CreateEventScreen() {
  const { user, adminGymId } = useAuth();
  const router = useRouter();
  const createEvent = useCreateEvent();

  // ── Form state ─────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [scoringModel, setScoringModel] =
    useState<ScoringModel>("tops_and_zones");

  // Default dates: start = tomorrow 9am, end = tomorrow 6pm (UTC).
  // These are ISO strings for simplicity — a date picker would provide
  // a better UX but adds native module complexity.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultStart = `${tomorrow.toISOString().split("T")[0]}T09:00:00Z`;
  const defaultEnd = `${tomorrow.toISOString().split("T")[0]}T18:00:00Z`;

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  // ── Submit handler ─────────────────────────────────────────────────
  function handleSubmit() {
    // Validate: name is required
    if (!name.trim()) return;
    if (!adminGymId) return;

    createEvent.mutate(
      {
        gymId: adminGymId,
        name: name.trim(),
        scoringModel,
        startDate,
        endDate,
      },
      {
        onSuccess: () => router.back(),
      }
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background px-4 pt-4">
      <Text className="text-xl font-bold text-text-primary mb-4">
        New Event
      </Text>

      {/* Event name */}
      <Text className="text-text-secondary text-sm mb-1">Name</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        placeholder="Event name"
        placeholderTextColor="#9ca3af"
        value={name}
        onChangeText={setName}
      />

      {/* Scoring model selection — chip-style buttons */}
      <Text className="text-text-secondary text-sm mb-2">Scoring Model</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {SCORING_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => setScoringModel(option.value)}
            accessibilityRole="button"
            className={`px-3 py-2 rounded-lg ${
              scoringModel === option.value ? "bg-accent" : "bg-surface"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                scoringModel === option.value
                  ? "text-white"
                  : "text-text-secondary"
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Start date */}
      <Text className="text-text-secondary text-sm mb-1">Start Date</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        placeholder="YYYY-MM-DDTHH:MM:SSZ"
        placeholderTextColor="#9ca3af"
        value={startDate}
        onChangeText={setStartDate}
      />

      {/* End date */}
      <Text className="text-text-secondary text-sm mb-1">End Date</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        placeholder="YYYY-MM-DDTHH:MM:SSZ"
        placeholderTextColor="#9ca3af"
        value={endDate}
        onChangeText={setEndDate}
      />

      {/* Submit button */}
      <Pressable
        onPress={handleSubmit}
        accessibilityRole="button"
        className="bg-accent py-3 rounded-lg items-center mt-2 mb-8"
      >
        <Text className="text-white font-bold text-base">Create Event</Text>
      </Pressable>
    </ScrollView>
  );
}
