/**
 * CalendarGrid — Monthly Calendar Grid for Setting Session Scheduling
 *
 * A custom calendar component built with date-fns (no external calendar library).
 * Displays a month grid where gym admins can:
 *   - Navigate between months with arrows
 *   - See which dates have setting sessions (dot indicators)
 *   - Tap a date to select it and view/add sessions
 *
 * LAYOUT:
 *   [<]  March 2026  [>]       ← header with month nav
 *   Sun Mon Tue Wed Thu Fri Sat ← day-of-week labels
 *    1   2   3   4   5   6   7  ← date cells (4–6 rows)
 *    8   9  10  11  12 ...      ← dots on dates with sessions
 *
 * WHY CUSTOM INSTEAD OF A LIBRARY?
 * Calendar libraries (react-native-calendars, etc.) are heavy and hard to
 * customize with NativeWind. date-fns gives us the date math we need, and
 * building a simple grid is straightforward with flexWrap.
 *
 * DATE FORMAT:
 * Dates are passed as ISO strings ('2026-03-15') matching the Postgres
 * `date` column format. This avoids timezone issues with Date objects.
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from "date-fns";

// ── Props ────────────────────────────────────────────────────────────

interface CalendarGridProps {
  /** The month to display (any Date within that month) */
  currentMonth: Date;
  /** ISO date strings ('2026-03-15') that have setting sessions */
  sessionDates: string[];
  /** Currently selected date (ISO string), or null if none selected */
  selectedDate: string | null;
  /** Called when a date cell is tapped, with the ISO date string */
  onSelectDate: (date: string) => void;
  /** Called when the left arrow is tapped to go to previous month */
  onPrevMonth: () => void;
  /** Called when the right arrow is tapped to go to next month */
  onNextMonth: () => void;
}

/** Day-of-week labels — starting with Sunday to match US convention */
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Component ────────────────────────────────────────────────────────

export default function CalendarGrid({
  currentMonth,
  sessionDates,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: CalendarGridProps) {
  // Build the grid: start from Sunday of the week containing the 1st,
  // end on Saturday of the week containing the last day of the month.
  // This gives us complete rows (no partial weeks).
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Convert sessionDates array to a Set for O(1) lookup
  const sessionDateSet = new Set(sessionDates);

  return (
    <View className="bg-surface rounded-lg p-3 mx-4 mb-4">
      {/* ── Month/Year Header with Navigation ─────────────────────── */}
      <View className="flex-row items-center justify-between mb-3">
        <Pressable
          onPress={onPrevMonth}
          testID="prev-month"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          className="p-2"
        >
          <ChevronLeft size={20} color="#9CA3AF" />
        </Pressable>

        <Text className="text-text-primary text-lg font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </Text>

        <Pressable
          onPress={onNextMonth}
          testID="next-month"
          accessibilityRole="button"
          accessibilityLabel="Next month"
          className="p-2"
        >
          <ChevronRight size={20} color="#9CA3AF" />
        </Pressable>
      </View>

      {/* ── Day-of-Week Labels ────────────────────────────────────── */}
      <View className="flex-row mb-1">
        {DAY_LABELS.map((label) => (
          <View key={label} className="flex-1 items-center">
            <Text className="text-text-secondary text-xs font-medium">
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Date Grid ─────────────────────────────────────────────── */}
      <View className="flex-row flex-wrap">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const isSelected = selectedDate === dateStr;
          const hasSession = sessionDateSet.has(dateStr);

          return (
            <Pressable
              key={dateStr}
              testID={`date-cell-${dateStr}`}
              onPress={() => onSelectDate(dateStr)}
              // Each cell takes 1/7 of the row width (flex-basis ~14.28%)
              style={{ width: "14.28%" }}
              className="items-center py-1.5"
            >
              {/* Date number container — conditionally styled */}
              <View
                testID={isSelected ? `selected-${dateStr}` : undefined}
                className={[
                  "w-8 h-8 items-center justify-center rounded-full",
                  // Selected date gets accent background
                  isSelected && "bg-accent",
                  // Today gets a ring if not already selected
                  today && !isSelected && "border border-accent",
                ].filter(Boolean).join(" ")}
              >
                <Text
                  className={[
                    "text-sm",
                    // Outside current month = dimmed
                    !inMonth && "text-text-secondary opacity-30",
                    // Selected = white text on accent bg
                    isSelected && "text-white font-bold",
                    // Today (not selected) = accent colored
                    today && !isSelected && inMonth && "text-accent font-bold",
                    // Normal in-month date
                    inMonth && !isSelected && !today && "text-text-primary",
                  ].filter(Boolean).join(" ")}
                >
                  {format(day, "d")}
                </Text>
              </View>

              {/* Dot indicator for dates with sessions */}
              {hasSession && (
                <View
                  testID={`dot-${dateStr}`}
                  className="w-1.5 h-1.5 bg-accent rounded-full mt-0.5"
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
