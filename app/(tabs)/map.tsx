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

import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { View, TextInput, Text, ActivityIndicator, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { Search, Star, ChevronRight } from "lucide-react-native";

import { useGyms } from "@/hooks/useGyms";
import { useAuth } from "@/hooks/useAuth";
import { IconButton } from "@/components/ui/IconButton";

// ── Helpers ──────────────────────────────────────────────────────

/** Day names matching JS Date.getDay() index (0 = Sunday). */
const DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
] as const;

/**
 * Extract today's opening hours from a gym's operating_hours JSON.
 * Returns a formatted string like "06:00 – 22:00", or null if unavailable.
 */
function getTodayHours(operatingHours: unknown): string | null {
  if (!operatingHours || typeof operatingHours !== "object") return null;
  const today = DAY_NAMES[new Date().getDay()];
  const hours = (operatingHours as Record<string, { open?: string; close?: string }>)[today];
  if (!hours?.open || !hours?.close) return null;
  return `${hours.open} – ${hours.close}`;
}

// ── Constants ─────────────────────────────────────────────────────

/**
 * Fallback map region centered on Portugal.
 * Used when no gyms have coordinates (e.g., new deployment with no data).
 * The delta of 5° shows the whole country so the user isn't staring at
 * a random ocean tile.
 */
const DEFAULT_CENTER = {
  latitude: 39.5,
  longitude: -8.0,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

// ── Component ─────────────────────────────────────────────────────

export default function MapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: gyms, isLoading } = useGyms();
  const { user } = useAuth();

  // Local state for the search query and favorites toggle.
  // These are ephemeral — they reset when leaving the tab.
  // Safe area insets for positioning the search overlay below the Dynamic Island /
  // notch. The map itself is edge-to-edge (no SafeAreaView wrapper) so it fills
  // the full screen, but the overlay needs to be pushed down.
  const insets = useSafeAreaInsets();

  const [searchQuery, setSearchQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // User's GPS location — requested once on mount. If granted, the map
  // centers here instead of on the gym average. If denied or errored,
  // stays null and we fall back to the gym-based center.
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationResolved, setLocationResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && !cancelled) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) {
            setUserLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          }
        }
      } catch {
        // Location unavailable — fall back to gym-based center
      } finally {
        if (!cancelled) setLocationResolved(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Track the map's visible region so the bottom gym list only shows gyms
  // currently on screen. Updated every time the user finishes panning/zooming.
  const [visibleRegion, setVisibleRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);

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

  // ── Visible gyms (within current map viewport) ──────────────
  // Derived from filteredGyms + the current visible region. When the user
  // pans or zooms, onRegionChangeComplete updates visibleRegion, which
  // triggers a recompute of this list. The bottom sheet shows only these.
  const visibleGyms = useMemo(() => {
    if (!visibleRegion) return filteredGyms;

    const latMin = visibleRegion.latitude - visibleRegion.latitudeDelta / 2;
    const latMax = visibleRegion.latitude + visibleRegion.latitudeDelta / 2;
    const lngMin = visibleRegion.longitude - visibleRegion.longitudeDelta / 2;
    const lngMax = visibleRegion.longitude + visibleRegion.longitudeDelta / 2;

    return filteredGyms.filter((gym) => {
      const lat = gym.latitude!;
      const lng = gym.longitude!;
      return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
    });
  }, [filteredGyms, visibleRegion]);

  // ── Initial map region ────────────────────────────────────────
  // Priority: user's GPS location → average of gym positions → Portugal fallback.
  // Using `initialRegion` means this only sets the starting view — the user
  // can freely pan/zoom afterwards.
  const initialRegion = useMemo(() => {
    // If we got the user's GPS, center on them with a tighter zoom so
    // nearby gyms are immediately visible.
    if (userLocation) {
      return {
        ...userLocation,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };
    }

    if (!gyms) return DEFAULT_CENTER;

    const withCoords = gyms.filter(
      (g) => g.latitude != null && g.longitude != null
    );

    if (withCoords.length === 0) return DEFAULT_CENTER;

    const avgLat =
      withCoords.reduce((sum, g) => sum + g.latitude!, 0) / withCoords.length;
    const avgLng =
      withCoords.reduce((sum, g) => sum + g.longitude!, 0) / withCoords.length;

    return {
      latitude: avgLat,
      longitude: avgLng,
      latitudeDelta: 2,
      longitudeDelta: 2,
    };
  }, [gyms, userLocation]);

  // ── Loading state ─────────────────────────────────────────────
  // Wait for both gym data AND location resolution before rendering the map.
  // This ensures initialRegion is computed with the user's GPS (if available)
  // before MapView mounts — since initialRegion only applies on first render.
  if (isLoading || !locationResolved) {
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
  // Vertical flex layout: map on top, gym list below. The map gets flex-1
  // so it fills all remaining space; the list has a max height so it never
  // pushes the map off screen. This way the list grows downward from the
  // map's bottom edge instead of overlaying it.
  return (
    <View style={{ flex: 1 }}>
      {/* Map container — flex-1 fills all space not taken by the gym list. */}
      <View style={{ flex: 1 }}>
        <MapView
          style={{ flex: 1 }}
          initialRegion={initialRegion}
          onRegionChangeComplete={setVisibleRegion}
          testID="map-view"
        >
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

        {/* Search overlay — floats above the map via absolute positioning */}
        <View
          className="absolute left-4 right-4 z-10 flex-row items-center gap-2"
          style={{ top: insets.top + 8 }}
        >
          <View className="flex-1 flex-row items-center bg-surface border border-border rounded-lg px-3 py-2">
            <Search size={18} color="#9CA3AF" />
            <TextInput
              className="flex-1 ml-2 text-text-primary"
              placeholder={t("map.searchPlaceholder")}
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <IconButton
            testID="favorites-filter"
            icon={Star}
            label={t("map.filterFavorites")}
            onPress={() => setShowFavoritesOnly((prev) => !prev)}
            color={showFavoritesOnly ? "#F59E0B" : "#9CA3AF"}
          />
        </View>
      </View>

      {/* ── Gym list — sits below the map, grows downward ────────── */}
      {visibleGyms.length > 0 && (
        <View
          testID="bottom-sheet"
          className="bg-surface border-t border-border"
          style={{ maxHeight: 200 }}
        >
          <FlatList
            data={visibleGyms}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const todayHours = getTodayHours(item.operating_hours);
              return (
                <Pressable
                  testID={`gym-list-item-${item.id}`}
                  onPress={() => router.push(`/gym/${item.id}` as any)}
                  className="flex-row items-center px-4 py-3 border-b border-border"
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-text-primary font-medium" numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.address && (
                      <Text className="text-text-secondary text-xs mt-0.5" numberOfLines={1}>
                        {item.address}
                      </Text>
                    )}
                    <Text className="text-text-secondary text-xs mt-0.5">
                      {todayHours ?? t("map.hoursNotAvailable")}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#6B7280" />
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </View>
  );
}
