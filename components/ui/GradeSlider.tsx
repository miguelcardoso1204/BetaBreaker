/**
 * GradeSlider — Horizontal Slider for Selecting a Climbing Grade
 *
 * Lets the user pick a canonical grade (0–30) using a horizontal slider.
 * The selected grade is displayed as a human-readable label (e.g. "V4")
 * above the track, with min/max labels at each end.
 *
 * Used on the ascent form so climbers can indicate what grade they think
 * a route should be. The canonical integer maps directly to the
 * `perceived_grade` column in route_ascents.
 */

import React from "react";
import { View, Text } from "react-native";
import Slider from "@react-native-community/slider";
import { canonicalToDisplay, type GradeSystem } from "@/utils/grades";

export interface GradeSliderProps {
  /** Current canonical grade value (0–30) */
  value: number;
  /** Called with the new canonical grade when the user moves the slider */
  onChange: (canonical: number) => void;
  /** Which grade system to display labels in (default: "v-scale") */
  gradeSystem?: GradeSystem;
  /** Optional testID for the slider */
  testID?: string;
}

export function GradeSlider({
  value,
  onChange,
  gradeSystem = "v-scale",
  testID = "grade-slider",
}: GradeSliderProps) {
  // Convert the current canonical value to a display label
  const displayLabel = canonicalToDisplay(value, gradeSystem);
  const minLabel = canonicalToDisplay(0, gradeSystem);
  const maxLabel = canonicalToDisplay(30, gradeSystem);

  return (
    <View>
      {/* Selected grade label — centered above the slider */}
      <Text
        testID="grade-slider-value"
        className="text-accent text-lg font-bold text-center mb-1"
      >
        {displayLabel}
      </Text>

      {/* Slider track */}
      <Slider
        testID={testID}
        minimumValue={0}
        maximumValue={30}
        step={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor="#6366f1"
        maximumTrackTintColor="#3f3f46"
        thumbTintColor="#6366f1"
      />

      {/* Min/max labels below the slider */}
      <View className="flex-row justify-between mt-1">
        <Text className="text-text-secondary text-xs">{minLabel}</Text>
        <Text className="text-text-secondary text-xs">{maxLabel}</Text>
      </View>
    </View>
  );
}
