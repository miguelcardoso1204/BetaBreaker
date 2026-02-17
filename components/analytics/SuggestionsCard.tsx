/**
 * SuggestionsCard — Horizontal Route Suggestion Carousel
 *
 * A presentational component that displays personalized route suggestions
 * in a horizontally scrollable list. Each card shows the route's color dot,
 * name, grade label, and up to 2 style tag chips.
 *
 * This component receives pre-scored data from useRouteSuggestions — it
 * doesn't fetch or compute anything itself. This keeps it purely
 * presentational and easy to test without mocking services or hooks.
 *
 * Props:
 *   - suggestions: Scored routes from the suggestion engine
 *   - gradeSystem: Which grade notation to display ('v-scale', 'font', 'yds')
 *   - onRoutePress: Callback when a route card is tapped (navigates to detail)
 *   - onRefresh: Callback for the refresh button (loads next page)
 *   - hasMore: Controls whether the refresh button is emphasized
 *   - isLoading: Shows ActivityIndicator instead of cards
 *   - testID: Optional test identifier for the outer container
 */

import React from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { RefreshCw } from "lucide-react-native";
import { canonicalToDisplay } from "@/utils/grades";
import type { GradeSystem } from "@/utils/grades";
import type { ScoredRoute } from "@/utils/suggestions";

// ── Props ───────────────────────────────────────────────────────

interface SuggestionsCardProps {
  /** Scored routes to display, sorted by relevance. */
  suggestions: ScoredRoute[];
  /** Which grade system to render labels in (v-scale, font, yds). */
  gradeSystem: GradeSystem;
  /** Called when a route card is pressed — typically navigates to route detail. */
  onRoutePress: (routeId: string) => void;
  /** Called when the refresh button is pressed — loads next page of suggestions. */
  onRefresh: () => void;
  /** Whether more suggestions are available (affects refresh button display). */
  hasMore: boolean;
  /** Whether the suggestion data is still loading. */
  isLoading: boolean;
  /** Optional testID for the outer container. */
  testID?: string;
}

// ── Component ──────────────────────────────────────────────────

export function SuggestionsCard({
  suggestions,
  gradeSystem,
  onRoutePress,
  onRefresh,
  hasMore,
  isLoading,
  testID,
}: SuggestionsCardProps) {
  return (
    <View testID={testID} className="py-3">
      {/* Header: title + refresh button */}
      <View className="flex-row items-center justify-between px-4 mb-2">
        <Text className="text-text-primary text-lg font-semibold">
          Suggested for You
        </Text>
        <Pressable
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh suggestions"
          className="p-2"
        >
          <RefreshCw size={18} color="#9CA3AF" />
        </Pressable>
      </View>

      {/* Content: loading, empty, or route list */}
      {isLoading ? (
        <View className="items-center justify-center py-8">
          <ActivityIndicator testID="suggestions-loading" />
        </View>
      ) : suggestions.length === 0 ? (
        <View className="items-center justify-center py-6 px-4">
          <Text className="text-text-secondary text-sm text-center">
            Log some sends to get personalized suggestions
          </Text>
        </View>
      ) : (
        <FlatList
          data={suggestions}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          ItemSeparatorComponent={() => <View className="w-3" />}
          renderItem={({ item }) => (
            <RouteCard
              route={item}
              gradeSystem={gradeSystem}
              onPress={() => onRoutePress(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

// ── Route Card ─────────────────────────────────────────────────

interface RouteCardProps {
  route: ScoredRoute;
  gradeSystem: GradeSystem;
  onPress: () => void;
}

/**
 * A compact card for a single route suggestion. Shows:
 *   - Color dot (the route's tape/hold color)
 *   - Route name (truncated to one line)
 *   - Grade label in the user's preferred system
 *   - Up to 2 style tag chips (more would crowd the card)
 */
function RouteCard({ route, gradeSystem, onPress }: RouteCardProps) {
  const gradeLabel = canonicalToDisplay(route.canonical_grade, gradeSystem);
  // Only show first 2 tags — more would overflow the compact card layout.
  const displayTags = route.tags.slice(0, 2);

  return (
    <Pressable
      onPress={onPress}
      className="bg-card rounded-xl p-3 w-40"
      accessibilityRole="button"
      accessibilityLabel={`${route.name}, ${gradeLabel}`}
    >
      {/* Top row: color dot + grade */}
      <View className="flex-row items-center justify-between mb-1">
        <View
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: route.color ?? "#9CA3AF" }}
        />
        <Text className="text-text-secondary text-xs font-medium">
          {gradeLabel}
        </Text>
      </View>

      {/* Route name — single line with ellipsis */}
      <Text
        className="text-text-primary text-sm font-medium mb-2"
        numberOfLines={1}
      >
        {route.name}
      </Text>

      {/* Style tag chips */}
      {displayTags.length > 0 && (
        <View className="flex-row flex-wrap gap-1">
          {displayTags.map((tag) => (
            <View
              key={tag}
              className="bg-background rounded-full px-2 py-0.5"
            >
              <Text className="text-text-secondary text-xs">{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}
