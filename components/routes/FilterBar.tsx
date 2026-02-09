/**
 * FilterBar — Grade Range + Sort Controls for Route List
 *
 * A horizontal row of pill-shaped buttons that let climbers filter routes by
 * grade range and choose a sort order. Tapping a grade pill opens a modal with
 * a scrollable list of grade labels (e.g., V0–V12) plus an "Any" option.
 * Tapping the sort pill toggles between "Newest" and "Grade".
 *
 * WHY MODAL INSTEAD OF A THIRD-PARTY PICKER?
 * React Native's built-in Picker behaves differently on iOS and Android.
 * A simple Modal + ScrollView gives us consistent behavior and styling on
 * both platforms without adding another dependency.
 *
 * GRADE CONVERSION:
 * The route list stores grades as canonical integers (0–30), but users see
 * friendly labels like "V4" or "6a+". This component uses:
 *   - `getGradeRange(system)` → unique display labels for the picker list
 *   - `canonicalToDisplay()` → show current filter value as a label
 *   - `displayToCanonical()` → convert selected label back to an integer
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronDown } from "lucide-react-native";
import {
  getGradeRange,
  canonicalToDisplay,
  displayToCanonical,
} from "@/utils/grades";
import type { GradeSystem } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────────────

export interface FilterBarProps {
  /** Current minimum grade filter (canonical integer), or undefined for "Any". */
  gradeMin?: number;
  /** Current maximum grade filter (canonical integer), or undefined for "Any". */
  gradeMax?: number;
  /** Current sort order: "newest" sorts by creation date, "grade" by difficulty. */
  sortBy: "newest" | "grade";
  /** The grade system to use for display labels (e.g., "v-scale" → V0, V1...). */
  gradeSystem: GradeSystem;
  /** Called when the user selects a new minimum grade (or undefined for "Any"). */
  onGradeMinChange: (value: number | undefined) => void;
  /** Called when the user selects a new maximum grade (or undefined for "Any"). */
  onGradeMaxChange: (value: number | undefined) => void;
  /** Called when the user toggles the sort order. */
  onSortByChange: (value: "newest" | "grade") => void;
}

// ── Component ────────────────────────────────────────────────────

export function FilterBar({
  gradeMin,
  gradeMax,
  sortBy,
  gradeSystem,
  onGradeMinChange,
  onGradeMaxChange,
  onSortByChange,
}: FilterBarProps) {
  // Track which grade picker modal is open: "min", "max", or null (closed).
  // Using a single state variable instead of two booleans avoids the
  // impossible state where both modals are open simultaneously.
  const [activePicker, setActivePicker] = useState<"min" | "max" | null>(null);

  // Get the list of unique grade labels for the picker (e.g., ["V0", "V1", ... "V12"])
  const gradeLabels = getGradeRange(gradeSystem);

  // Convert the current canonical filter values to display strings for the pills.
  // If no filter is set (undefined), show "Any" to indicate no restriction.
  const minLabel =
    gradeMin !== undefined
      ? `Min: ${canonicalToDisplay(gradeMin, gradeSystem)}`
      : "Min: Any";
  const maxLabel =
    gradeMax !== undefined
      ? `Max: ${canonicalToDisplay(gradeMax, gradeSystem)}`
      : "Max: Any";

  // Sort pill label — shows the current sort mode with a directional arrow
  const sortLabel = sortBy === "newest" ? "Newest ↓" : "Grade ↑";

  /**
   * Handle grade selection from the picker modal.
   * Converts the display label back to a canonical integer and calls
   * the appropriate onChange callback.
   */
  const handleGradeSelect = (label: string | null) => {
    // null means the user selected "Any" — clear the filter
    const canonical = label ? displayToCanonical(label, gradeSystem) : undefined;
    // Convert null from displayToCanonical to undefined for the callback
    const value = canonical ?? undefined;

    if (activePicker === "min") {
      onGradeMinChange(value);
    } else if (activePicker === "max") {
      onGradeMaxChange(value);
    }
    setActivePicker(null);
  };

  /** Toggle sort between "newest" and "grade" on each tap. */
  const handleSortToggle = () => {
    onSortByChange(sortBy === "newest" ? "grade" : "newest");
  };

  return (
    <View className="px-4 py-2">
      {/* Horizontal row of filter pills */}
      <View className="flex-row gap-2">
        {/* Min grade pill */}
        <Pressable
          testID="filter-grade-min"
          onPress={() => setActivePicker("min")}
          className="flex-row items-center bg-surface px-3 py-1.5 rounded-full"
        >
          <Text className="text-text-secondary text-sm">{minLabel}</Text>
          <ChevronDown size={14} className="text-muted ml-1" />
        </Pressable>

        {/* Max grade pill */}
        <Pressable
          testID="filter-grade-max"
          onPress={() => setActivePicker("max")}
          className="flex-row items-center bg-surface px-3 py-1.5 rounded-full"
        >
          <Text className="text-text-secondary text-sm">{maxLabel}</Text>
          <ChevronDown size={14} className="text-muted ml-1" />
        </Pressable>

        {/* Sort toggle pill */}
        <Pressable
          testID="filter-sort"
          onPress={handleSortToggle}
          className="flex-row items-center bg-surface px-3 py-1.5 rounded-full"
        >
          <Text className="text-text-secondary text-sm">{sortLabel}</Text>
        </Pressable>
      </View>

      {/* Grade picker modal — shared for both min and max pickers.
          The `activePicker` state controls visibility and which callback fires. */}
      <Modal
        visible={activePicker !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActivePicker(null)}
      >
        <SafeAreaView className="flex-1 bg-background">
          {/* Header with title and close button */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-surface">
            <Text className="text-white font-bold text-lg">
              {activePicker === "min" ? "Min Grade" : "Max Grade"}
            </Text>
            <Pressable
              testID="picker-close"
              onPress={() => setActivePicker(null)}
            >
              <Text className="text-accent text-base">Close</Text>
            </Pressable>
          </View>

          {/* Scrollable grade list */}
          <ScrollView className="flex-1" testID="grade-picker-list">
            {/* "Any" option — clears the filter */}
            <Pressable
              testID="grade-option-any"
              onPress={() => handleGradeSelect(null)}
              className="px-4 py-3 border-b border-surface"
            >
              <Text className="text-white text-base">Any</Text>
            </Pressable>

            {/* One row per unique grade label */}
            {gradeLabels.map((label) => (
              <Pressable
                key={label}
                testID={`grade-option-${label}`}
                onPress={() => handleGradeSelect(label)}
                className="px-4 py-3 border-b border-surface"
              >
                <Text className="text-white text-base">{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
