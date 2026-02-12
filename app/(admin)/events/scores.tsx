/**
 * Admin Scores Screen — Judge/Admin Score Management
 *
 * This screen provides competition score management for judges and admins:
 *
 * JUDGE ACTIONS:
 *   - View all scores for an event (athlete name, route, score value)
 *   - Verify self-reported scores (sets verified_by to the judge's ID)
 *   - Add scores on behalf of athletes (judge entry)
 *
 * ADMIN ACTIONS:
 *   - Everything judges can do, plus delete scores
 *
 * DATA FLOW:
 *   - useLocalSearchParams() → eventId from the URL
 *   - useEventScores(eventId) → all scores with embedded user + route
 *   - useEventRoutes(eventId) → routes for the "Add Score" picker
 *   - Mutations: useVerifyScore, useUpdateScore, useDeleteScore, useCreateScore
 *
 * NAVIGATION:
 *   Accessed from the admin event detail screen via "Manage Scores" button.
 *   URL: /(admin)/events/scores?eventId=xxx
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CheckCircle, Trash2 } from "lucide-react-native";

import {
  useEventScores,
  useVerifyScore,
  useDeleteScore,
  useCreateScore,
} from "@/hooks/useScores";
import { useEventRoutes } from "@/hooks/useEvents";

export default function AdminScoresScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  // ── Data fetching ──────────────────────────────────────────────────
  const { scores, isLoading } = useEventScores(eventId);
  const { eventRoutes } = useEventRoutes(eventId);

  // ── Mutations ──────────────────────────────────────────────────────
  const verifyScore = useVerifyScore();
  const deleteScore = useDeleteScore();
  const createScore = useCreateScore();

  // ── Add Score form state ───────────────────────────────────────────
  const [newUserId, setNewUserId] = useState("");
  const [newScore, setNewScore] = useState("");
  // Index into eventRoutes for route selection
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  // ── Loading state ──────────────────────────────────────────────────
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

  // ── Handlers ───────────────────────────────────────────────────────

  function handleAddScore() {
    const scoreValue = parseInt(newScore, 10);
    if (!newUserId.trim() || isNaN(scoreValue)) return;

    const selectedRoute = eventRoutes[selectedRouteIndex];
    if (!selectedRoute) return;

    createScore.mutate({
      eventId: eventId!,
      routeId: selectedRoute.route_id,
      score: scoreValue,
    });
    setNewUserId("");
    setNewScore("");
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background px-4 pt-4">
      <Text className="text-xl font-bold text-text-primary mb-4">
        Manage Scores
      </Text>

      {/* ── Score List ──────────────────────────────────────────── */}
      {scores.length === 0 ? (
        <Text className="text-text-secondary text-sm mb-6">
          No scores yet
        </Text>
      ) : (
        scores.map((score: any) => (
          <View
            key={score.id}
            className="bg-surface rounded-lg px-4 py-3 mb-3"
          >
            {/* Top row: athlete name + score value */}
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-1">
                <Text className="text-text-primary font-medium">
                  {score.user?.display_name ?? "Unknown"}
                </Text>
                <Text className="text-text-secondary text-xs">
                  {score.route?.name ?? "Unknown route"} (Grade:{" "}
                  {score.route?.canonical_grade ?? "?"})
                </Text>
              </View>
              <Text className="text-text-primary font-bold text-lg">
                {score.score}
              </Text>
            </View>

            {/* Bottom row: verify/verified status + delete button */}
            <View className="flex-row items-center justify-between mt-2">
              {score.verified_by ? (
                // Already verified — show green badge
                <View className="flex-row items-center gap-1">
                  <CheckCircle size={14} color="#22C55E" strokeWidth={2} />
                  <Text className="text-green-500 text-xs font-medium">
                    Verified
                  </Text>
                </View>
              ) : (
                // Not yet verified — show verify button
                <Pressable
                  onPress={() =>
                    verifyScore.mutate({ scoreId: score.id })
                  }
                  accessibilityRole="button"
                  className="bg-green-600/20 px-3 py-1.5 rounded-lg"
                >
                  <Text className="text-green-500 text-sm font-medium">
                    Verify
                  </Text>
                </Pressable>
              )}

              {/* Delete button */}
              <Pressable
                onPress={() =>
                  deleteScore.mutate({ scoreId: score.id })
                }
                accessibilityRole="button"
                testID={`delete-score-${score.id}`}
                className="bg-error/10 px-3 py-1.5 rounded-lg"
              >
                <Trash2 size={16} color="#EF4444" strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        ))
      )}

      {/* ── Add Score Section ────────────────────────────────────── */}
      <Text className="text-lg font-bold text-text-primary mb-3 mt-4">
        Add Score
      </Text>

      {/* Route selector — simple tap buttons for available routes */}
      {eventRoutes.length > 0 && (
        <View className="flex-row flex-wrap gap-2 mb-3">
          {eventRoutes.map((er: any, index: number) => (
            <Pressable
              key={er.route_id}
              onPress={() => setSelectedRouteIndex(index)}
              accessibilityRole="button"
              className={`px-3 py-1.5 rounded-full ${
                selectedRouteIndex === index ? "bg-accent" : "bg-surface"
              }`}
            >
              <Text
                className={`text-sm ${
                  selectedRouteIndex === index
                    ? "text-white font-medium"
                    : "text-text-secondary"
                }`}
              >
                {er.route?.name ?? er.route_id}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Athlete ID + Score inputs */}
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-3 text-base"
        placeholder="Athlete User ID"
        placeholderTextColor="#9ca3af"
        value={newUserId}
        onChangeText={setNewUserId}
      />

      <View className="flex-row gap-2 mb-6">
        <TextInput
          className="flex-1 bg-surface text-text-primary rounded-lg px-3 py-3 text-base"
          placeholder="Score"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={newScore}
          onChangeText={setNewScore}
        />
        <Pressable
          onPress={handleAddScore}
          accessibilityRole="button"
          className="bg-accent px-6 py-3 rounded-lg justify-center"
        >
          <Text className="text-white font-bold">Add Score</Text>
        </Pressable>
      </View>

      {/* Bottom spacer */}
      <View className="h-8" />
    </ScrollView>
  );
}
