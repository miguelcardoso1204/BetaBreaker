// app/(tabs)/profile.tsx
//
// Profile screen — the user's personal dashboard showing their avatar,
// display name, subscription tier, climbing streak, and pinned badges.
//
// DATA FLOW:
// This screen combines data from four hooks:
//   1. useAuth()          → user profile (name, avatar, tier, pinnedBadgeIds)
//   2. useUserBadges()    → all badges the user has earned
//   3. useUserStreak()    → current and longest weekly climbing streaks
//   4. usePinnedBadges()  → resolved pinned badge IDs from profile
//   5. useSetPinnedBadges() → mutation to update pinned selection
//
// The profile resolves pinned badge IDs against the earned badges list
// to get full badge objects (name, icon) for display. This avoids storing
// duplicate data — the profile only stores badge UUIDs.
//
// BADGE PICKER:
// The BadgePicker modal opens when the user taps "Edit" on the pinned
// badges section. It shows all earned badges and lets the user toggle
// which ones to pin, respecting the tier limit (free: 1, pro: 3).

import React, { useState, useMemo } from "react";
import { Text, View, ScrollView } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import {
  useUserBadges,
  useUserStreak,
  usePinnedBadges,
  useSetPinnedBadges,
} from "@/hooks/useBadges";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ProfileBadges } from "@/components/badges/ProfileBadges";
import { BadgePicker } from "@/components/badges/BadgePicker";
import { StreakCard, StreakStatusBanner } from "@/components/streaks";
import { deriveStreakStatus } from "@/utils/streakStatus";

export default function ProfileScreen() {
  const { user, isLoading: authLoading } = useAuth();

  // Fetch gamification data — all hooks disabled when user is null
  const { data: earnedBadges } = useUserBadges(user?.id);
  const { data: streak } = useUserStreak(user?.id);
  const { data: pinnedData } = usePinnedBadges(user?.id);
  const setPinnedBadges = useSetPinnedBadges();

  // Local state for the BadgePicker modal visibility
  const [pickerVisible, setPickerVisible] = useState(false);

  // Resolve pinned badge IDs to full badge objects by matching against
  // the user's earned badges. This gives us name + icon for each pinned
  // badge without storing duplicate data in the profile.
  const pinnedBadgeIds = pinnedData?.pinned_badge_ids ?? [];
  const resolvedPinnedBadges = useMemo(() => {
    if (!earnedBadges || !pinnedBadgeIds.length) return [];
    // Filter earned badges to only those whose badge_id is in the pinned list
    return earnedBadges.filter((ub: any) =>
      pinnedBadgeIds.includes(ub.badge_id)
    );
  }, [earnedBadges, pinnedBadgeIds]);

  // Derive real-time streak status from the DB's (possibly stale) values.
  // The DB only updates current_streak when a trigger fires (on ascent
  // insert/delete). If the user goes inactive, the value becomes stale.
  // deriveStreakStatus() compares last_active_date against "now" using
  // ISO week gaps to determine the actual status.
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

  // Handle saving the badge selection from the picker
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
      {/* Header: Avatar + name + tier badge */}
      <View className="items-center pt-8 pb-4">
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

      {/* BadgePicker modal — opens when "Edit" is pressed */}
      <BadgePicker
        earnedBadges={earnedBadges ?? []}
        pinnedIds={pinnedBadgeIds}
        maxPins={maxPins}
        onSave={handleSavePinnedBadges}
        onClose={() => setPickerVisible(false)}
        visible={pickerVisible}
      />
    </ScrollView>
  );
}
