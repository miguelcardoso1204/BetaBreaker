/**
 * Gym Leaderboard Screen — Active & Retired Leaderboards for a Gym
 *
 * Shows leaderboards belonging to a specific gym, toggled between active
 * (still running) and retired (ended). Two modes:
 *
 * 1. LIST MODE (default): Shows all leaderboards for the gym as cards with
 *    name, scoring model, participant count, and time window. Tapping a card
 *    opens its ranked entries.
 *
 * 2. DETAIL MODE: Shows the ranked entries for a selected leaderboard with
 *    rank, avatar, display name, and formatted score. The user's own row
 *    is highlighted.
 *
 * If the screen is opened with a `lb` query param (e.g., from the enrolled
 * leaderboards tab), it jumps directly to detail mode for that leaderboard.
 *
 * DATA FLOW:
 *   useLocalSearchParams() → gymId + optional leaderboardId (lb)
 *   useGym(gymId)          → gym name for header
 *   useGymLeaderboards(gymId, active) → list of leaderboards
 *   useLeaderboard(leaderboardId)     → ranked entries for detail view
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Users, ScrollText, Trophy, X } from "lucide-react-native";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useGymLeaderboards, GymLeaderboard } from "@/hooks/useGymLeaderboards";
import { useGym } from "@/hooks/useGyms";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Format a date range as a human-readable string.
 * e.g., "Mar 1 – Mar 31, 2026"
 */
function formatDateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

  // If same year, show year only once at the end
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString("en", opts)} – ${end.toLocaleDateString("en", { ...opts, year: "numeric" })}`;
  }
  return `${start.toLocaleDateString("en", { ...opts, year: "numeric" })} – ${end.toLocaleDateString("en", { ...opts, year: "numeric" })}`;
}

// ── Component ─────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  // Extract gymId and optional leaderboard ID from URL params.
  // lb is passed when navigating from the enrolled leaderboards tab.
  const { id: gymId, lb } = useLocalSearchParams<{ id: string; lb?: string }>();

  const { data: gym } = useGym(gymId);
  const { user } = useAuth();

  // ── State ──────────────────────────────────────────────────────
  const [showActive, setShowActive] = useState(true);
  // When selectedId is set, we show the detail view (ranked entries).
  // When null, we show the list of leaderboards.
  const [selectedId, setSelectedId] = useState<string | null>(lb ?? null);

  // Track whether the user arrived via deep link (lb param) so the
  // detail back button knows to router.back() instead of showing the
  // gym leaderboard list — a screen they never navigated through.
  const [arrivedViaDeepLink, setArrivedViaDeepLink] = useState(!!lb);

  // If lb param changes (e.g., deep link), sync it
  useEffect(() => {
    if (lb) {
      setSelectedId(lb);
      setArrivedViaDeepLink(true);
    }
  }, [lb]);

  // ── Data fetching ──────────────────────────────────────────────
  // Fetch BOTH active and retired lists simultaneously so switching
  // tabs is instant — the inactive tab's data is already cached.
  const activeListQuery = useGymLeaderboards(gymId, true);
  const retiredListQuery = useGymLeaderboards(gymId, false);
  const { data: leaderboards, isLoading: listLoading } = showActive ? activeListQuery : retiredListQuery;

  // Ranked entries for the selected leaderboard (used in detail mode)
  const { data: entries, isLoading: detailLoading } = useLeaderboard(selectedId ?? "");

  // Find the selected leaderboard's metadata from the list, or construct
  // a minimal version if we jumped straight to detail via lb param
  const selectedLeaderboard = leaderboards?.find((l) => l.id === selectedId);

  // Modal state for rules/prizes popups
  const [modalContent, setModalContent] = useState<{ title: string; body: string } | null>(null);

  // ── Loading state ──────────────────────────────────────────────
  if (listLoading && !selectedId) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="loading-indicator"
      >
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  // ── Detail view — ranked entries for a selected leaderboard ────
  if (selectedId) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        {/* Header — back to gym */}
        <View className="flex-row items-center px-4 pt-2 pb-1">
          <Pressable
            testID="back-to-list"
            onPress={() => {
              // If the user deep-linked here from the enrolled leaderboards tab,
              // go back to that tab. Otherwise show the gym's leaderboard list.
              if (arrivedViaDeepLink) {
                router.back();
              } else {
                setSelectedId(null);
              }
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={28} color="#ffffff" />
          </Pressable>
          <Text className="text-text-primary text-lg font-bold ml-2" numberOfLines={1}>
            {selectedLeaderboard?.name ?? t("gym.leaderboard.title")}
          </Text>
        </View>
        <ScrollView>
          {selectedLeaderboard && (
            <View className="px-4 pt-2 pb-2">
              <Text className="text-text-secondary text-sm">
                {formatDateRange(selectedLeaderboard.starts_at, selectedLeaderboard.ends_at)}
              </Text>

              {/* Rules & Prizes buttons — only shown when the admin has set them */}
              {(selectedLeaderboard.rules || selectedLeaderboard.prizes) && (
                <View className="flex-row mt-3 gap-2">
                  {selectedLeaderboard.rules && (
                    <Pressable
                      testID="rules-button"
                      onPress={() => setModalContent({
                        title: t("gym.leaderboard.rules"),
                        body: selectedLeaderboard.rules!,
                      })}
                      className="flex-row items-center bg-card rounded-lg px-3 py-2"
                    >
                      <ScrollText size={16} color="#8B5CF6" />
                      <Text className="text-accent text-sm font-medium ml-1.5">
                        {t("gym.leaderboard.rules")}
                      </Text>
                    </Pressable>
                  )}
                  {selectedLeaderboard.prizes && (
                    <Pressable
                      testID="prizes-button"
                      onPress={() => setModalContent({
                        title: t("gym.leaderboard.prizes"),
                        body: selectedLeaderboard.prizes!,
                      })}
                      className="flex-row items-center bg-card rounded-lg px-3 py-2"
                    >
                      <Trophy size={16} color="#8B5CF6" />
                      <Text className="text-accent text-sm font-medium ml-1.5">
                        {t("gym.leaderboard.prizes")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Loading entries */}
          {detailLoading ? (
            <View className="items-center justify-center py-16">
              <ActivityIndicator size="large" color="#7C3AED" />
            </View>
          ) : (!entries || entries.length === 0) ? (
            /* Empty state — no entries yet */
            <View className="items-center justify-center py-16 px-8">
              <Text className="text-text-secondary text-base text-center">
                {t("gym.leaderboard.noEntries")}
              </Text>
            </View>
          ) : (
            /* Ranked entry rows */
            <View className="px-4 pb-8">
              {entries.map((entry: any) => {
                const isCurrentUser = entry.user_id === user?.id;
                const displayName =
                  entry.profile?.display_name ?? "Unknown Climber";
                const avatarUrl = entry.profile?.avatar_url ?? undefined;
                return (
                  <View
                    key={entry.id}
                    testID={`leaderboard-row-${entry.user_id}`}
                    className={`flex-row items-center p-3 mb-2 rounded-xl ${
                      isCurrentUser ? "bg-accent/20" : "bg-card"
                    }`}
                  >
                    {/* Rank number */}
                    <Text className="text-text-primary font-bold text-lg w-10 text-center">
                      #{entry.rank}
                    </Text>

                    {/* Avatar + name — tappable to navigate to the user's profile.
                        Wrapped in a Pressable so users can discover other climbers
                        directly from the leaderboard rankings. */}
                    <Pressable
                      className="flex-row items-center flex-1 mx-2"
                      onPress={() => router.push(`/profile/${entry.user_id}` as any)}
                      accessibilityRole="link"
                      accessibilityLabel={`View ${displayName}'s profile`}
                    >
                      <Avatar
                        uri={avatarUrl}
                        name={displayName}
                        size="sm"
                      />
                      <Text className="text-text-primary text-base flex-1 ml-2" numberOfLines={1}>
                        {displayName}
                      </Text>
                    </Pressable>

                    {/* Formatted score */}
                    <Text className="text-text-primary font-bold text-base ml-2">
                      {Math.round(entry.score).toLocaleString()} pts
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Rules/Prizes popup modal */}
        <Modal
          visible={!!modalContent}
          transparent
          animationType="fade"
          onRequestClose={() => setModalContent(null)}
        >
          <Pressable
            className="flex-1 bg-black/60 justify-center items-center px-6"
            onPress={() => setModalContent(null)}
          >
            {/* stopPropagation prevents tapping the card from closing the modal */}
            <Pressable
              className="bg-card rounded-2xl p-5 w-full max-w-sm"
              onPress={(e) => e.stopPropagation()}
            >
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-text-primary text-lg font-bold">
                  {modalContent?.title}
                </Text>
                <Pressable
                  testID="modal-close"
                  onPress={() => setModalContent(null)}
                  hitSlop={8}
                >
                  <X size={22} color="#6B7280" />
                </Pressable>
              </View>
              <Text className="text-text-secondary text-sm leading-5">
                {modalContent?.body}
              </Text>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── List view — all leaderboards for this gym ──────────────────
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header — back to gym */}
      <View className="flex-row items-center px-4 pt-2 pb-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={28} color="#ffffff" />
        </Pressable>
        <Text className="text-text-primary text-lg font-bold ml-2" numberOfLines={1}>
          {gym?.name ? `${gym.name} Leaderboards` : t("gym.leaderboard.title")}
        </Text>
      </View>
      <ScrollView>
        {/* ── Active / Retired segment control ────────────────── */}
        <View className="flex-row mx-4 mb-4 bg-card rounded-lg p-1">
          <Pressable
            testID="filter-active"
            onPress={() => setShowActive(true)}
            className={`flex-1 py-2 rounded-md items-center ${
              showActive ? "bg-accent" : ""
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                showActive ? "text-white" : "text-text-secondary"
              }`}
            >
              {t("leaderboards.active")}
            </Text>
          </Pressable>
          <Pressable
            testID="filter-retired"
            onPress={() => setShowActive(false)}
            className={`flex-1 py-2 rounded-md items-center ${
              !showActive ? "bg-accent" : ""
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                !showActive ? "text-white" : "text-text-secondary"
              }`}
            >
              {t("leaderboards.retired")}
            </Text>
          </Pressable>
        </View>

        {/* ── Leaderboard list or empty state ─────────────────── */}
        {(!leaderboards || leaderboards.length === 0) ? (
          <View className="items-center justify-center py-16 px-8">
            <Text className="text-text-secondary text-base text-center">
              {showActive
                ? t("gym.leaderboard.noActive")
                : t("gym.leaderboard.noRetired")}
            </Text>
          </View>
        ) : (
          <View className="px-4 pb-8">
            {leaderboards.map((lb: GymLeaderboard) => (
              <Pressable
                key={lb.id}
                testID={`leaderboard-card-${lb.id}`}
                onPress={() => {
                  setSelectedId(lb.id);
                  // User navigated from the list, so back should return here
                  setArrivedViaDeepLink(false);
                }}
                className="bg-card rounded-xl p-4 mb-3"
              >
                <Text className="text-text-primary font-semibold text-base" numberOfLines={1}>
                  {lb.name}
                </Text>

                {/* Date range */}
                <Text className="text-text-secondary text-sm mt-1">
                  {formatDateRange(lb.starts_at, lb.ends_at)}
                </Text>

                {/* Participants count */}
                <View className="flex-row items-center mt-2">
                  <Users size={14} color="#6B7280" />
                  <Text className="text-text-secondary text-xs ml-1">
                    {t("gym.leaderboard.participants", { count: lb.total_participants })}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
