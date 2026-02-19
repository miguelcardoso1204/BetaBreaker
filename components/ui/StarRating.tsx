/**
 * StarRating — Reusable 5-Star Rating Input Component
 *
 * A row of 5 tappable star icons for capturing a numeric rating (0–5).
 * Used on the Full Ascent Form for "How would you rate this route?"
 * where the rating maps to `perceived_grade` (subjective difficulty).
 *
 * INTERACTION:
 *   - Tapping star N sets the value to N (1–5)
 *   - Tapping the currently selected star deselects it (sets value to 0)
 *   - Stars 1 through `value` are rendered in gold (#F59E0B)
 *   - Remaining stars are rendered in gray (#6B7280)
 *
 * WHY NOT USE IconButton DIRECTLY?
 * IconButton wraps a single Lucide icon with Pressable — it's close to
 * what we need. But StarRating needs to manage the "fill" concept (gold
 * vs gray based on position) and the deselect-on-retap behavior. Rather
 * than overcomplicating IconButton, StarRating composes Pressable + Star
 * icon directly, keeping both components focused.
 *
 * ACCESSIBILITY:
 * Each star has an accessibilityLabel like "Rate 3 of 5 stars" so screen
 * readers can announce the purpose of each button. The disabled prop
 * prevents interaction and dims the component for read-only display.
 */

import React from "react";
import { View, Pressable } from "react-native";
import { Star } from "lucide-react-native";
import { useTranslation } from "react-i18next";

// ── Props ────────────────────────────────────────────────────────────

export interface StarRatingProps {
  /** Current rating value (0 = no selection, 1–5 = selected star count). */
  value: number;
  /** Called with the new rating when a star is tapped. */
  onChange: (rating: number) => void;
  /** Size of each star icon in pixels. Defaults to 28. */
  size?: number;
  /** When true, stars are non-interactive (read-only display). */
  disabled?: boolean;
  /** Optional testID prefix. Stars get testID="<prefix>-N". */
  testID?: string;
}

// ── Colors ───────────────────────────────────────────────────────────

/** Gold color for selected stars — matches the app's warning/amber palette. */
const STAR_GOLD = "#F59E0B";
/** Gray color for unselected stars — subdued to contrast with gold. */
const STAR_GRAY = "#6B7280";

// ── Component ────────────────────────────────────────────────────────

export function StarRating({
  value,
  onChange,
  size = 28,
  disabled = false,
  testID = "star",
}: StarRatingProps) {
  const { t } = useTranslation();

  return (
    <View className="flex-row gap-1" testID={`${testID}-container`}>
      {/* Render 5 stars. Array.from({ length: 5 }) creates [undefined, undefined, ...],
          and the index (0–4) maps to star numbers 1–5. */}
      {Array.from({ length: 5 }, (_, i) => {
        const starNumber = i + 1;
        // A star is "filled" (gold) if its number is ≤ the current value.
        // e.g., if value=3, stars 1, 2, 3 are gold; 4, 5 are gray.
        const isFilled = starNumber <= value;

        return (
          <Pressable
            key={starNumber}
            testID={`${testID}-${starNumber}`}
            onPress={
              disabled
                ? undefined
                : () => {
                    // Toggle behavior: tapping the currently selected star
                    // deselects it (sets to 0). Tapping any other star sets
                    // the value to that star's number.
                    onChange(starNumber === value ? 0 : starNumber);
                  }
            }
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t("accessibility.rateStar", { number: starNumber, total: 5 })}
            accessibilityState={{ disabled, selected: isFilled }}
            // min-h-[44px] min-w-[44px] meets Apple's 44pt touch target minimum.
            // items-center justify-center keeps the star visually centered
            // within the larger touch area so spacing looks compact.
            className={`min-h-[44px] min-w-[44px] items-center justify-center ${disabled ? "opacity-50" : ""}`}
          >
            <Star
              size={size}
              color={isFilled ? STAR_GOLD : STAR_GRAY}
              // Fill the star shape when selected. Lucide's `fill` prop
              // fills the interior of the SVG path. "none" keeps it as
              // an outline (stroke only).
              fill={isFilled ? STAR_GOLD : "none"}
              strokeWidth={2}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
