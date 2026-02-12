/**
 * Edit Event Screen — Detail View + CRUD for Event, Routes, Categories
 *
 * This is the main admin event management screen. It's divided into
 * three sections:
 *
 *   1. EVENT INFO: Edit name, scoring model, status (with save button)
 *   2. ROUTES: View linked routes with remove buttons
 *   3. CATEGORIES: View/add/remove competition brackets
 *
 * Plus a "Delete Event" button at the bottom for destructive action.
 *
 * DATA FLOW:
 *   - useLocalSearchParams() → eventId from the URL
 *   - useEvent(eventId) → fetches event with embedded data
 *   - useEventRoutes(eventId) → fetches linked routes (separate cache)
 *   - useEventCategories(eventId) → fetches categories (separate cache)
 *   - Mutations: useUpdateEvent, useDeleteEvent, useRemoveRouteFromEvent,
 *     useAddCategory, useDeleteCategory
 *
 * STATUS TRANSITIONS:
 *   The edit screen allows changing status via a picker. No client-side
 *   state machine — the DB CHECK constraint validates allowed values.
 *   Typical flow: draft → registration_open → ongoing → completed.
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useEvent,
  useEventRoutes,
  useEventCategories,
  useUpdateEvent,
  useDeleteEvent,
  useRemoveRouteFromEvent,
  useAddCategory,
  useDeleteCategory,
} from "@/hooks/useEvents";
import { useEventScores } from "@/hooks/useScores";
import type { ScoringModel, EventStatus } from "@/services/events.service";

/** Status options for the status picker. */
const STATUS_OPTIONS: EventStatus[] = [
  "draft",
  "registration_open",
  "ongoing",
  "completed",
  "cancelled",
];

/** Scoring model display labels. */
const SCORING_LABELS: Record<string, string> = {
  tops_and_zones: "Tops & Zones",
  points: "Points",
  thousand_divide_by: "1000/Attempts",
  redpoint: "Redpoint",
};

export default function EditEventScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // ── Data fetching ──────────────────────────────────────────────────
  const { event, isLoading, error } = useEvent(eventId);
  const { eventRoutes } = useEventRoutes(eventId);
  const { categories } = useEventCategories(eventId);
  const { scores } = useEventScores(eventId);

  // ── Mutations ──────────────────────────────────────────────────────
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const removeRoute = useRemoveRouteFromEvent();
  const addCategoryMutation = useAddCategory();
  const deleteCategoryMutation = useDeleteCategory();

  // ── Local form state (initialized from fetched event) ──────────────
  const [name, setName] = useState("");
  const [status, setStatus] = useState<EventStatus>("draft");
  const [newCategoryName, setNewCategoryName] = useState("");

  // Sync local state when event data arrives or changes.
  // This ensures the form shows the latest server data.
  useEffect(() => {
    if (event) {
      setName(event.name);
      setStatus(event.status as EventStatus);
    }
  }, [event]);

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

  // ── Handlers ───────────────────────────────────────────────────────

  function handleSave() {
    updateEvent.mutate(
      {
        eventId: event!.id,
        data: {
          name: name.trim(),
          status,
        },
      },
      {
        onSuccess: () => {
          // Stay on the page — the query will refetch with fresh data
        },
      }
    );
  }

  function handleDelete() {
    deleteEvent.mutate(
      { eventId: event!.id },
      {
        onSuccess: () => router.back(),
      }
    );
  }

  function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    addCategoryMutation.mutate({
      eventId: event!.id,
      name: newCategoryName.trim(),
    });
    setNewCategoryName("");
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background px-4 pt-4">
      {/* ── Section 1: Event Info ──────────────────────────────────── */}
      <Text className="text-xl font-bold text-text-primary mb-4">
        Edit Event
      </Text>

      {/* Event name */}
      <Text className="text-text-secondary text-sm mb-1">Name</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        value={name}
        onChangeText={setName}
      />

      {/* Scoring model (read-only display — changing scoring model after
          creation would invalidate existing scores) */}
      <Text className="text-text-secondary text-sm mb-1">Scoring Model</Text>
      <View className="bg-surface rounded-lg px-3 py-3 mb-4">
        <Text className="text-text-primary text-base">
          {SCORING_LABELS[event.scoring_model] ?? event.scoring_model}
        </Text>
      </View>

      {/* Status selector — tap to cycle through statuses */}
      <Text className="text-text-secondary text-sm mb-2">Status</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {STATUS_OPTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => setStatus(s)}
            accessibilityRole="button"
            className={`px-3 py-1.5 rounded-full ${
              status === s ? "bg-accent" : "bg-surface"
            }`}
          >
            <Text
              className={`text-sm ${
                status === s ? "text-white font-medium" : "text-text-secondary"
              }`}
            >
              {s}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Save button */}
      <Pressable
        onPress={handleSave}
        accessibilityRole="button"
        className="bg-accent py-3 rounded-lg items-center mb-6"
      >
        <Text className="text-white font-bold text-base">Save Changes</Text>
      </Pressable>

      {/* ── Section 2: Linked Routes ──────────────────────────────── */}
      <Text className="text-lg font-bold text-text-primary mb-2">
        Routes ({eventRoutes.length})
      </Text>

      {eventRoutes.length === 0 ? (
        <Text className="text-text-secondary text-sm mb-4">
          No routes linked yet
        </Text>
      ) : (
        <View className="mb-4">
          {eventRoutes.map((er: any) => (
            <View
              key={er.route_id}
              className="bg-surface rounded-lg px-3 py-3 mb-2 flex-row items-center justify-between"
            >
              <View>
                <Text className="text-text-primary font-medium">
                  {er.route?.name ?? "Unknown route"}
                </Text>
                <Text className="text-text-secondary text-xs">
                  Grade: {er.route?.canonical_grade ?? "?"} | Order:{" "}
                  {er.sort_order}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  removeRoute.mutate({
                    eventId: event!.id,
                    routeId: er.route_id,
                  })
                }
                accessibilityRole="button"
                className="bg-error/10 px-3 py-1.5 rounded-lg"
              >
                <Text className="text-error text-sm font-medium">Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* ── Section 3: Categories ─────────────────────────────────── */}
      <Text className="text-lg font-bold text-text-primary mb-2">
        Categories ({categories.length})
      </Text>

      {categories.map((cat: any) => (
        <View
          key={cat.id}
          className="bg-surface rounded-lg px-3 py-3 mb-2 flex-row items-center justify-between"
        >
          <Text className="text-text-primary font-medium">{cat.name}</Text>
          <Pressable
            onPress={() =>
              deleteCategoryMutation.mutate({ categoryId: cat.id })
            }
            accessibilityRole="button"
            testID="delete-category-button"
            className="bg-error/10 px-3 py-1.5 rounded-lg"
          >
            <Text className="text-error text-sm font-medium">Remove</Text>
          </Pressable>
        </View>
      ))}

      {/* Add category form */}
      <View className="flex-row gap-2 mb-6">
        <TextInput
          className="flex-1 bg-surface text-text-primary rounded-lg px-3 py-2.5 text-base"
          placeholder="New category name"
          placeholderTextColor="#9ca3af"
          value={newCategoryName}
          onChangeText={setNewCategoryName}
        />
        <Pressable
          onPress={handleAddCategory}
          accessibilityRole="button"
          className="bg-accent px-4 py-2.5 rounded-lg justify-center"
        >
          <Text className="text-white font-medium">Add</Text>
        </Pressable>
      </View>

      {/* ── Section 4: Manage Scores ──────────────────────────────── */}
      <Pressable
        onPress={() =>
          router.push(`/(admin)/events/scores?eventId=${event!.id}` as any)
        }
        accessibilityRole="button"
        testID="manage-scores-button"
        className="bg-surface py-3 rounded-lg items-center mb-6"
      >
        <Text className="text-accent font-bold text-base">
          Manage Scores ({scores.length})
        </Text>
      </Pressable>

      {/* ── Delete event (destructive) ────────────────────────────── */}
      <Pressable
        onPress={handleDelete}
        accessibilityRole="button"
        className="border border-error py-3 rounded-lg items-center mb-8"
      >
        <Text className="text-error font-bold text-base">Delete Event</Text>
      </Pressable>
    </ScrollView>
  );
}
