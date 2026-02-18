/**
 * Gym Routes Screen — Browse and Filter Climbing Routes
 *
 * This is the main route browsing screen for a specific gym. It shows a
 * filterable, sortable list of RouteCard components with pull-to-refresh.
 *
 * DATA FLOW:
 * 1. `useLocalSearchParams()` extracts the gymId from the URL (/gym/[id]/routes)
 * 2. `useRouteFilterStore` reads persisted grade/sort filters for this gym
 * 3. `useRoutes({ gymId, ...filters })` fetches filtered routes via TanStack Query
 * 4. `FlatList` renders a `RouteCard` for each route
 * 5. Filter changes → store update → query key changes → automatic refetch
 *
 * STATES:
 * - Loading: centered ActivityIndicator while TanStack Query fetches
 * - Error: centered error message if the fetch fails
 * - Empty: friendly message when no routes match the current filters
 * - Data: scrollable FlatList of RouteCard components
 *
 * NOTE: `style_tags` are passed as `[]` to RouteCard because the routes query
 * doesn't yet join the style_tags junction table. This will be added when
 * the style tag filter is implemented in a later step.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useRoutes } from "@/hooks/useRoutes";
import { useRouteFilterStore } from "@/stores/routeFilterStore";
import { RouteCard } from "@/components/routes/RouteCard";
import { FilterBar } from "@/components/routes/FilterBar";
import type { RouteStatus } from "@/lib/constants";

export default function GymRoutesScreen() {
  // i18n hook — provides t() for translating hardcoded strings.
  const { t } = useTranslation();

  // Extract gymId from the URL path. Expo Router's file-based routing
  // makes /gym/[id]/routes map to this component with params.id = gymId.
  const { id: gymId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Read filter state from Zustand. We read the full store and call
  // getFilters inside the component so Zustand can track which state
  // this component depends on for selective re-renders.
  const getFilters = useRouteFilterStore((s) => s.getFilters);
  const setGradeMin = useRouteFilterStore((s) => s.setGradeMin);
  const setGradeMax = useRouteFilterStore((s) => s.setGradeMax);
  const setSortBy = useRouteFilterStore((s) => s.setSortBy);
  const filters = getFilters(gymId);

  // Fetch routes with current filters. TanStack Query caches the result
  // and automatically refetches when the query key (filters) changes.
  const { data: routes, isLoading, error, refetch } = useRoutes({
    gymId,
    gradeMin: filters.gradeMin,
    gradeMax: filters.gradeMax,
    sortBy: filters.sortBy,
  });

  // Navigate to route detail when a card is tapped.
  // useCallback prevents creating a new function reference each render,
  // which would cause unnecessary FlatList re-renders.
  const handleRoutePress = useCallback(
    (routeId: string) => {
      // Cast to `any` because Expo Router's typed routes don't know about
      // this dynamic path yet (route detail screen isn't created). Once
      // app/gym/[id]/route/[routeId].tsx exists, the type will resolve.
      router.push(`/gym/${gymId}/route/${routeId}` as any);
    },
    [router, gymId]
  );

  // FlatList renderItem — extracts each route from the data array and
  // renders a RouteCard. `style_tags: []` because the query doesn't
  // join tags yet. `userGradeSystem` is hardcoded to "v-scale" until
  // user preferences are implemented.
  const renderRoute = useCallback(
    ({ item }: { item: NonNullable<typeof routes>[number] }) => (
      <RouteCard
        route={{
          id: item.id,
          name: item.name,
          canonical_grade: item.canonical_grade,
          // Supabase infers `status` as `string` from the DB; we cast to
          // RouteStatus since the column has a CHECK constraint limiting values.
          status: item.status as RouteStatus,
          color: item.color,
          style_tags: [],
        }}
        userGradeSystem="v-scale"
        onPress={() => handleRoutePress(item.id)}
      />
    ),
    [handleRoutePress]
  );

  // Stable key extractor for FlatList — uses the route's unique ID.
  // This helps React identify which items changed, added, or removed,
  // enabling efficient list updates without re-rendering every card.
  const keyExtractor = useCallback(
    (item: NonNullable<typeof routes>[number]) => item.id,
    []
  );

  return (
    <View className="flex-1 bg-background" testID="gym-routes-screen">
      {/* Filter bar — always visible above the list */}
      <FilterBar
        gradeMin={filters.gradeMin}
        gradeMax={filters.gradeMax}
        sortBy={filters.sortBy}
        gradeSystem="v-scale"
        onGradeMinChange={(v) => setGradeMin(gymId, v)}
        onGradeMaxChange={(v) => setGradeMax(gymId, v)}
        onSortByChange={(v) => setSortBy(gymId, v)}
      />

      {/* Loading state — show a spinner while fetching */}
      {isLoading && (
        <View className="flex-1 items-center justify-center" testID="loading-indicator">
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      )}

      {/* Error state — show error message if fetch failed */}
      {error && !isLoading && (
        <View className="flex-1 items-center justify-center px-4" testID="error-state">
          <Text className="text-error text-center">
            {error.message || t("route.failedToLoad")}
          </Text>
        </View>
      )}

      {/* Empty state — no routes match the current filters */}
      {!isLoading && !error && routes?.length === 0 && (
        <View className="flex-1 items-center justify-center" testID="empty-state">
          <Text className="text-text-secondary text-center">{t("route.noRoutesFound")}</Text>
        </View>
      )}

      {/* Route list — the main content when data is available */}
      {!isLoading && !error && routes && routes.length > 0 && (
        <FlatList
          testID="route-list"
          data={routes}
          renderItem={renderRoute}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={refetch}
              tintColor="#6366f1"
            />
          }
        />
      )}
    </View>
  );
}
