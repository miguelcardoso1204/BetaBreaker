/**
 * Admin Seasons Screen — Season Management + Route Archival (Step 15.6)
 *
 * Gym admins use this screen to manage seasons — named time periods that
 * organize route rotation schedules. Closing a season batch-archives all
 * active routes and naturally freezes the leaderboard.
 *
 * LAYOUT:
 *   1. Screen header: "Season Management" + "+ New Season" button
 *   2. Create form (toggled by button): name, start date, end date, Save/Cancel
 *   3. Filter tabs: All / Active / Closed
 *   4. FlatList of season cards, each showing:
 *      - Season name
 *      - Date range (start → end)
 *      - Status badge (active = green, closed = gray)
 *      - Active seasons → "Close Season" button (with Alert confirmation)
 *      - Closed seasons → delete button (trash icon)
 *
 * DATA FLOW:
 *   useAuth() → homeGymId → useSeasons(gymId) → FlatList
 *   Mutations: useCreateSeason, useCloseSeason, useDeleteSeason
 *
 * STATES:
 *   - Loading: centered ActivityIndicator
 *   - Error: error message
 *   - Empty: "No seasons" message
 *   - Data: filter tabs + season list
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import {
  useSeasons,
  useCreateSeason,
  useCloseSeason,
  useDeleteSeason,
} from "@/hooks/useSeasons";

// ── Status badge colors ──────────────────────────────────────────────
// Maps each season status to a Tailwind bg class for visual distinction.
// Active = green (running), closed = gray (ended).
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500",
  closed: "bg-gray-500",
};

// ── Filter tab definitions ───────────────────────────────────────────
// Labels are translation keys — resolved at render time via t()
const FILTER_TABS = [
  { key: "all", labelKey: "common.all" },
  { key: "active", labelKey: "admin.seasons.active" },
  { key: "closed", labelKey: "admin.seasons.closed" },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]["key"];

export default function SeasonsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const gymId = user?.homeGymId ?? null;

  // ── Data hooks ────────────────────────────────────────────────────
  const { seasons, isLoading, error } = useSeasons(gymId);
  const createSeason = useCreateSeason();
  const closeSeason = useCloseSeason();
  const deleteSeason = useDeleteSeason();

  // ── Filter state ──────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  // Apply filter to season list
  const filteredSeasons = useMemo(() => {
    if (activeFilter === "all") return seasons;
    return seasons.filter((s: any) => s.status === activeFilter);
  }, [seasons, activeFilter]);

  // ── Create form state ─────────────────────────────────────────────
  // Toggle visibility of the new season form with a boolean flag.
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");

  // ── Handlers ──────────────────────────────────────────────────────

  /** Submit the create season form */
  function handleCreate() {
    if (!gymId || !formName || !formStartDate || !formEndDate) return;

    createSeason.mutateAsync({
      gym_id: gymId,
      name: formName,
      start_date: formStartDate,
      end_date: formEndDate,
    });

    // Reset form after submit
    setFormName("");
    setFormStartDate("");
    setFormEndDate("");
    setShowForm(false);
  }

  /** Show confirmation alert before closing a season */
  function handleCloseSeason(seasonId: string) {
    Alert.alert(
      t("admin.seasons.closeSeason"),
      t("admin.seasons.closeSeasonConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.close"),
          style: "destructive",
          onPress: () => {
            closeSeason.mutateAsync({ seasonId, gymId: gymId! });
          },
        },
      ]
    );
  }

  /** Delete a closed season */
  function handleDelete(seasonId: string) {
    deleteSeason.mutateAsync({ seasonId });
  }

  // ── Loading state ─────────────────────────────────────────────────
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

  // ── Error state ───────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || t("admin.seasons.failedToLoad")}
        </Text>
      </View>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background">
      {/* ── Header row: title + create button ─────────────────────── */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-xl font-bold text-text-primary">
          {t("admin.seasons.title")}
        </Text>
        <Pressable
          onPress={() => setShowForm(!showForm)}
          accessibilityRole="button"
          className="bg-accent px-3 py-1.5 rounded-lg"
        >
          <Text className="text-white text-sm font-medium">{t("admin.seasons.newSeason")}</Text>
        </Pressable>
      </View>

      {/* ── Create Season Form ────────────────────────────────────── */}
      {/* Toggled by the "+ New Season" button. Contains text inputs for
          name, start date, and end date, plus Save/Cancel buttons. */}
      {showForm && (
        <View className="bg-surface mx-4 mb-3 p-3 rounded-lg">
          <TextInput
            placeholder={t("admin.seasons.seasonName")}
            value={formName}
            onChangeText={setFormName}
            className="border border-text-secondary rounded-lg px-3 py-2 mb-2 text-text-primary"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            placeholder={t("admin.seasons.startDate")}
            value={formStartDate}
            onChangeText={setFormStartDate}
            className="border border-text-secondary rounded-lg px-3 py-2 mb-2 text-text-primary"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            placeholder={t("admin.seasons.endDate")}
            value={formEndDate}
            onChangeText={setFormEndDate}
            className="border border-text-secondary rounded-lg px-3 py-2 mb-2 text-text-primary"
            placeholderTextColor="#9CA3AF"
          />
          <View className="flex-row gap-2">
            <Pressable
              onPress={handleCreate}
              accessibilityRole="button"
              className="bg-accent px-4 py-2 rounded-lg"
            >
              <Text className="text-white text-sm font-medium">{t("common.save")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowForm(false)}
              accessibilityRole="button"
              className="bg-surface border border-text-secondary px-4 py-2 rounded-lg"
            >
              <Text className="text-text-primary text-sm font-medium">{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Filter Tabs ───────────────────────────────────────────── */}
      <View className="flex-row px-4 mb-3 gap-2">
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveFilter(tab.key)}
            accessibilityRole="button"
            className={`px-3 py-1.5 rounded-full ${
              activeFilter === tab.key
                ? "bg-accent"
                : "bg-surface border border-text-secondary"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                activeFilter === tab.key ? "text-white" : "text-text-primary"
              }`}
            >
              {t(tab.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Empty State ───────────────────────────────────────────── */}
      {filteredSeasons.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-text-secondary text-center">
            {t("admin.seasons.noSeasons")}
          </Text>
        </View>
      ) : (
        /* ── Season List ──────────────────────────────────────────── */
        <FlatList
          data={filteredSeasons}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }: { item: any }) => (
            <View className="bg-surface rounded-lg p-3 mb-2">
              {/* Top row: season name + status badge */}
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-text-primary font-medium text-base flex-1 mr-2" numberOfLines={1}>
                  {item.name}
                </Text>

                {/* Status badge — color-coded pill */}
                <View
                  className={`px-2 py-0.5 rounded-full ${
                    STATUS_COLORS[item.status] ?? "bg-gray-500"
                  }`}
                >
                  <Text className="text-white text-xs font-medium">
                    {item.status}
                  </Text>
                </View>
              </View>

              {/* Date range */}
              <Text className="text-text-secondary text-sm mb-2">
                {item.start_date} → {item.end_date}
              </Text>

              {/* Action buttons */}
              <View className="flex-row items-center gap-2">
                {/* Active seasons get a "Close Season" button */}
                {item.status === "active" && (
                  <Pressable
                    onPress={() => handleCloseSeason(item.id)}
                    accessibilityRole="button"
                    className="bg-red-500 px-3 py-1.5 rounded-lg"
                  >
                    <Text className="text-white text-xs font-medium">
                      {t("admin.seasons.closeSeason")}
                    </Text>
                  </Pressable>
                )}

                {/* Closed seasons get a delete button */}
                {item.status === "closed" && (
                  <Pressable
                    testID={`delete-season-${item.id}`}
                    onPress={() => handleDelete(item.id)}
                    accessibilityRole="button"
                    className="ml-auto"
                  >
                    <Trash2 size={16} color="#EF4444" />
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
