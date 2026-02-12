/**
 * Live Scoreboard Screen — Real-Time Competition Rankings
 *
 * Displays aggregated, ranked scores for a competition event. Athletes
 * and spectators see who's winning in real-time as scores are submitted
 * and verified.
 *
 * DATA FLOW:
 *   useLocalSearchParams() → eventId from the URL (/events/[id]/scoreboard)
 *   useEvent(eventId)            → event name + scoring model for header
 *   useEventScores(eventId)      → raw score rows with embedded profiles
 *   useEventCategories(eventId)  → category chips for filtering
 *   useScoreboardRealtime(eventId) → Supabase Realtime → auto-refetch
 *   useAuth()                    → current user ID for row highlighting
 *
 * CLIENT-SIDE PIPELINE:
 *   Raw scores → aggregateScores(scores, categoryId?)
 *             → rankCompetitionEntries(aggregated)
 *             → render ranked list
 *
 * WHY CLIENT-SIDE?
 * Competition datasets are small (<2000 scores). Aggregating here lets
 * us filter by category instantly without a DB round trip, and the
 * Realtime subscription just invalidates the TanStack Query cache —
 * no complex state merging needed.
 *
 * UI PATTERN:
 * Follows the same layout as app/gym/[id]/leaderboard.tsx:
 *   - Header with event name and scoring model
 *   - Filter chips (categories instead of period/model)
 *   - Ranked list with avatar, name, score
 *   - Current user's row highlighted with accent background
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Trophy } from "lucide-react-native";

import { useEvent, useEventCategories } from "@/hooks/useEvents";
import { useEventScores } from "@/hooks/useScores";
import { useScoreboardRealtime } from "@/hooks/useScoreboardRealtime";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/ui/Avatar";
import {
  aggregateScores,
  rankCompetitionEntries,
  formatCompetitionScore,
} from "@/utils/competitionScoring";
import type { ScoringModel } from "@/services/events.service";

/** Human-readable labels for each scoring model. */
const SCORING_LABELS: Record<string, string> = {
  tops_and_zones: "Tops & Zones",
  points: "Points",
  thousand_divide_by: "1000/Attempts",
  redpoint: "Redpoint",
};

export default function ScoreboardScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();

  // ── Data fetching ────────────────────────────────────────────────
  const { event, isLoading, error } = useEvent(eventId);
  const { scores } = useEventScores(eventId);
  const { categories } = useEventCategories(eventId);
  const { user } = useAuth();

  // ── Realtime subscription ────────────────────────────────────────
  // Listens for INSERT/UPDATE/DELETE on competition_scores for this
  // event and invalidates the scores cache so we auto-refetch
  useScoreboardRealtime(eventId);

  // ── Category filter state ────────────────────────────────────────
  // null = "All" (no category filter), string = specific category ID
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // ── Client-side aggregation + ranking pipeline ───────────────────
  // useMemo ensures we only re-compute when scores or category changes,
  // not on every render (React best practice for derived data).
  const rankedEntries = useMemo(() => {
    const aggregated = aggregateScores(scores, selectedCategory ?? undefined);
    return rankCompetitionEntries(aggregated);
  }, [scores, selectedCategory]);

  // ── Loading state ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="loading-indicator"
      >
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  // ── Error state ──────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || "Failed to load scoreboard"}
        </Text>
      </View>
    );
  }

  // ── No event found ───────────────────────────────────────────────
  if (!event) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-text-secondary">Event not found</Text>
      </View>
    );
  }

  // Scoring model for formatting scores
  const scoringModel = event.scoring_model as ScoringModel;

  return (
    <View className="flex-1 bg-background">
      <ScrollView>
        {/* ── Header ─────────────────────────────────────────────── */}
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row items-center gap-2 mb-1">
            <Trophy size={24} color="#7C3AED" strokeWidth={2} />
            <Text className="text-text-primary text-2xl font-bold">
              {event.name}
            </Text>
          </View>
          <Text className="text-text-secondary text-sm">
            {SCORING_LABELS[event.scoring_model] ?? event.scoring_model}
          </Text>
        </View>

        {/* ── Category chips ─────────────────────────────────────── */}
        {/* Only show when the event has categories. "All" is always
            first, followed by one chip per category. Active chip gets
            accent background; inactive gets card background. */}
        {categories.length > 0 && (
          <View className="flex-row px-4 gap-2 mb-4 flex-wrap">
            {/* "All" chip — clears category filter */}
            <Pressable
              onPress={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full ${
                selectedCategory === null ? "bg-accent" : "bg-card"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  selectedCategory === null
                    ? "text-white"
                    : "text-text-secondary"
                }`}
              >
                All
              </Text>
            </Pressable>

            {categories.map((cat: any) => {
              const isActive = selectedCategory === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-full ${
                    isActive ? "bg-accent" : "bg-card"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      isActive ? "text-white" : "text-text-secondary"
                    }`}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Ranked list ────────────────────────────────────────── */}
        {rankedEntries.length === 0 ? (
          <View className="items-center justify-center py-16 px-8">
            <Text className="text-text-secondary text-base text-center">
              No scores yet
            </Text>
          </View>
        ) : (
          <View className="px-4 pb-8">
            {rankedEntries.map((entry) => {
              // Highlight the current user's row with an accent tint
              const isCurrentUser = entry.userId === user?.id;

              return (
                <View
                  key={entry.userId}
                  testID={`scoreboard-row-${entry.userId}`}
                  className={`flex-row items-center p-3 mb-2 rounded-xl ${
                    isCurrentUser ? "bg-accent/20" : "bg-card"
                  }`}
                >
                  {/* Rank — fixed width for alignment */}
                  <Text className="text-text-primary font-bold text-lg w-10 text-center">
                    #{entry.rank}
                  </Text>

                  {/* Avatar — user photo or initials */}
                  <View className="mx-2">
                    <Avatar
                      uri={entry.avatarUrl ?? undefined}
                      name={entry.displayName}
                      size="sm"
                    />
                  </View>

                  {/* Display name — takes remaining space */}
                  <Text
                    className="text-text-primary text-base flex-1"
                    numberOfLines={1}
                  >
                    {entry.displayName}
                  </Text>

                  {/* Formatted score — right-aligned */}
                  <Text className="text-text-primary font-bold text-base ml-2">
                    {formatCompetitionScore(entry.totalScore, scoringModel)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
