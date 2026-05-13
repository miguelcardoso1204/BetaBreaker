/**
 * Climber Search Screen — /search
 *
 * Reached from the search icon in the Profile tab header. Lets the
 * current user find other climbers by display name, follow them
 * inline, and tap through to a climber's profile.
 *
 * STATE STRATEGY:
 *   - `input` is updated synchronously on every keystroke so the
 *     TextInput stays responsive.
 *   - `query` is the debounced version (300 ms) that drives
 *     useSearchClimbers. This avoids hitting the network on every
 *     keystroke.
 *   - The hook itself is disabled when the trimmed query is empty,
 *     so the empty-input state shows a hint instead of an empty
 *     result list.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Search as SearchIcon } from "lucide-react-native";
import { Avatar } from "@/components/ui/Avatar";
import { AppTextInput } from "@/components/ui/TextInput";
import { IconButton } from "@/components/ui/IconButton";
import { FollowButton } from "@/components/social/FollowButton";
import { useSearchClimbers } from "@/hooks/useSocial";

// Shape of each row from socialService.searchClimbers.
type ClimberRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

// Time to wait after the user stops typing before firing the query.
// 300 ms is a typical "feels instant" debounce window — short enough
// that results show up by the time the user looks at the screen,
// long enough to skip a request per keystroke.
const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  // Live input value (re-renders the TextInput each keystroke).
  const [input, setInput] = useState("");
  // Debounced value passed to the search hook.
  const [query, setQuery] = useState("");

  // Use a ref for the timeout so we can clear and reset it across
  // renders without it landing in the dependency array.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(input);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  const { results, isLoading } = useSearchClimbers(query);

  // Decide which content area to render: hint, spinner, no-match,
  // or the actual list. Each branch is a sibling so the header stays
  // identical in every state.
  const trimmedQuery = query.trim();
  const trimmedInput = input.trim();
  const hasQuery = trimmedQuery.length > 0;
  // Show the hint while the user hasn't typed anything OR while
  // the debounced query is still catching up to a freshly-cleared
  // input. Avoids briefly flashing "no results" between states.
  const showHint = !hasQuery && trimmedInput.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header: back button + search input. The input is auto-styled
          via AppTextInput and shows a magnifying-glass icon on the left. */}
      <View className="px-4 pt-2 pb-2 flex-row items-center">
        <IconButton
          icon={ArrowLeft}
          label={t("common.goBack")}
          onPress={() => router.back()}
          size={24}
          color="#FFFFFF"
        />
        <View className="flex-1 ml-3">
          <AppTextInput
            label={t("search.placeholder")}
            value={input}
            onChangeText={setInput}
            leftIcon={SearchIcon}
            autoCapitalize="none"
            testID="search-input"
          />
        </View>
      </View>

      {showHint ? (
        <View className="flex-1 items-center justify-start pt-12 px-8">
          <Text className="text-text-secondary text-center">
            {t("search.hint")}
          </Text>
        </View>
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <FlatList
          data={results as ClimberRow[]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          // Dismiss the keyboard when scrolling so users can read
          // results without the keyboard covering half the screen.
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const displayName =
              item.display_name ?? t("common.unknownUser");
            return (
              <View
                testID={`search-row-${item.id}`}
                className="flex-row items-center py-3"
              >
                {/* Pressable wraps avatar + name only — the FollowButton
                    sits outside so its taps don't navigate to the profile. */}
                <Pressable
                  onPress={() => router.push(`/profile/${item.id}` as any)}
                  className="flex-row items-center flex-1"
                  accessibilityRole="button"
                  accessibilityLabel={displayName}
                >
                  <Avatar
                    uri={item.avatar_url ?? undefined}
                    name={displayName}
                    size="md"
                  />
                  <Text className="text-text-primary text-base flex-1 ml-3">
                    {displayName}
                  </Text>
                </Pressable>
                <FollowButton targetUserId={item.id} />
              </View>
            );
          }}
          ListEmptyComponent={
            hasQuery ? (
              <Text className="text-text-secondary text-center mt-8">
                {t("search.noResults", { query: trimmedQuery })}
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
