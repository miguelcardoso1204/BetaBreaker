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
// 3-option Pressable row. Home gym reuses the existing useSetHomeGym() hook
// in a modal (GymPicker). Saving calls useUpdateProfile, which refreshes
// useAuth's cached profile.
//
// BADGE PICKER:
// The BadgePicker modal opens when the user taps "Edit" on the pinned
// badges section. It shows all earned badges and lets the user toggle
// which ones to pin, respecting the tier limit (free: 1, pro: 3).

import React, { useState, useMemo } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  FlatList,
} from "react-native";
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
import { useGyms, useSetHomeGym } from "@/hooks/useGyms";
import {
  useProfileStats,
  useUpdateProfile,
  useExportData,
  useDeleteAccount,
} from "@/hooks/useProfile";
import { Avatar } from "@/components/ui/Avatar";
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

// The three grade systems users can choose from in the picker
const GRADE_SYSTEMS: { value: GradeSystem; label: string }[] = [
  { value: "v-scale", label: "V-Scale" },
  { value: "font", label: "Font" },
  { value: "yds", label: "YDS" },
];

export default function ProfileScreen() {
  const { user, isLoading: authLoading, signOut, refreshProfile } = useAuth();

  // Fetch gamification data — all hooks disabled when user is null
  const { data: earnedBadges } = useUserBadges(user?.id);
  const { data: streak } = useUserStreak(user?.id);
  const { data: pinnedData } = usePinnedBadges(user?.id);
  const setPinnedBadges = useSetPinnedBadges();

  // Fetch profile stats (total sends + max grade)
  const { data: statsData } = useProfileStats(user?.id);

  // Fetch active challenges for the user's home gym (if set)
  const { data: activeChallenges } = useActiveChallenges(user?.homeGymId ?? undefined);
  const { data: challengeProgress } = useChallengeProgress(
    user?.id,
    user?.homeGymId ?? undefined,
  );

  // Fetch gyms list for the gym picker modal
  const { data: gymsList } = useGyms();

  // Mutations for profile management
  const updateProfile = useUpdateProfile(refreshProfile);
  const setHomeGym = useSetHomeGym();
  const exportData = useExportData();
  const deleteAccount = useDeleteAccount(signOut);

  // ── Local state ────────────────────────────────────────────────────

  // Badge picker modal
  const [pickerVisible, setPickerVisible] = useState(false);

  // Edit mode state — tracks whether the user is editing their profile
  const [isEditing, setIsEditing] = useState(false);
  // Local form fields — initialized from user data when entering edit mode
  const [editName, setEditName] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editGradeSystem, setEditGradeSystem] = useState<GradeSystem>("v-scale");

  // Gym picker modal
  const [gymPickerVisible, setGymPickerVisible] = useState(false);

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

  // Find the home gym name for display
  const homeGymName = useMemo(() => {
    if (!user?.homeGymId || !gymsList) return null;
    const gym = gymsList.find((g: any) => g.id === user.homeGymId);
    return gym?.name ?? null;
  }, [user?.homeGymId, gymsList]);

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

  /** Select a gym from the picker and update the user's home gym. */
  async function handleSelectGym(gymId: string) {
    if (!user) return;
    await setHomeGym.mutateAsync({ userId: user.id, gymId });
    setGymPickerVisible(false);
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

  /** Export user data — confirm first, then trigger the mutation. */
  function handleExportData() {
    Alert.alert(
      "Export My Data",
      "This will generate a copy of all your data. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Export",
          onPress: async () => {
            await exportData.mutateAsync();
            Alert.alert("Export Complete", "Your data has been exported.");
          },
        },
      ]
    );
  }

  /** Delete account — double-confirm before triggering the mutation. */
  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all associated data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteAccount.mutateAsync();
          },
        },
      ]
    );
  }

  // ── Loading state ──────────────────────────────────────────────────
  if (authLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-text-secondary text-base">Loading...</Text>
      </View>
    );
  }

  // ── Unauthenticated state ──────────────────────────────────────────
  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-text-primary text-lg font-bold">
          Please sign in
        </Text>
        <Text className="text-text-secondary text-sm mt-2">
          Sign in to view your profile
        </Text>
      </View>
    );
  }

  // ── Authenticated profile ──────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background">
      {/* Header: Avatar + name + tier badge + edit button */}
      <View className="items-center pt-8 pb-4">
        {isEditing ? (
          // ── Edit mode header ──────────────────────────────────────
          <View className="w-full px-4">
            <Text className="text-text-primary text-lg font-bold mb-4">
              Edit Profile
            </Text>

            {/* Display name input */}
            <Text className="text-text-secondary text-sm mb-1">Display Name</Text>
            <TextInput
              className="border border-border rounded-lg px-3 py-2 text-text-primary mb-3"
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter your name"
              testID="edit-name-input"
            />

            {/* Avatar URL input — real image picker comes in Phase 12 */}
            <Text className="text-text-secondary text-sm mb-1">Avatar URL</Text>
            <TextInput
              className="border border-border rounded-lg px-3 py-2 text-text-primary mb-3"
              value={editAvatarUrl}
              onChangeText={setEditAvatarUrl}
              placeholder="https://example.com/avatar.png"
              testID="edit-avatar-input"
            />

            {/* Grade system picker — 3-option pressable row */}
            <Text className="text-text-secondary text-sm mb-1">Grade System</Text>
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
                    {gs.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Home gym picker trigger */}
            <Text className="text-text-secondary text-sm mb-1">Home Gym</Text>
            <Pressable
              onPress={() => setGymPickerVisible(true)}
              testID="edit-gym-picker"
              className="border border-border rounded-lg px-3 py-2 mb-4"
            >
              <Text className="text-text-primary">
                {homeGymName ?? "Select a gym"}
              </Text>
            </Pressable>

            {/* Save / Cancel buttons */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleCancelEditing}
                testID="edit-cancel-button"
                className="flex-1 py-3 items-center rounded-lg bg-surface"
              >
                <Text className="text-text-primary font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveProfile}
                testID="edit-save-button"
                className="flex-1 py-3 items-center rounded-lg bg-accent"
              >
                <Text className="text-white font-semibold">Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          // ── View mode header ──────────────────────────────────────
          <>
            <Avatar
              uri={user.avatarUrl ?? undefined}
              name={user.displayName ?? "Climber"}
              size="lg"
              testID="profile-avatar"
            />
            <Text className="text-text-primary text-xl font-bold mt-3">
              {user.displayName ?? "Climber"}
            </Text>
            {/* Tier badge — shows the user's subscription level */}
            <View className="mt-1">
              <Badge
                label={user.tier === "pro" ? "Pro" : "Free"}
                variant={user.tier === "pro" ? "success" : "default"}
              />
            </View>
            {/* Edit Profile button */}
            <Pressable
              onPress={handleStartEditing}
              testID="edit-profile-button"
              className="mt-3 px-4 py-2 rounded-lg bg-surface"
            >
              <Text className="text-text-primary font-semibold">
                Edit Profile
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Stats section — total sends and max grade */}
      <View className="px-4 py-3">
        <Text className="text-text-primary text-lg font-bold mb-2">Stats</Text>
        <View className="flex-row gap-4">
          <View className="flex-1 bg-surface rounded-lg p-3 items-center">
            <Text className="text-text-primary text-xl font-bold">
              {Number(totalSends)}
            </Text>
            <Text className="text-text-secondary text-xs">Total Sends</Text>
          </View>
          <View className="flex-1 bg-surface rounded-lg p-3 items-center">
            <Text className="text-text-primary text-xl font-bold">
              {maxGradeDisplay ?? "—"}
            </Text>
            <Text className="text-text-secondary text-xs">Max Grade</Text>
          </View>
        </View>
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
          <Text className="text-text-secondary text-sm">No badges yet</Text>
          <Text className="text-text-secondary text-xs mt-1">
            Start climbing to earn achievements!
          </Text>
        </View>
      )}

      {/* Active Challenges section — only shown when user has a home gym
          and there are active challenges. */}
      {activeChallenges && activeChallenges.length > 0 && (
        <View className="mt-4">
          <Text className="text-text-primary text-lg font-bold px-4 mb-2">
            Active Challenges
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

      {/* Account actions — export and delete at the bottom of the profile */}
      <View className="px-4 py-6 mt-4">
        <Text className="text-text-primary text-lg font-bold mb-3">
          Account
        </Text>

        {/* Export data button */}
        <Pressable
          onPress={handleExportData}
          testID="export-data-button"
          className="bg-surface rounded-lg py-3 items-center mb-3"
        >
          <Text className="text-text-primary font-semibold">
            Export My Data
          </Text>
        </Pressable>

        {/* Delete account button — destructive styling */}
        <Pressable
          onPress={handleDeleteAccount}
          testID="delete-account-button"
          className="bg-red-100 rounded-lg py-3 items-center"
        >
          <Text className="text-red-600 font-semibold">
            Delete Account
          </Text>
        </Pressable>
      </View>

      {/* BadgePicker modal — opens when "Edit" is pressed on badges */}
      <BadgePicker
        earnedBadges={earnedBadges ?? []}
        pinnedIds={pinnedBadgeIds}
        maxPins={maxPins}
        onSave={handleSavePinnedBadges}
        onClose={() => setPickerVisible(false)}
        visible={pickerVisible}
      />

      {/* Gym picker modal — FlatList of all gyms for home gym selection */}
      <Modal
        visible={gymPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setGymPickerVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-2xl p-4 max-h-[70%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-text-primary text-lg font-bold">
                Select Home Gym
              </Text>
              <Pressable onPress={() => setGymPickerVisible(false)}>
                <Text className="text-text-secondary text-sm">Close</Text>
              </Pressable>
            </View>
            <FlatList
              data={gymsList ?? []}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: { item: any }) => (
                <Pressable
                  onPress={() => handleSelectGym(item.id)}
                  testID={`gym-picker-item-${item.id}`}
                  className="py-3 border-b border-border"
                >
                  <Text className="text-text-primary text-base">
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
