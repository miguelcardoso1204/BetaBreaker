/**
 * Map Browse Screen — Full-Screen Interactive Gym Map
 *
 * This tab screen shows an interactive map with markers for each gym that
 * has valid coordinates. Users can:
 *   - Pan and zoom the map to explore gym locations
 *   - Tap a marker to navigate to the Gym Main Page (/gym/[id])
 *   - Search gyms by name using the overlay search bar
 *   - Toggle a favorites filter to show only their home gym
 *   - See a count of visible gyms in a bottom sheet
 *
 * WHY react-native-maps?
 * It's the standard mapping library for React Native, supported by Expo's
 * managed workflow. It renders Apple Maps on iOS and Google Maps on Android,
 * giving a native feel on both platforms. We use `initialRegion` (not
 * `region`) so the user can freely pan/zoom after the initial render.
 *
 * WHY NOT Zustand for search/filter state?
 * Search query and favorites toggle are ephemeral UI state — they reset
 * when the user navigates away. useState is simpler and more appropriate
 * than Zustand, which is for state that persists across screens.
 *
 * Data flow:
 *   useGyms() → filter(hasCoords) → filter(searchQuery) → filter(favorites)
 *   → MapView Markers + bottom sheet count
 */

import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, TextInput, Text, ActivityIndicator } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useRouter } from "expo-router";
import { Search, Star } from "lucide-react-native";

import { useGyms } from "@/hooks/useGyms";
import { useAuth } from "@/hooks/useAuth";
import { IconButton } from "@/components/ui/IconButton";

// ── Constants ─────────────────────────────────────────────────────

/**
 * Fallback map region centered on the continental US.
 * Used when no gyms have coordinates (e.g., new deployment with no data).
 * The wide delta (30° lat, 60° lng) shows the full country so the user
 * isn't staring at a random ocean tile.
 */
const US_CENTER = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 30,
  longitudeDelta: 60,
};

// ── Component ─────────────────────────────────────────────────────

export default function MapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: gyms, isLoading } = useGyms();
  const { user } = useAuth();

  // Local state for the search query and favorites toggle.
  // These are ephemeral — they reset when leaving the tab.
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // ── Filtering pipeline ────────────────────────────────────────
  // useMemo prevents re-filtering on every render. The pipeline:
  // 1. Keep only gyms with valid lat/lng (can't place markers without them)
  // 2. Filter by search query (case-insensitive name match)
  // 3. If favorites toggle is on AND user has a home gym, show only that gym
  const filteredGyms = useMemo(() => {
    if (!gyms) return [];

    return gyms.filter((gym) => {
      // Step 1: Must have coordinates to appear on the map
      if (gym.latitude == null || gym.longitude == null) return false;

      // Step 2: Filter by search query (case-insensitive substring match)
      if (
        searchQuery &&
        !gym.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      // Step 3: If favorites filter is active, only show the user's home gym
      if (showFavoritesOnly && user?.homeGymId) {
        return gym.id === user.homeGymId;
      }

      return true;
    });
  }, [gyms, searchQuery, showFavoritesOnly, user?.homeGymId]);

  // ── Initial map region ────────────────────────────────────────
  // Compute center from all gyms with coordinates. Using `initialRegion`
  // means this only sets the starting view — the user can pan/zoom freely.
  const initialRegion = useMemo(() => {
    if (!gyms) return US_CENTER;

    // Get gyms that have valid coordinates for centering
    const withCoords = gyms.filter(
      (g) => g.latitude != null && g.longitude != null
    );

    if (withCoords.length === 0) return US_CENTER;

    // Average all gym positions to find the center point
    const avgLat =
      withCoords.reduce((sum, g) => sum + g.latitude!, 0) / withCoords.length;
    const avgLng =
      withCoords.reduce((sum, g) => sum + g.longitude!, 0) / withCoords.length;

    return {
      latitude: avgLat,
      longitude: avgLng,
      // Delta of 2° gives a city-level zoom — close enough to see markers
      // without being zoomed in so far that only one gym is visible.
      latitudeDelta: 2,
      longitudeDelta: 2,
    };
  }, [gyms]);

  // ── Loading state ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator
          testID="loading-indicator"
          size="large"
          color="#8B5CF6"
        />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* Full-screen map — uses `style` instead of `className` because
        * react-native-maps doesn't support NativeWind className prop.
        * initialRegion sets the starting view; user can pan/zoom freely. */}
      <MapView
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        testID="map-view"
      >
        {/* One marker per gym with valid coordinates.
          * `identifier` is used by react-native-maps for native marker ID
          * and by our tests (testID="marker-{identifier}") for querying.
          * `coordinate` positions the pin on the map. */}
        {filteredGyms.map((gym) => (
          <Marker
            key={gym.id}
            identifier={gym.id}
            coordinate={{
              latitude: gym.latitude!,
              longitude: gym.longitude!,
            }}
            title={gym.name}
            onPress={() => router.push(`/gym/${gym.id}` as any)}
          />
        ))}
      </MapView>

      {/* ── Search overlay ──────────────────────────────────────── */}
      {/* Positioned at the top of the screen, above the map.
        * Uses absolute positioning + z-index so it floats over the map
        * without affecting MapView's layout. */}
      <View
        className="absolute top-12 left-4 right-4 z-10 flex-row items-center gap-2"
      >
        {/* Search input container — white background with border and rounded
          * corners. flex-row puts the search icon inline with the TextInput. */}
        <View className="flex-1 flex-row items-center bg-surface border border-border rounded-lg px-3 py-2">
          <Search size={18} color="#9CA3AF" />
          {/* Plain RN TextInput (not AppTextInput) because the map overlay
            * doesn't need a visible label — the placeholder text serves as
            * the visual affordance and the search icon provides context. */}
          <TextInput
            className="flex-1 ml-2 text-text-primary"
            placeholder={t("map.searchPlaceholder")}
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Favorites filter toggle — star icon that filters to home gym.
          * Gold (#F59E0B) when active, gray when inactive. */}
        <IconButton
          testID="favorites-filter"
          icon={Star}
          label={t("map.filterFavorites")}
          onPress={() => setShowFavoritesOnly((prev) => !prev)}
          color={showFavoritesOnly ? "#F59E0B" : "#9CA3AF"}
        />
      </View>

      {/* ── Bottom sheet (simplified) ───────────────────────────── */}
      {/* A simple pill at the bottom showing how many gyms are visible.
        * Positioned above the tab bar (bottom-24) so it doesn't overlap.
        * This is a simplified "bottom sheet" — no drag handle or expansion
        * needed for MVP. */}
      <View
        testID="bottom-sheet"
        className="absolute bottom-24 left-4 right-4 z-10 bg-surface rounded-xl px-4 py-3 items-center border border-border"
      >
        <Text className="text-text-primary font-semibold">
          {/* i18next handles pluralization via _one/_other suffixes in the
            * translation file, so we just pass the count and let it pick. */}
          {t("map.gymCount", { count: filteredGyms.length })}
        </Text>
      </View>
    </View>
  );
}
