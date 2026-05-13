// app/(tabs)/profile.tsx
//
// Profile screen — the user's personal dashboard showing their avatar,
// display name, subscription tier, climbing streak, pinned badges, stats,
// and account actions (edit, export, delete).
//
// DATA FLOW:
// This screen combines data from multiple hooks:
//   1. useAuth()            → user profile (name, avatar, tier, pinnedBadgeIds)
//   2. useUserBadges()      → all badges the user has earned
//   3. useUserStreak()      → current and longest weekly climbing streaks
//   4. usePinnedBadges()    → resolved pinned badge IDs from profile
//   5. useSetPinnedBadges() → mutation to update pinned selection
//   6. useProfileStats()    → total sends + max grade aggregation
//   7. useUpdateProfile()   → mutation to save profile edits
//   8. useExportData()      → mutation to export all user data as JSONB
//   9. useDeleteAccount()   → mutation to permanently delete account
//
// EDIT MODE:
// Toggled via an "Edit Profile" button. In edit mode, display name, avatar
// URL, and preferred grade system become editable. Grade system uses a
// 3-option Pressable row. Saving calls useUpdateProfile, which refreshes
// useAuth's cached profile. Favorite gyms are managed via the star icon
// on individual gym detail screens, not from the profile edit form.
//
// BADGE PICKER:
// The BadgePicker modal opens when the user taps "Edit" on the pinned
// badges section. It shows all earned badges and lets the user toggle
// which ones to pin, respecting the tier limit (free: 1, pro: 3).

import React, { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Settings, Trophy, ChevronRight, Clock, Search } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import {
  useUserBadges,
  useUserStreak,
  usePinnedBadges,
  useSetPinnedBadges,
} from "@/hooks/useBadges";
import {
  useActiveChallenges,
  useChallengeProgress,
} from "@/hooks/useChallenges";
import { useEnrolledLeaderboards } from "@/hooks/useEnrolledLeaderboards";
import { useRecentSessions } from "@/hooks/useRecentSessions";
import { useGyms } from "@/hooks/useGyms";
import {
  useProfileStats,
  useUpdateProfile,
} from "@/hooks/useProfile";
import { Image } from "expo-image";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { ProfileBadges } from "@/components/badges/ProfileBadges";
import { BadgePicker } from "@/components/badges/BadgePicker";
import { ChallengeCard } from "@/components/challenges";
import { StreakCard, StreakStatusBanner } from "@/components/streaks";
import { deriveStreakStatus } from "@/utils/streakStatus";
import {
  deriveChallengeStatus,
  computeTimeRemaining,
} from "@/utils/challengeCriteria";
import { canonicalToDisplay } from "@/utils/grades";
import type { GradeSystem } from "@/utils/grades";

// The three grade systems users can choose from in the picker.
// `labelKey` is a translation key resolved at render time via t().
const GRADE_SYSTEMS: { value: GradeSystem; labelKey: string }[] = [
  { value: "v-scale", labelKey: "gradeSystem.vScale" },
  { value: "font", labelKey: "gradeSystem.font" },
  { value: "yds", labelKey: "gradeSystem.yds" },
];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isLoading: authLoading, signOut, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  // Pull-to-refresh state. Invalidates all TanStack Query caches so every
  // section (stats, streak, sessions, leaderboards, badges, challenges)
  // re-fetches fresh data from the server.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshProfile(),
      queryClient.invalidateQueries(),
    ]);
    setRefreshing(false);
  }, [refreshProfile, queryClient]);

  // Fetch gamification data — all hooks disabled when user is null
  const { data: earnedBadges } = useUserBadges(user?.id);
  const { data: streak } = useUserStreak(user?.id);
  const { data: pinnedData } = usePinnedBadges(user?.id);
  const setPinnedBadges = useSetPinnedBadges();

  // Fetch profile stats (total sends + max grade)
  const { data: statsData } = useProfileStats(user?.id);

  // Fetch the user's active enrolled leaderboards for the summary section.
  // Only active leaderboards are shown — the full list (with retired) lives
  // on the Leaderboards tab.
  const { data: enrolledLeaderboards } = useEnrolledLeaderboards(user?.id, true);

  // Fetch the user's most recent climbing sessions for the history section.
  const { data: recentSessions } = useRecentSessions(undefined, 5);

  // Fetch active challenges — without a specific gym context, challenges
  // are not scoped. If needed, the user can view gym-specific challenges
  // from the gym detail screen.
  const { data: activeChallenges } = useActiveChallenges(undefined);
  const { data: challengeProgress } = useChallengeProgress(
    user?.id,
    undefined,
  );

  // Mutations for profile management
  const updateProfile = useUpdateProfile(refreshProfile);

  // ── Local state ────────────────────────────────────────────────────

  // Badge picker modal
  const [pickerVisible, setPickerVisible] = useState(false);

  // Edit mode state — tracks whether the user is editing their profile
  const [isEditing, setIsEditing] = useState(false);
  // Local form fields — initialized from user data when entering edit mode
  const [editName, setEditName] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editGradeSystem, setEditGradeSystem] = useState<GradeSystem>("v-scale");


  // ── Derived values ─────────────────────────────────────────────────

  // Resolve pinned badge IDs to full badge objects by matching against
  // the user's earned badges.
  const pinnedBadgeIds = pinnedData?.pinned_badge_ids ?? [];
  const resolvedPinnedBadges = useMemo(() => {
    if (!earnedBadges || !pinnedBadgeIds.length) return [];
    return earnedBadges.filter((ub: any) =>
      pinnedBadgeIds.includes(ub.badge_id)
    );
  }, [earnedBadges, pinnedBadgeIds]);

  // Derive real-time streak status from the DB's (possibly stale) values.
  const derivedStreak = useMemo(
    () =>
      deriveStreakStatus(
        streak?.current_streak ?? 0,
        streak?.last_active_date ?? null,
      ),
    [streak?.current_streak, streak?.last_active_date],
  );

  // Determine max pinned badges based on tier
  const maxPins = user?.tier === "pro" ? 3 : 1;

  // Extract stats from the RPC result. The RPC returns a TABLE result
  // which Supabase delivers as an array — take the first element.
  const stats = Array.isArray(statsData) ? statsData[0] : statsData;
  const totalSends = stats?.total_sends ?? 0;
  const maxGrade = stats?.max_grade ?? null;

  // Convert max_grade (canonical integer) to display string in the user's
  // preferred grade system. Returns null if user has no sends.
  const maxGradeDisplay = useMemo(() => {
    if (maxGrade === null || maxGrade === undefined) return null;
    try {
      return canonicalToDisplay(
        maxGrade,
        (user?.preferredGradeSystem as GradeSystem) ?? "v-scale"
      );
    } catch {
      return null;
    }
  }, [maxGrade, user?.preferredGradeSystem]);


  // ── Handlers ───────────────────────────────────────────────────────

  /** Enter edit mode — populate form fields from current user data. */
  function handleStartEditing() {
    if (!user) return;
    setEditName(user.displayName ?? "");
    setEditAvatarUrl(user.avatarUrl ?? "");
    setEditGradeSystem((user.preferredGradeSystem as GradeSystem) ?? "v-scale");
    setIsEditing(true);
  }

  /** Cancel editing — discard local changes and exit edit mode. */
  function handleCancelEditing() {
    setIsEditing(false);
  }

  /** Save edited profile fields to the database. */
  async function handleSaveProfile() {
    if (!user) return;
    await updateProfile.mutateAsync({
      userId: user.id,
      fields: {
        display_name: editName || null,
        avatar_url: editAvatarUrl || null,
        preferred_grade_system: editGradeSystem,
      },
    });
    setIsEditing(false);
  }

  /** Save the badge selection from the picker. */
  async function handleSavePinnedBadges(badgeIds: string[]) {
    if (user) {
      await setPinnedBadges.mutateAsync({
        userId: user.id,
        badgeIds,
      });
    }
    setPickerVisible(false);
  }

  // ── Loading state ──────────────────────────────────────────────────
  if (authLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-text-secondary text-base">{t("common.loading")}</Text>
      </View>
    );
  }

  // ── Unauthenticated state ──────────────────────────────────────────
  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-text-primary text-lg font-bold">
          {t("profile.signIn")}
        </Text>
        <Text className="text-text-secondary text-sm mt-2">
          {t("profile.signInPrompt")}
        </Text>
      </View>
    );
  }

  // ── Authenticated profile ──────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Top bar: Search + Settings icons pinned to top-right.
          Search opens the climber search screen (/search); the gear
          opens the user's settings. */}
      <View className="flex-row justify-end items-center gap-2 px-4 pt-2">
        <IconButton
          icon={Search}
          label={t("search.title")}
          onPress={() => router.push("/search" as any)}
          size={22}
          color="#9CA3AF"
          testID="search-button"
        />
        <IconButton
          icon={Settings}
          label={t("settings.title")}
          onPress={() => router.push("/settings" as any)}
          size={22}
          color="#9CA3AF"
          testID="settings-button"
        />
      </View>
    <ScrollView
      className="flex-1"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
      }
    >
      {/* Header: Avatar + name + tier badge + edit button */}
      <View className="pb-4">
        {isEditing ? (
          // ── Edit mode header ──────────────────────────────────────
          <View className="w-full px-4">
            <Text className="text-text-primary text-lg font-bold mb-4">
              {t("profile.editProfile")}
            </Text>

            {/* Display name input */}
            <Text className="text-text-secondary text-sm mb-1">{t("profile.displayName")}</Text>
            <TextInput
              className="border border-border rounded-lg px-3 py-2 text-text-primary mb-3"
              value={editName}
              onChangeText={setEditName}
              placeholder={t("profile.displayNamePlaceholder")}
              testID="edit-name-input"
            />

            {/* Avatar URL input — real image picker comes in Phase 12 */}
            <Text className="text-text-secondary text-sm mb-1">{t("profile.avatarUrl")}</Text>
            <TextInput
              className="border border-border rounded-lg px-3 py-2 text-text-primary mb-3"
              value={editAvatarUrl}
              onChangeText={setEditAvatarUrl}
              placeholder={t("profile.avatarUrlPlaceholder")}
              testID="edit-avatar-input"
            />

            {/* Grade system picker — 3-option pressable row */}
            <Text className="text-text-secondary text-sm mb-1">{t("profile.gradeSystem")}</Text>
            <View className="flex-row gap-2 mb-3">
              {GRADE_SYSTEMS.map((gs) => (
                <Pressable
                  key={gs.value}
                  onPress={() => setEditGradeSystem(gs.value)}
                  testID={`grade-option-${gs.value}`}
                  className={`flex-1 py-2 items-center rounded-lg ${
                    editGradeSystem === gs.value
                      ? "bg-accent"
                      : "bg-surface"
                  }`}
                >
                  <Text
                    className={
                      editGradeSystem === gs.value
                        ? "text-white font-semibold"
                        : "text-text-primary"
                    }
                  >
                    {t(gs.labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Save / Cancel buttons */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleCancelEditing}
                testID="edit-cancel-button"
                className="flex-1 py-3 items-center rounded-lg bg-surface"
              >
                <Text className="text-text-primary font-semibold">{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveProfile}
                testID="edit-save-button"
                className="flex-1 py-3 items-center rounded-lg bg-accent"
              >
                <Text className="text-white font-semibold">{t("common.save")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          // ── View mode header ──────────────────────────────────────
          <View className="flex-row items-start w-full px-4">
            <Avatar
              uri={user.avatarUrl ?? undefined}
              name={user.displayName ?? t("profile.climber")}
              size="lg"
              variant="square"
              testID="profile-avatar"
            />
            <View className="ml-4 flex-1">
              <Text className="text-text-primary text-3xl font-bold">
                {user.displayName ?? t("profile.climber")}
              </Text>
              {/* Tier badge — shows the user's subscription level */}
              <View className="flex-row mt-1">
                <Badge
                  label={user.tier === "pro" ? t("profile.pro") : t("profile.free")}
                  variant={user.tier === "pro" ? "success" : "default"}
                />
              </View>
              {/* Edit Profile button */}
              <Pressable
                onPress={handleStartEditing}
                testID="edit-profile-button"
                className="px-4 py-2 rounded-lg bg-surface mt-2 self-start"
              >
                <Text className="text-text-primary font-semibold">
                  {t("profile.editProfile")}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Stats section — total sends and max grade */}
      <View className="px-4 py-3">
        <Text className="text-text-primary text-lg font-bold mb-2">{t("profile.stats")}</Text>
        <View className="flex-row gap-4">
          <View className="flex-1 bg-surface rounded-lg p-3 items-center">
            <Text className="text-text-primary text-xl font-bold">
              {Number(totalSends)}
            </Text>
            <Text className="text-text-secondary text-xs">{t("profile.totalSends")}</Text>
          </View>
          <View className="flex-1 bg-surface rounded-lg p-3 items-center">
            <Text className="text-text-primary text-xl font-bold">
              {maxGradeDisplay ?? t("profile.noMaxGrade")}
            </Text>
            <Text className="text-text-secondary text-xs">{t("profile.maxGrade")}</Text>
          </View>
        </View>
      </View>

      {/* Recent Sessions section — shows the user's latest gym visits
          with gym name, date, duration, and ascent count. Placed after
          stats (cumulative numbers) and before streak (consistency). */}
      <View className="mt-4" testID="recent-sessions-section">
        <View className="flex-row items-center justify-between px-4 mb-2">
          <Text className="text-text-primary text-lg font-bold">
            {t("profile.recentSessions")}
          </Text>
        </View>
        {recentSessions && recentSessions.length > 0 ? (
          recentSessions.map((session: any) => {
            // Format duration as "Xh Ym" or just "Xm" for short sessions.
            const mins = session.duration_minutes ?? 0;
            const hours = Math.floor(mins / 60);
            const remainingMins = mins % 60;
            const durationStr = hours > 0
              ? `${hours}h ${remainingMins}m`
              : `${mins}m`;

            // Format the session date for display.
            const sessionDate = new Date(session.started_at).toLocaleDateString(
              undefined,
              { month: "short", day: "numeric", year: "numeric" }
            );

            return (
              <Pressable
                key={session.id}
                testID={`session-card-${session.id}`}
                className="bg-card rounded-xl p-3 mx-4 mb-2 flex-row items-center"
                onPress={() => {
                  router.push(`/(tabs)/logbook/session/${session.id}` as any);
                }}
              >
                {/* Gym logo or fallback clock icon */}
                {session.gym?.logo_url ? (
                  <Image
                    source={{ uri: session.gym.logo_url }}
                    style={{ width: 40, height: 40, borderRadius: 8 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="bg-accent rounded-lg w-10 h-10 items-center justify-center">
                    <Clock size={18} color="#ffffff" />
                  </View>
                )}
                <View className="w-3" />
                {/* Session info */}
                <View className="flex-1 mr-2">
                  <Text className="text-text-primary font-semibold text-sm" numberOfLines={1}>
                    {session.gym?.name ?? "Unknown Gym"}
                  </Text>
                  <Text className="text-text-secondary text-xs mt-0.5">
                    {sessionDate} · {durationStr}
                  </Text>
                </View>
                {/* Ascent count */}
                <Text className="text-text-primary font-bold text-sm">
                  {session.ascentCount} {t("profile.ascents")}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <View className="px-4 py-4 items-center">
            <Clock size={32} color="#6B7280" />
            <Text className="text-text-secondary text-sm mt-2">
              {t("profile.noRecentSessions")}
            </Text>
          </View>
        )}
      </View>

      {/* Streak section: status-aware card with recovery banner */}
      <StreakCard
        currentStreak={derivedStreak.displayStreak}
        longestStreak={streak?.longest_streak ?? 0}
        status={derivedStreak.status}
        testID="streak-card"
      />
      <StreakStatusBanner
        status={derivedStreak.status}
        decayedFrom={derivedStreak.decayedFrom}
        testID="streak-banner"
      />

      {/* Pinned badges section (or empty state) */}
      {earnedBadges && earnedBadges.length > 0 ? (
        <ProfileBadges
          pinnedBadges={resolvedPinnedBadges}
          onManagePress={() => setPickerVisible(true)}
          maxPins={maxPins}
        />
      ) : (
        <View className="px-4 py-6 items-center">
          <Text className="text-text-secondary text-sm">{t("profile.noBadges")}</Text>
          <Text className="text-text-secondary text-xs mt-1">
            {t("profile.startClimbing")}
          </Text>
        </View>
      )}

      {/* Enrolled Leaderboards section — shows active leaderboard standings.
          Displayed after badges/achievements so the user sees their competitive
          standing at a glance. Tapping a card navigates to the full leaderboard
          detail; "View All" goes to the Leaderboards tab. */}
      <View className="mt-4" testID="enrolled-leaderboards-section">
        <View className="flex-row items-center justify-between px-4 mb-2">
          <Text className="text-text-primary text-lg font-bold">
            {t("profile.enrolledLeaderboards")}
          </Text>
          {enrolledLeaderboards && enrolledLeaderboards.length > 0 && (
            <Pressable
              onPress={() => router.push("/(tabs)/leaderboards" as any)}
              testID="view-all-leaderboards"
            >
              <Text className="text-accent text-sm font-medium">
                {t("profile.viewAll")}
              </Text>
            </Pressable>
          )}
        </View>
        {enrolledLeaderboards && enrolledLeaderboards.length > 0 ? (
          enrolledLeaderboards.slice(0, 3).map((lb: any) => (
            <Pressable
              key={lb.id}
              testID={`enrolled-lb-${lb.leaderboard_id}`}
              onPress={() =>
                router.push(`/(tabs)/gym/${lb.gym_id}/leaderboard?lb=${lb.leaderboard_id}` as any)
              }
              className="bg-card rounded-xl p-3 mx-4 mb-2 flex-row items-center"
            >
              {/* Rank badge */}
              <View className="bg-accent rounded-lg w-10 h-10 items-center justify-center mr-3">
                <Text className="text-white font-bold text-base">
                  #{lb.rank}
                </Text>
              </View>
              {/* Leaderboard + gym name */}
              <View className="flex-1 mr-2">
                <Text className="text-text-primary font-semibold text-sm" numberOfLines={1}>
                  {lb.leaderboard_name}
                </Text>
                <Text className="text-text-secondary text-xs mt-0.5" numberOfLines={1}>
                  {lb.gym_name}
                </Text>
              </View>
              {/* Score */}
              <Text className="text-text-primary font-bold text-sm mr-1">
                {lb.score.toLocaleString()} pts
              </Text>
              <ChevronRight size={16} color="#6B7280" />
            </Pressable>
          ))
        ) : (
          <View className="px-4 py-4 items-center">
            <Trophy size={32} color="#6B7280" />
            <Text className="text-text-secondary text-sm mt-2">
              {t("profile.noEnrolledLeaderboards")}
            </Text>
          </View>
        )}
      </View>

      {/* Active Challenges section — shown when there are active challenges. */}
      {activeChallenges && activeChallenges.length > 0 && (
        <View className="mt-4">
          <Text className="text-text-primary text-lg font-bold px-4 mb-2">
            {t("profile.activeChallenges")}
          </Text>
          {activeChallenges.map((challenge: any) => {
            const progress = challengeProgress?.find(
              (p: any) => p.challenge_id === challenge.id,
            );
            const criteria = challenge.criteria as { target: number };
            const status = deriveChallengeStatus(challenge, progress);
            const timeRemaining = computeTimeRemaining(challenge.end_date);

            return (
              <ChallengeCard
                key={challenge.id}
                name={challenge.name}
                description={challenge.description}
                progress={progress?.progress ?? 0}
                target={criteria.target}
                status={status}
                timeRemaining={timeRemaining}
                rewardBadge={challenge.reward_badge}
                testID={`challenge-card-${challenge.id}`}
              />
            );
          })}
        </View>
      )}

      {/* BadgePicker modal — opens when "Edit" is pressed on badges */}
      <BadgePicker
        earnedBadges={earnedBadges ?? []}
        pinnedIds={pinnedBadgeIds}
        maxPins={maxPins}
        onSave={handleSavePinnedBadges}
        onClose={() => setPickerVisible(false)}
        visible={pickerVisible}
      />

    </ScrollView>
    </SafeAreaView>
  );
}
