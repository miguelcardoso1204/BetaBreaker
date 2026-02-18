/**
 * Admin Maintenance Screen — Ticket Queue for Route Issues (Step 15.5)
 *
 * Gym admins use this screen to triage and resolve maintenance tickets.
 * Climbers report broken/spinning holds, and this queue shows all open
 * issues across the gym's routes.
 *
 * LAYOUT:
 *   1. Screen header: "Maintenance Tickets"
 *   2. Filter tabs: All / Open / In Progress / Resolved
 *   3. FlatList of tickets, each showing:
 *      - Route name + color dot
 *      - Reporter display_name
 *      - Description text
 *      - Status badge (color-coded)
 *      - Contextual action buttons (Start Work / Resolve)
 *      - Delete button (trash icon)
 *
 * DATA FLOW:
 *   useAuth() → homeGymId → useMaintenanceTickets(gymId) → FlatList
 *   Mutations: useUpdateTicketStatus, useDeleteTicket
 *
 * STATES:
 *   - Loading: centered ActivityIndicator
 *   - Error: error message
 *   - Empty: "No maintenance tickets" message
 *   - Data: filter tabs + ticket list
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import {
  useMaintenanceTickets,
  useUpdateTicketStatus,
  useDeleteTicket,
} from "@/hooks/useMaintenanceTickets";

// ── Status badge colors ──────────────────────────────────────────────
// Maps each ticket status to a Tailwind bg class for visual distinction.
// Open = red (needs attention), in_progress = amber (being worked on),
// resolved = green (done).
const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-500",
  in_progress: "bg-amber-500",
  resolved: "bg-green-500",
};

// ── Filter tab definitions ───────────────────────────────────────────
// Each tab has a key matching the ticket status (or "all" for no filter)
// and a human-readable label for the tab button text.
const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
] as const;

// Type for the active filter — either "all" or one of the ticket statuses
type FilterKey = (typeof FILTER_TABS)[number]["key"];

export default function MaintenanceScreen() {
  const { user } = useAuth();
  const gymId = user?.homeGymId ?? null;

  // ── Data hooks ────────────────────────────────────────────────────
  const { tickets, isLoading, error } = useMaintenanceTickets(gymId);
  const updateStatus = useUpdateTicketStatus();
  const deleteTicket = useDeleteTicket();

  // ── Filter state ──────────────────────────────────────────────────
  // Tracks which tab is active. "all" shows every ticket; the other
  // values filter by that specific status.
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  // Apply filter to the ticket list. useMemo avoids re-filtering on
  // every render — only recalculates when tickets or filter changes.
  const filteredTickets = useMemo(() => {
    if (activeFilter === "all") return tickets;
    return tickets.filter((t: any) => t.status === activeFilter);
  }, [tickets, activeFilter]);

  // ── Handlers ──────────────────────────────────────────────────────

  /** Move an open ticket to in_progress (admin starts working on it) */
  function handleStartWork(ticketId: string) {
    updateStatus.mutateAsync({ ticketId, status: "in_progress" });
  }

  /** Resolve an in_progress ticket, stamping who fixed it */
  function handleResolve(ticketId: string) {
    updateStatus.mutateAsync({
      ticketId,
      status: "resolved",
      resolvedBy: user?.id,
    });
  }

  /** Delete a ticket (cleanup/moderation) */
  function handleDelete(ticketId: string) {
    deleteTicket.mutateAsync({ ticketId });
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
          {error.message || "Failed to load tickets"}
        </Text>
      </View>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <Text className="text-xl font-bold text-text-primary px-4 pt-4 pb-2">
        Maintenance Tickets
      </Text>

      {/* ── Filter Tabs ────────────────────────────────────────── */}
      {/* Horizontal row of pressable tabs. The active tab gets an accent
          background; inactive tabs get a subtle surface background. */}
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
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Empty State ────────────────────────────────────────── */}
      {filteredTickets.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-text-secondary text-center">
            No maintenance tickets
          </Text>
        </View>
      ) : (
        /* ── Ticket List ───────────────────────────────────────── */
        <FlatList
          data={filteredTickets}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }: { item: any }) => (
            <View className="bg-surface rounded-lg p-3 mb-2">
              {/* Top row: route name with color dot + status badge */}
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center flex-1 mr-2">
                  {/* Color dot — a small circle matching the route's tape color */}
                  <View
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: item.route?.color ?? "#9CA3AF" }}
                  />
                  <Text className="text-text-primary font-medium" numberOfLines={1}>
                    {item.route?.name ?? "Unknown Route"}
                  </Text>
                </View>

                {/* Status badge — color-coded pill showing current status */}
                <View
                  className={`px-2 py-0.5 rounded-full ${
                    STATUS_COLORS[item.status] ?? "bg-gray-500"
                  }`}
                >
                  <Text className="text-white text-xs font-medium">
                    {item.status === "in_progress" ? "in progress" : item.status}
                  </Text>
                </View>
              </View>

              {/* Reporter name */}
              <Text className="text-text-secondary text-sm mb-1">
                {item.reporter?.display_name ?? "Unknown"}
              </Text>

              {/* Description */}
              <Text className="text-text-primary text-sm mb-2">
                {item.description}
              </Text>

              {/* Action buttons row */}
              <View className="flex-row items-center gap-2">
                {/* Open tickets get a "Start Work" button */}
                {item.status === "open" && (
                  <Pressable
                    onPress={() => handleStartWork(item.id)}
                    accessibilityRole="button"
                    className="bg-amber-500 px-3 py-1.5 rounded-lg"
                  >
                    <Text className="text-white text-xs font-medium">
                      Start Work
                    </Text>
                  </Pressable>
                )}

                {/* In-progress tickets get a "Resolve" button */}
                {item.status === "in_progress" && (
                  <Pressable
                    onPress={() => handleResolve(item.id)}
                    accessibilityRole="button"
                    className="bg-green-600 px-3 py-1.5 rounded-lg"
                  >
                    <Text className="text-white text-xs font-medium">
                      Resolve
                    </Text>
                  </Pressable>
                )}

                {/* Delete button — always visible for admin cleanup */}
                <Pressable
                  testID={`delete-ticket-${item.id}`}
                  onPress={() => handleDelete(item.id)}
                  accessibilityRole="button"
                  className="ml-auto"
                >
                  <Trash2 size={16} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
