/**
 * GradeConsensusCard — Admin Route Card with Grade Comparison (Step 15.4)
 *
 * Displays a single route's grade consensus data:
 *   - Route name with color dot
 *   - Side-by-side: setter's canonical grade vs community consensus grade
 *   - Divergence badge (green/amber/red/gray)
 *   - Submission count
 *   - Expandable: tap to show perceived_grade distribution
 *
 * The divergence badge uses traffic-light colors:
 *   - Green (0-1): grades agree — no action needed
 *   - Amber (2): mild disagreement — worth reviewing
 *   - Red (3+): significant divergence — admin should investigate
 *   - Gray: not enough data (fewer than 5 perceived_grade submissions)
 *
 * EXPANSION BEHAVIOR:
 * When pressed, the card toggles an inline expansion that fetches the
 * grade distribution via useGradeSubmissions(routeId). This is a
 * separate query (not included in the list RPC) to avoid overfetching —
 * most admins will only drill into a few routes.
 */

import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { canonicalToDisplay } from "@/utils/grades";
import { useGradeSubmissions } from "@/hooks/useGradeConsensus";

interface GradeConsensusCardProps {
  routeId: string;
  name: string;
  color: string;
  canonicalGrade: number;
  consensusGrade: number | null;
  submissionCount: number;
  divergence: number | null;
}

/**
 * Maps divergence to a badge color category.
 * Returns a key used for both styling and testID.
 */
function getDivergenceColor(divergence: number | null): string {
  if (divergence === null) return "gray";
  if (divergence <= 1) return "green";
  if (divergence === 2) return "amber";
  return "red";
}

/** NativeWind classes for each divergence badge color */
const BADGE_STYLES: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-gray-400",
};

/** Text color for each badge — black on amber for WCAG contrast */
const BADGE_TEXT: Record<string, string> = {
  green: "text-white",
  amber: "text-black",
  red: "text-white",
  gray: "text-white",
};

export default function GradeConsensusCard({
  routeId,
  name,
  color,
  canonicalGrade,
  consensusGrade,
  submissionCount,
  divergence,
}: GradeConsensusCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Only fetch distribution when the card is expanded (lazy loading)
  const { submissions, isLoading: distLoading } = useGradeSubmissions(
    expanded ? routeId : null
  );

  const badgeColor = getDivergenceColor(divergence);

  // Display labels for divergence badge
  const badgeLabel =
    divergence === null
      ? "N/A"
      : divergence === 0
        ? "Match"
        : `±${divergence}`;

  return (
    <Pressable
      testID={`consensus-card-${routeId}`}
      onPress={() => setExpanded((prev) => !prev)}
      className="bg-surface rounded-lg p-3 mb-2"
    >
      {/* ── Header: name + color dot + chevron ─────────────────── */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center flex-1">
          {/* Color dot — uses the route's tape/hold color */}
          <View
            className="w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: color }}
          />
          <Text className="text-text-primary font-medium flex-1" numberOfLines={1}>
            {name}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color="#9CA3AF" />
        ) : (
          <ChevronDown size={16} color="#9CA3AF" />
        )}
      </View>

      {/* ── Grade comparison: setter vs community ──────────────── */}
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center gap-4">
          {/* Setter grade */}
          <View>
            <Text className="text-text-secondary text-xs">Setter</Text>
            <Text className="text-text-primary font-bold text-lg">
              {canonicalToDisplay(canonicalGrade, "v-scale")}
            </Text>
          </View>

          {/* Community grade */}
          <View>
            <Text className="text-text-secondary text-xs">Community</Text>
            <Text className="text-text-primary font-bold text-lg">
              {consensusGrade !== null
                ? canonicalToDisplay(consensusGrade, "v-scale")
                : "No consensus"}
            </Text>
          </View>
        </View>

        {/* Divergence badge */}
        <View
          testID={`divergence-badge-${badgeColor}`}
          className={`px-2 py-0.5 rounded-full ${BADGE_STYLES[badgeColor]}`}
        >
          <Text className={`text-xs font-medium ${BADGE_TEXT[badgeColor]}`}>
            {badgeLabel}
          </Text>
        </View>
      </View>

      {/* ── Submission count ────────────────────────────────────── */}
      <Text className="text-text-secondary text-xs">
        {submissionCount} submissions
      </Text>

      {/* ── Expanded: grade distribution ───────────────────────── */}
      {expanded && (
        <View testID="grade-distribution" className="mt-3 pt-3 border-t border-gray-700">
          <Text className="text-text-secondary text-xs font-medium mb-2">
            Grade Distribution
          </Text>

          {distLoading ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : submissions.length === 0 ? (
            <Text className="text-text-secondary text-xs">
              No grade submissions yet
            </Text>
          ) : (
            submissions.map((row: any) => (
              <View
                key={row.perceived_grade}
                className="flex-row items-center justify-between py-1"
              >
                <Text className="text-text-primary text-sm">
                  {canonicalToDisplay(row.perceived_grade, "v-scale")}
                </Text>
                <Text className="text-text-secondary text-sm">
                  {row.submission_count}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </Pressable>
  );
}
