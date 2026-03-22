/**
 * Edit Route Screen — Detail View + CRUD for a Single Route
 *
 * This is the main admin route management screen. It shows:
 *   1. ROUTE INFO: Editable fields (name, color, wall section, setter)
 *   2. STATUS TRANSITIONS: Contextual buttons based on current status
 *   3. QR GENERATION: Generate a signed QR token for the route
 *   4. DELETE: Destructive action at the bottom
 *
 * STATUS TRANSITIONS:
 *   Active → "Retire Route" → sets retiring_soon
 *   Retiring Soon → "Archive Route" → sets archived + retired_at = now()
 *   Archived → "Reactivate" → sets active + retired_at = null
 *
 * DATA FLOW:
 *   - useLocalSearchParams() → routeId from the URL
 *   - useRouteDetail(routeId) → fetches route with setter profile
 *   - useGymSetters(adminGymId) → setter list for reassignment
 *   - Mutations: useUpdateRoute, useDeleteRoute, useGenerateQr
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
import { useAuth } from "@/hooks/useAuth";
import { useRouteDetail } from "@/hooks/useRoutes";
import {
  useUpdateRoute,
  useDeleteRoute,
  useGenerateQr,
  useGymSetters,
} from "@/hooks/useAdminRoutes";
import { useCreateTicket } from "@/hooks/useMaintenanceTickets";
import { canonicalToDisplay } from "@/utils/grades";

export default function EditRouteScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, adminGymId } = useAuth();

  // ── Data fetching ────────────────────────────────────────────────
  const { data: route, isLoading, error } = useRouteDetail(routeId!);
  const { setters } = useGymSetters(adminGymId);

  // ── Mutations ────────────────────────────────────────────────────
  const updateRoute = useUpdateRoute();
  const deleteRoute = useDeleteRoute();
  const generateQr = useGenerateQr();
  const createTicket = useCreateTicket();

  // ── Local form state (synced from fetched route) ──────────────────
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [wallSection, setWallSection] = useState("");
  const [setterId, setSetterId] = useState<string | null>(null);

  // ── Report Issue form state ────────────────────────────────────────
  // Tracks whether the issue report form is open and the description text.
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");

  // Sync local state when route data arrives or changes.
  useEffect(() => {
    if (route) {
      setName(route.name ?? "");
      setColor(route.color ?? "");
      setWallSection(route.wall_section ?? "");
      setSetterId(route.setter_id ?? null);
    }
  }, [route]);

  // ── Loading state ────────────────────────────────────────────────
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

  // ── Error state ──────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || "Failed to load route"}
        </Text>
      </View>
    );
  }

  // ── No route found ───────────────────────────────────────────────
  if (!route) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-text-secondary">Route not found</Text>
      </View>
    );
  }

  // ── Handlers ─────────────────────────────────────────────────────

  function handleSave() {
    updateRoute.mutate(
      {
        routeId: route!.id,
        data: {
          name: name.trim() || undefined,
          color: color.trim() || undefined,
          wall_section: wallSection.trim() || undefined,
          setter_id: setterId,
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
    deleteRoute.mutate(
      { routeId: route!.id },
      {
        onSuccess: () => router.back(),
      }
    );
  }

  /**
   * Handle status transitions. The allowed transitions are:
   *   active → retiring_soon (route is being phased out)
   *   retiring_soon → archived (route is off the wall, set retired_at)
   *   archived → active (reactivate, clear retired_at)
   */
  function handleStatusTransition(newStatus: string) {
    const data: any = { status: newStatus };
    if (newStatus === "archived") {
      // Set retired_at to current time when archiving
      data.retired_at = new Date().toISOString();
    } else if (newStatus === "active") {
      // Clear retired_at when reactivating
      data.retired_at = null;
    }
    updateRoute.mutate({ routeId: route!.id, data });
  }

  function handleGenerateQr() {
    generateQr.mutate({ routeId: route!.id });
  }

  /** Submit a maintenance ticket for this route */
  async function handleSubmitIssue() {
    if (!issueDescription.trim() || !user?.id) return;

    await createTicket.mutateAsync({
      route_id: route!.id,
      reporter_id: user.id,
      description: issueDescription.trim(),
    });

    // Reset form after successful submission
    setIssueDescription("");
    setShowIssueForm(false);
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background px-4 pt-4">
      <Text className="text-xl font-bold text-text-primary mb-4">
        Edit Route
      </Text>

      {/* Route grade (read-only display) */}
      <Text className="text-text-secondary text-sm mb-1">Grade</Text>
      <View className="bg-surface rounded-lg px-3 py-3 mb-4">
        <Text className="text-text-primary text-base">
          {canonicalToDisplay(route.canonical_grade, "v-scale")}
        </Text>
      </View>

      {/* Status badge + transition button */}
      <Text className="text-text-secondary text-sm mb-1">Status</Text>
      <View className="flex-row items-center gap-3 mb-4">
        <View className="bg-surface rounded-lg px-3 py-3">
          <Text className="text-text-primary text-base">{route.status}</Text>
        </View>

        {/* Contextual transition button based on current status */}
        {route.status === "active" && (
          <Pressable
            onPress={() => handleStatusTransition("retiring_soon")}
            accessibilityRole="button"
            className="bg-yellow-500 px-4 py-3 rounded-lg"
          >
            <Text className="text-white font-medium">Retire Route</Text>
          </Pressable>
        )}
        {route.status === "retiring_soon" && (
          <Pressable
            onPress={() => handleStatusTransition("archived")}
            accessibilityRole="button"
            className="bg-gray-500 px-4 py-3 rounded-lg"
          >
            <Text className="text-white font-medium">Archive Route</Text>
          </Pressable>
        )}
        {route.status === "archived" && (
          <Pressable
            onPress={() => handleStatusTransition("active")}
            accessibilityRole="button"
            className="bg-green-500 px-4 py-3 rounded-lg"
          >
            <Text className="text-white font-medium">Reactivate</Text>
          </Pressable>
        )}
      </View>

      {/* Route name */}
      <Text className="text-text-secondary text-sm mb-1">Name</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        value={name}
        onChangeText={setName}
      />

      {/* Color */}
      <Text className="text-text-secondary text-sm mb-1">Color</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        value={color}
        onChangeText={setColor}
      />

      {/* Wall section */}
      <Text className="text-text-secondary text-sm mb-1">Wall Section</Text>
      <TextInput
        className="bg-surface text-text-primary rounded-lg px-3 py-3 mb-4 text-base"
        value={wallSection}
        onChangeText={setWallSection}
      />

      {/* Setter assignment */}
      <Text className="text-text-secondary text-sm mb-2">Setter</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        <Pressable
          onPress={() => setSetterId(null)}
          accessibilityRole="button"
          className={`px-3 py-2 rounded-lg ${
            setterId === null ? "bg-accent" : "bg-surface"
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              setterId === null ? "text-white" : "text-text-secondary"
            }`}
          >
            None
          </Text>
        </Pressable>
        {setters.map((setter: any) => (
          <Pressable
            key={setter.user_id}
            onPress={() => setSetterId(setter.user_id)}
            accessibilityRole="button"
            className={`px-3 py-2 rounded-lg ${
              setterId === setter.user_id ? "bg-accent" : "bg-surface"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                setterId === setter.user_id
                  ? "text-white"
                  : "text-text-secondary"
              }`}
            >
              {setter.profile?.display_name ?? "Unknown"}
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

      {/* Generate QR button */}
      <Pressable
        onPress={handleGenerateQr}
        accessibilityRole="button"
        className="bg-surface py-3 rounded-lg items-center mb-4"
      >
        <Text className="text-accent font-bold text-base">Generate QR</Text>
      </Pressable>

      {/* Show QR token if generated */}
      {generateQr.data?.token && (
        <View className="bg-surface rounded-lg p-3 mb-4">
          <Text className="text-text-secondary text-xs mb-1">QR Token</Text>
          <Text className="text-text-primary text-sm font-mono" selectable>
            {generateQr.data.token}
          </Text>
        </View>
      )}

      {/* ── Report Issue Section ──────────────────────────────────── */}
      {/* Lets admins/setters report maintenance issues (broken holds,
          spinning holds, safety concerns) directly from the route detail.
          Toggling the button reveals a description input + submit form. */}
      <Pressable
        onPress={() => setShowIssueForm((prev) => !prev)}
        accessibilityRole="button"
        className="bg-surface py-3 rounded-lg items-center mb-4"
      >
        <Text className="text-amber-500 font-bold text-base">Report Issue</Text>
      </Pressable>

      {showIssueForm && (
        <View className="bg-surface rounded-lg p-3 mb-4">
          <Text className="text-text-secondary text-sm mb-1">
            Describe the issue
          </Text>
          <TextInput
            testID="issue-description-input"
            value={issueDescription}
            onChangeText={setIssueDescription}
            placeholder="e.g. Hold spinning on crux move..."
            placeholderTextColor="#9CA3AF"
            multiline
            className="bg-background rounded-lg px-3 py-2 text-text-primary mb-3 min-h-[80px]"
          />
          <Pressable
            onPress={handleSubmitIssue}
            disabled={!issueDescription.trim() || createTicket.isPending}
            accessibilityRole="button"
            className="bg-amber-500 py-2 rounded-lg items-center"
          >
            <Text className="text-white font-medium">Submit Issue</Text>
          </Pressable>
        </View>
      )}

      {/* Delete route (destructive) */}
      <Pressable
        onPress={handleDelete}
        accessibilityRole="button"
        className="border border-error py-3 rounded-lg items-center mb-8"
      >
        <Text className="text-error font-bold text-base">Delete Route</Text>
      </Pressable>
    </ScrollView>
  );
}
