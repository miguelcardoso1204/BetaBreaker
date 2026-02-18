/**
 * Admin Consensus Screen — Grade Consensus View (Step 15.4)
 *
 * Shows gym admins how the community perceives route difficulty vs the
 * setter's assigned grade. Routes are listed with divergence highlighting
 * so admins can quickly spot where community consensus disagrees.
 *
 * LAYOUT:
 *   1. Summary stats: "N with consensus" / "N divergent"
 *   2. Filter toggle: "All" vs "Divergent Only" (divergence ≥ 2)
 *   3. FlatList of GradeConsensusCard items (each expandable)
 *
 * DATA FLOW:
 *   useAuth() → homeGymId → useRoutesGradeConsensus(gymId) → FlatList
 *   Each card fetches its own distribution lazily via useGradeSubmissions
 *
 * STATES:
 *   - Loading: centered ActivityIndicator
 *   - Error: error message
 *   - Empty: "No routes" message
 *   - Data: summary + filter + card list
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Filter } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useRoutesGradeConsensus } from "@/hooks/useGradeConsensus";
import GradeConsensusCard from "@/components/admin/GradeConsensusCard";

/** Divergence threshold for "divergent" filter — routes with ≥ this value are flagged */
const DIVERGENCE_THRESHOLD = 2;

export default function ConsensusScreen() {
  const { user } = useAuth();
  const gymId = user?.homeGymId ?? null;

  const { routes, isLoading, error } = useRoutesGradeConsensus(gymId);

  // Filter state: false = show all, true = divergent only
  const [divergentOnly, setDivergentOnly] = useState(false);

  // ── Computed stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const withConsensus = routes.filter(
      (r: any) => r.consensus_grade !== null
    ).length;
    const divergent = routes.filter(
      (r: any) => r.divergence !== null && r.divergence >= DIVERGENCE_THRESHOLD
    ).length;
    return { withConsensus, divergent };
  }, [routes]);

  // ── Filtered route list ─────────────────────────────────────────
  const filteredRoutes = useMemo(() => {
    if (!divergentOnly) return routes;
    return routes.filter(
      (r: any) => r.divergence !== null && r.divergence >= DIVERGENCE_THRESHOLD
    );
  }, [routes, divergentOnly]);

  // ── Loading state ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="loading-indicator"
      >
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // ── Error state ─────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || "Failed to load consensus data"}
        </Text>
      </View>
    );
  }

  // ── Main screen ─────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <Text className="text-xl font-bold text-text-primary px-4 pt-4 pb-2">
        Grade Consensus
      </Text>

      {/* ── Summary Stats ──────────────────────────────────────── */}
      <View className="flex-row px-4 mb-3 gap-3">
        <View className="bg-surface rounded-lg px-3 py-2 flex-1">
          <Text className="text-text-secondary text-xs">Routes</Text>
          <Text className="text-text-primary font-bold text-lg">
            {routes.length}
          </Text>
          <Text className="text-text-secondary text-xs">
            {stats.withConsensus} with consensus
          </Text>
        </View>
        <View className="bg-surface rounded-lg px-3 py-2 flex-1">
          <Text className="text-text-secondary text-xs">Divergent</Text>
          <Text className="text-text-primary font-bold text-lg">
            {stats.divergent}
          </Text>
          <Text className="text-text-secondary text-xs">
            {stats.divergent} divergent
          </Text>
        </View>
      </View>

      {/* ── Filter Toggle ──────────────────────────────────────── */}
      <View className="px-4 mb-3">
        <Pressable
          testID="filter-divergent"
          onPress={() => setDivergentOnly((prev) => !prev)}
          accessibilityRole="button"
          className={`flex-row items-center px-3 py-2 rounded-lg border ${
            divergentOnly
              ? "bg-accent border-accent"
              : "bg-surface border-text-secondary"
          }`}
        >
          <Filter size={14} color={divergentOnly ? "white" : "#9CA3AF"} />
          <Text
            className={`ml-2 text-sm font-medium ${
              divergentOnly ? "text-white" : "text-text-primary"
            }`}
          >
            {divergentOnly ? "Divergent Only" : "All Routes"}
          </Text>
        </Pressable>
      </View>

      {/* ── Route List ─────────────────────────────────────────── */}
      {filteredRoutes.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-text-secondary text-center">
            No routes to display
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRoutes}
          keyExtractor={(item: any) => item.route_id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }: { item: any }) => (
            <GradeConsensusCard
              routeId={item.route_id}
              name={item.name}
              color={item.color}
              canonicalGrade={item.canonical_grade}
              consensusGrade={item.consensus_grade}
              submissionCount={Number(item.submission_count)}
              divergence={item.divergence}
            />
          )}
        />
      )}
    </View>
  );
}
