/**
 * Event Detail Screen — Athlete View for Browsing Routes & Entering Scores
 *
 * This is the public-facing event screen where athletes:
 *   1. See event info (name, dates, scoring model, status)
 *   2. Browse the event's route list with grades
 *   3. Submit scores for routes they haven't scored yet
 *   4. View their existing scores and verification status
 *
 * DATA FLOW:
 *   - useLocalSearchParams() → eventId from the URL
 *   - useEvent(eventId) → fetches event info
 *   - useEventRoutes(eventId) → fetches routes linked to the event
 *   - useUserEventScores(eventId) → fetches the athlete's scores
 *   - useCreateScore() → mutation to submit a new score
 *
 * SCORE SUBMISSION:
 *   Each route row has either:
 *   - A read-only score display (if already submitted) + verified badge
 *   - An inline TextInput + Submit button (if not yet scored)
 *
 *   Athletes can only submit once per route (UNIQUE constraint).
 *   After submission, the score shows as "Pending" until a judge verifies.
 *
 * NAVIGATION:
 *   Accessed via:
 *   - QR scan → "Comp Score" button (when route is in an active event)
 *   - Direct URL: /events/[id]
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
import { CheckCircle, Clock, Trophy } from "lucide-react-native";

import { useEvent, useEventRoutes } from "@/hooks/useEvents";
import { useUserEventScores, useCreateScore } from "@/hooks/useScores";

/** Scoring model display labels (same as admin screen). */
const SCORING_LABELS: Record<string, string> = {
  tops_and_zones: "Tops & Zones",
  points: "Points",
  thousand_divide_by: "1000/Attempts",
  redpoint: "Redpoint",
};

export default function EventDetailScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();

  // ── Data fetching ──────────────────────────────────────────────────
  const { event, isLoading, error } = useEvent(eventId);
  const { eventRoutes } = useEventRoutes(eventId);
  const { scores: userScores } = useUserEventScores(eventId);
  const createScore = useCreateScore();

  // Track per-route score input values. Key is route_id, value is the
  // text the athlete has typed into the score field.
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});

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

  // ── Error state ────────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || "Failed to load event"}
        </Text>
      </View>
    );
  }

  // ── No event found ─────────────────────────────────────────────────
  if (!event) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-text-secondary">Event not found</Text>
      </View>
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Find the athlete's existing score for a given route. */
  function getScoreForRoute(routeId: string) {
    return userScores.find((s: any) => s.route_id === routeId);
  }

  /** Handle score submission for a route. */
  function handleSubmitScore(routeId: string) {
    const value = scoreInputs[routeId];
    const numericScore = parseInt(value, 10);
    if (isNaN(numericScore)) return;

    createScore.mutate(
      {
        eventId: event!.id,
        routeId,
        score: numericScore,
      },
      {
        onSuccess: () => {
          // Clear the input after successful submission
          setScoreInputs((prev) => {
            const next = { ...prev };
            delete next[routeId];
            return next;
          });
        },
      }
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background px-4 pt-4">
      {/* ── Event Info Header ────────────────────────────────────── */}
      <View className="mb-6">
        <View className="flex-row items-center gap-2 mb-2">
          <Trophy size={24} color="#7C3AED" strokeWidth={2} />
          <Text className="text-xl font-bold text-text-primary">
            {event.name}
          </Text>
        </View>

        {/* Status badge */}
        <View className="flex-row items-center gap-2 mb-2">
          <View className="bg-accent/20 px-3 py-1 rounded-full">
            <Text className="text-accent text-sm font-medium">
              {event.status}
            </Text>
          </View>
          <Text className="text-text-secondary text-sm">
            {SCORING_LABELS[event.scoring_model] ?? event.scoring_model}
          </Text>
        </View>

        {/* Date range */}
        <Text className="text-text-secondary text-xs">
          {new Date(event.start_date).toLocaleDateString()} –{" "}
          {new Date(event.end_date).toLocaleDateString()}
        </Text>
      </View>

      {/* ── Routes List ──────────────────────────────────────────── */}
      <Text className="text-lg font-bold text-text-primary mb-3">
        Routes ({eventRoutes.length})
      </Text>

      {eventRoutes.length === 0 ? (
        <Text className="text-text-secondary text-sm mb-4">
          No routes in this event yet
        </Text>
      ) : (
        eventRoutes.map((er: any) => {
          const existingScore = getScoreForRoute(er.route_id);

          return (
            <View
              key={er.route_id}
              className="bg-surface rounded-lg px-4 py-3 mb-3"
            >
              {/* Route info row */}
              <View className="flex-row items-center justify-between mb-2">
                <View>
                  <Text className="text-text-primary font-medium">
                    {er.route?.name ?? "Unknown route"}
                  </Text>
                  <Text className="text-text-secondary text-xs">
                    Grade: {er.route?.canonical_grade ?? "?"}
                  </Text>
                </View>
              </View>

              {/* Score display or input */}
              {existingScore ? (
                // ── Already scored: show read-only score + verification status
                <View className="flex-row items-center gap-2">
                  <Text className="text-text-primary font-bold text-lg">
                    {existingScore.score}
                  </Text>
                  {existingScore.verified_by ? (
                    // Judge-verified — show green checkmark
                    <View className="flex-row items-center gap-1">
                      <CheckCircle size={14} color="#22C55E" strokeWidth={2} />
                      <Text className="text-green-500 text-xs font-medium">
                        Verified
                      </Text>
                    </View>
                  ) : (
                    // Self-reported — show pending clock
                    <View className="flex-row items-center gap-1">
                      <Clock size={14} color="#9CA3AF" strokeWidth={2} />
                      <Text className="text-text-secondary text-xs">
                        Pending
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                // ── Not yet scored: show inline input + submit
                <View className="flex-row items-center gap-2">
                  <TextInput
                    className="flex-1 bg-background text-text-primary rounded-lg px-3 py-2 text-base"
                    placeholder="Score"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={scoreInputs[er.route_id] ?? ""}
                    onChangeText={(text) =>
                      setScoreInputs((prev) => ({
                        ...prev,
                        [er.route_id]: text,
                      }))
                    }
                  />
                  <Pressable
                    onPress={() => handleSubmitScore(er.route_id)}
                    accessibilityRole="button"
                    testID={`submit-score-${er.route_id}`}
                    className="bg-accent px-4 py-2 rounded-lg"
                  >
                    <Text className="text-white font-medium">Submit</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}

      {/* Bottom spacer for scroll */}
      <View className="h-8" />
    </ScrollView>
  );
}
