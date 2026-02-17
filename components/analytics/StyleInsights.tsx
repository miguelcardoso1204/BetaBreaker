/**
 * StyleInsights — Radar Chart of Climbing Style Distribution
 *
 * A pure presentational component that renders a radar (spider) chart
 * showing how the user's sent routes distribute across crowd-sourced
 * style tags (slab, overhang, crimpy, dyno, etc.). This is part of
 * the Pro analytics dashboard (FR-E2).
 *
 * WHY REACT-NATIVE-SVG?
 * A radar chart requires radial geometry — lines from center to vertices,
 * polygons connecting data points, and rotated text labels. These are
 * straightforward with SVG primitives (<Polygon>, <Line>, <Text>) but
 * impossible with plain React Native Views. react-native-svg is already
 * installed (v15.12.1), so no new dependency is needed.
 *
 * LAYOUT:
 * ```
 *          slab
 *        /    \
 *   dyno        crimpy
 *      |        |
 *   techy      slopey
 *        \    /
 *       overhang
 * ```
 * - Concentric reference polygons (background grid)
 * - Axis lines from center to each tag vertex
 * - Filled data polygon showing the user's style distribution
 * - Tag labels at each vertex
 *
 * PRESENTATIONAL PATTERN:
 * This component receives pre-computed data as props. It does NOT fetch
 * data or check entitlements — the parent screen (or useStyleInsights hook)
 * handles that. This makes the component trivially testable.
 */

import React from "react";
import { Text, View } from "react-native";
import Svg, {
  Polygon,
  Line,
  Text as SvgText,
  Circle,
} from "react-native-svg";
import type { StyleInsightEntry } from "@/services/sessions.service";

/**
 * Props for the StyleInsights component.
 */
export interface StyleInsightsProps {
  /** Array of { tagName, category, count } entries sorted by count desc. */
  data: StyleInsightEntry[];
  /** Optional testID for the outer container. */
  testID?: string;
}

// ── Chart geometry constants ─────────────────────────────────────

/** The SVG viewBox is a square — this is the center coordinate. */
const CENTER = 150;
/** Maximum radius from center to the outermost ring. */
const RADIUS = 110;
/** How many concentric reference rings to draw (e.g., 3 rings). */
const RING_COUNT = 3;
/** How far outside the outermost ring to place tag labels. */
const LABEL_OFFSET = 20;

// ── Geometry helpers ─────────────────────────────────────────────

/**
 * Compute the (x, y) point on a circle at a given angle and radius.
 *
 * The radar chart distributes tags evenly around a circle. Each tag
 * gets an axis at angle = (index / count) * 2π. We offset by -π/2
 * so the first tag starts at the top (12 o'clock position), not at
 * 3 o'clock (where 0 radians points on a standard unit circle).
 *
 * @param index - Which axis (0-based)
 * @param total - Total number of axes
 * @param radius - Distance from center
 */
function getPoint(index: number, total: number, radius: number): [number, number] {
  // -π/2 offset rotates the chart so the first axis points up.
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const x = CENTER + radius * Math.cos(angle);
  const y = CENTER + radius * Math.sin(angle);
  return [x, y];
}

/**
 * Build a polygon points string from an array of (x, y) pairs.
 * SVG <Polygon> expects "x1,y1 x2,y2 x3,y3 ..." format.
 */
function toPointsString(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/**
 * Determine text-anchor for labels based on their angular position.
 * Labels on the left side should be right-aligned, labels on the
 * right side should be left-aligned, and top/bottom labels centered.
 */
function getTextAnchor(x: number): "start" | "middle" | "end" {
  if (x < CENTER - 5) return "end";
  if (x > CENTER + 5) return "start";
  return "middle";
}

// ── Component ────────────────────────────────────────────────────

/**
 * StyleInsights — renders style tag distribution as a radar chart.
 *
 * When data is empty, shows a "No style data yet" placeholder message
 * so the screen never renders an empty/broken chart.
 */
export function StyleInsights({ data, testID }: StyleInsightsProps) {
  // Handle empty state — user has no tagged sends.
  if (data.length === 0) {
    return (
      <View testID={testID} className="py-8 items-center">
        <Text className="text-text-secondary text-sm">
          No style data yet — send tagged routes to see your climbing profile
        </Text>
      </View>
    );
  }

  const count = data.length;
  // The maximum count across all tags — used to normalize data points
  // to the 0–RADIUS range. The tag with the most routes touches the
  // outermost ring; others scale proportionally.
  const maxCount = Math.max(...data.map((entry) => entry.count));

  // Compute the data polygon vertices — each tag's count mapped to a
  // radius proportional to maxCount.
  const dataPoints: [number, number][] = data.map((entry, i) => {
    const ratio = maxCount > 0 ? entry.count / maxCount : 0;
    return getPoint(i, count, ratio * RADIUS);
  });

  // Compute label positions — slightly outside the outermost ring.
  const labelPoints: [number, number][] = data.map((_, i) =>
    getPoint(i, count, RADIUS + LABEL_OFFSET)
  );

  return (
    <View testID={testID} className="items-center py-4">
      <Svg
        width={300}
        height={300}
        viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}
        accessibilityLabel="Style insights radar chart"
      >
        {/* Concentric reference rings — background grid showing scale.
            Each ring is a regular polygon with the same number of sides
            as there are tags. The outermost ring represents the max count. */}
        {Array.from({ length: RING_COUNT }, (_, ringIndex) => {
          const ringRadius = ((ringIndex + 1) / RING_COUNT) * RADIUS;
          const ringPoints = data.map((_, i) =>
            getPoint(i, count, ringRadius)
          );
          return (
            <Polygon
              key={`ring-${ringIndex}`}
              points={toPointsString(ringPoints)}
              fill="none"
              stroke="#374151" // text-secondary color — subtle grid lines
              strokeWidth={0.5}
              opacity={0.4}
            />
          );
        })}

        {/* Axis lines — from center to each tag vertex.
            These show the directions and help the eye trace from
            labels to the data polygon. */}
        {data.map((_, i) => {
          const [x, y] = getPoint(i, count, RADIUS);
          return (
            <Line
              key={`axis-${i}`}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="#374151"
              strokeWidth={0.5}
              opacity={0.4}
            />
          );
        })}

        {/* Data polygon — the filled shape connecting all data points.
            This is the "meat" of the chart: its shape shows the user's
            climbing style at a glance. A balanced climber has a roughly
            circular shape; a specialist has spikes in certain directions. */}
        <Polygon
          points={toPointsString(dataPoints)}
          fill="#6366f1" // primary/indigo — matches app theme
          fillOpacity={0.3}
          stroke="#6366f1"
          strokeWidth={2}
          testID="style-data-polygon"
        />

        {/* Data point dots — small circles at each vertex of the data
            polygon for visual clarity. */}
        {dataPoints.map(([x, y], i) => (
          <Circle
            key={`dot-${i}`}
            cx={x}
            cy={y}
            r={3}
            fill="#6366f1"
          />
        ))}

        {/* Tag labels — positioned outside the outermost ring.
            Text anchor adjusts based on position: labels on the left
            are right-aligned, labels on the right are left-aligned,
            and top/bottom labels are centered. */}
        {data.map((entry, i) => {
          const [x, y] = labelPoints[i];
          return (
            <SvgText
              key={`label-${i}`}
              x={x}
              y={y}
              textAnchor={getTextAnchor(x)}
              alignmentBaseline="middle"
              fill="#9CA3AF" // text-secondary — readable but not dominant
              fontSize={11}
              fontWeight="500"
            >
              {entry.tagName}
            </SvgText>
          );
        })}
      </Svg>

      {/* Legend below the chart — shows exact counts for each tag.
          The radar chart shows relative proportions; the legend gives
          exact numbers for users who want specifics. */}
      <View className="flex-row flex-wrap justify-center mt-4 gap-x-4 gap-y-2 px-4">
        {data.map((entry) => (
          <View
            key={entry.tagName}
            className="flex-row items-center"
            accessibilityLabel={`${entry.tagName}: ${entry.count} routes`}
          >
            <View className="w-2 h-2 rounded-full bg-primary mr-1.5" />
            <Text className="text-text-secondary text-xs">
              {entry.tagName}
            </Text>
            <Text className="text-text-primary text-xs font-medium ml-1">
              {entry.count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
