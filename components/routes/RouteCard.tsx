/**
 * RouteCard — Displays a single climbing route in a list.
 *
 * This is the primary card component for the route browse screen (home tab).
 * It shows all the key info a climber needs at a glance:
 *   - Route name and grade (converted to the user's preferred system)
 *   - Status dot (green = active, amber = retiring soon, gray = archived)
 *   - Color swatch (the hold color on the wall, helps identify the route)
 *   - Style tags (climbing style chips like "Crimps", "Slab", "Overhang")
 *   - Sent indicator (checkmark if the user has completed this route)
 *
 * This is a PRESENTATIONAL component — it receives all data as props and
 * renders it. No hooks, no data fetching, no side effects. The parent
 * screen is responsible for fetching routes and passing them in.
 *
 * The component composes existing UI primitives:
 *   - Card (from components/ui) for the pressable container
 *   - Badge (from components/ui) for style tag chips
 *   - canonicalToDisplay() for grade conversion
 */

import React from "react";
import { View, Text } from "react-native";
import { Check, ChevronRight } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { canonicalToDisplay } from "@/utils/grades";
import type { GradeSystem } from "@/lib/constants";
import type { RouteStatus } from "@/lib/constants";
import { useTranslation } from "react-i18next";

// ── Types ────────────────────────────────────────────────────────

/** The route data shape this card expects. Matches the columns from
 *  the routes table plus style tags resolved from the junction table. */
export interface RouteCardRoute {
  id: string;
  name: string | null;
  canonical_grade: number;
  status: RouteStatus;
  color: string | null;
  style_tags: string[];
}

export interface RouteCardProps {
  /** The route data to display. */
  route: RouteCardRoute;
  /** The user's preferred grade system (v-scale, font, yds). */
  userGradeSystem: GradeSystem;
  /** Callback when the card is tapped. Parent handles navigation. */
  onPress: () => void;
  /** Whether the current user has sent (completed) this route. */
  isSent?: boolean;
}

// ── Status dot color mapping ─────────────────────────────────────
// Maps each route lifecycle status to a NativeWind background color.
// Active routes are green (good to climb), retiring_soon is amber
// (climb it before it's gone!), archived is gray (no longer on wall).
const statusDotClass: Record<RouteStatus, string> = {
  active: "bg-success",
  retiring_soon: "bg-warning",
  archived: "bg-muted",
};

/**
 * RouteCard — a pressable card showing one route's key info.
 *
 * Usage:
 * ```tsx
 * <RouteCard
 *   route={route}
 *   userGradeSystem="v-scale"
 *   onPress={() => router.push(`/routes/${route.id}`)}
 *   isSent={sentRouteIds.has(route.id)}
 * />
 * ```
 */
export function RouteCard({
  route,
  userGradeSystem,
  onPress,
  isSent = false,
}: RouteCardProps) {
  const { t } = useTranslation();

  // Convert the canonical integer grade to a human-readable string
  // in the user's preferred system (e.g., 12 → "V4" for v-scale).
  const gradeDisplay = canonicalToDisplay(route.canonical_grade, userGradeSystem);

  return (
    <Card onPress={onPress} testID="route-card" className="mb-3">
      <View className="flex-row items-center gap-3">
        {/* Color swatch — a small circle showing the route's hold color.
            This helps climbers identify routes on the wall by color.
            Only rendered when the route has a color assigned. */}
        {route.color && (
          <View
            testID="color-swatch"
            className="w-10 h-10 rounded-full"
            style={{ backgroundColor: route.color }}
          />
        )}

        {/* Main content — route name, grade, and status */}
        <View className="flex-1">
          {/* Top row: name + status dot */}
          <View className="flex-row items-center gap-2">
            {/* Status dot — small colored circle indicating route lifecycle */}
            <View
              testID="status-dot"
              className={`w-2 h-2 rounded-full ${statusDotClass[route.status]}`}
            />
            <Text className="text-white font-bold text-base" numberOfLines={1}>
              {route.name ?? t("route.unnamedRoute")}
            </Text>
          </View>

          {/* Grade display */}
          <Text className="text-text-secondary text-sm mt-0.5">
            {gradeDisplay}
          </Text>

          {/* Style tags — rendered as small Badge chips */}
          {route.style_tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1 mt-1.5">
              {route.style_tags.map((tag) => (
                <Badge key={tag} label={tag} variant="tag" color="#4B5563" />
              ))}
            </View>
          )}
        </View>

        {/* Right side: sent indicator + chevron */}
        <View className="flex-row items-center gap-2">
          {isSent && (
            <View testID="sent-indicator">
              <Check size={18} className="text-success" />
            </View>
          )}
          <ChevronRight size={20} className="text-muted" />
        </View>
      </View>
    </Card>
  );
}
