/**
 * GradePyramid — Horizontal Bar Chart of Send Distribution by Grade
 *
 * A pure presentational component that renders a horizontal bar chart
 * showing how many successful ascents (sends + flashes) the user has
 * at each grade. This is the core visualization for the Pro analytics
 * dashboard (FR-E1).
 *
 * WHY NO CHARTING LIBRARY?
 * Horizontal bars are trivial with React Native `View` components and
 * percentage-based flex widths. Adding a full charting library (e.g.,
 * react-native-svg-charts, victory-native) for a single bar chart would
 * be overkill — it'd add ~200KB to the bundle for something achievable
 * with a few Views and Texts.
 *
 * LAYOUT:
 * ```
 * V4  ██████████████████████  5
 * V3  ████████████████        4
 * V2  ██████████████████████████████  8
 * V1  ████████                2
 * V0  ████                    1
 * ```
 * Each row: grade label (left) → colored bar (center) → count (right).
 * Bar width is a percentage of the maximum count, so the widest bar
 * always fills the available space.
 *
 * PRESENTATIONAL PATTERN:
 * This component receives pre-computed data as props. It does NOT fetch
 * data or check entitlements — the parent screen (or useGradePyramid hook)
 * handles that. This makes the component trivially testable.
 */

import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { canonicalToDisplay } from "@/utils/grades";
import type { GradeSystem } from "@/lib/constants";
import type { GradePyramidEntry } from "@/services/sessions.service";

/**
 * Props for the GradePyramid component.
 */
export interface GradePyramidProps {
  /** Array of { grade, count } entries sorted ascending by grade. */
  data: GradePyramidEntry[];
  /** Which grade display system to use for labels (V-scale, Font, YDS). */
  gradeSystem: GradeSystem;
  /** Optional testID for the outer container. */
  testID?: string;
}

/**
 * GradePyramid — renders grade distribution as horizontal bars.
 *
 * When data is empty, shows a "No sends yet" placeholder message
 * so the screen never renders an empty/broken chart.
 */
export function GradePyramid({ data, gradeSystem, testID }: GradePyramidProps) {
  const { t } = useTranslation();

  // Handle empty state — user has no sends in the selected period.
  if (data.length === 0) {
    return (
      <View testID={testID} className="py-8 items-center">
        <Text className="text-text-secondary text-sm">
          {t("analytics.noSendsYet")}
        </Text>
      </View>
    );
  }

  // Find the maximum count to calculate bar widths as percentages.
  // The bar with the most sends fills 100% of the available width;
  // all other bars scale proportionally.
  const maxCount = Math.max(...data.map((entry) => entry.count));

  return (
    <View testID={testID} className="px-4 py-2">
      {data.map((entry) => {
        // Convert canonical integer to the user's preferred grade string.
        const gradeLabel = canonicalToDisplay(entry.grade, gradeSystem);
        // Calculate bar width as a percentage of the max count.
        // This ensures the longest bar fills the available space and
        // shorter bars are proportionally smaller.
        const widthPercent = (entry.count / maxCount) * 100;

        return (
          <View
            key={entry.grade}
            className="flex-row items-center mb-2"
            testID={`pyramid-row-${entry.grade}`}
          >
            {/* Grade label — fixed width so bars align vertically */}
            <Text className="text-text-primary text-sm w-12 text-right mr-2 font-medium">
              {gradeLabel}
            </Text>

            {/* Bar container — flex-1 fills remaining space after label + count */}
            <View className="flex-1 h-6 bg-surface rounded-sm overflow-hidden">
              {/* The colored bar — width proportional to count/maxCount.
                  Using inline style for dynamic width since NativeWind
                  can't do computed percentage widths at runtime. */}
              <View
                className="h-6 bg-primary rounded-sm"
                style={{ width: `${widthPercent}%` }}
                testID={`pyramid-bar-${entry.grade}`}
                accessibilityLabel={`${gradeLabel}: ${entry.count} sends`}
              />
            </View>

            {/* Count label — right-aligned after the bar */}
            <Text className="text-text-secondary text-sm w-8 text-right ml-2">
              {entry.count}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
