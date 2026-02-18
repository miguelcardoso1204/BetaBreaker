/**
 * Admin Audit Log Screen — Read-only Change History (Step 15.7)
 *
 * Gym admins use this screen to review what changed, when, and by whom.
 * Entries are created automatically by the on_route_update() trigger
 * whenever a route's grade, status, color, or wall_section changes.
 *
 * LAYOUT:
 *   1. Screen header: "Audit Log"
 *   2. Filter tabs: All / Grade / Status / Tag
 *   3. FlatList of audit entries, each showing:
 *      - Action badge (color-coded by type)
 *      - Actor display_name (or "System" if null)
 *      - Target info (target_type + truncated target_id)
 *      - Old → New value display (extracted from JSONB)
 *      - Timestamp
 *
 * DATA FLOW:
 *   useAuth() → homeGymId → useAuditLog(gymId) → FlatList
 *   No mutations — audit log is read-only from the client.
 *
 * STATES:
 *   - Loading: centered ActivityIndicator
 *   - Error: error message
 *   - Empty: "No audit log entries" message
 *   - Data: filter tabs + entry list
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';

// ── Action badge colors ──────────────────────────────────────────────
// Each action type gets a distinct color for quick visual scanning.
// grade = blue (informational), status = amber (workflow change),
// tag = purple (metadata), media_removed = red (destructive).
const ACTION_COLORS: Record<string, string> = {
  grade_change: 'bg-blue-500',
  status_change: 'bg-amber-500',
  tag_change: 'bg-purple-500',
  media_removed: 'bg-red-500',
};

// ── Human-readable action labels ─────────────────────────────────────
// Converts DB action names like 'grade_change' to "Grade" for display
// in the action badge pill.
const ACTION_LABELS: Record<string, string> = {
  grade_change: 'Grade',
  status_change: 'Status',
  tag_change: 'Tag',
  media_removed: 'Media',
};

// ── Filter tab definitions ───────────────────────────────────────────
// "all" shows everything; other keys match the action column prefix.
const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'grade_change', label: 'Grade' },
  { key: 'status_change', label: 'Status' },
  { key: 'tag_change', label: 'Tag' },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]['key'];

// ── Value display helpers ────────────────────────────────────────────
// Extract meaningful values from the JSONB old_value/new_value columns
// and format them as human-readable strings.

/**
 * Format the old → new change for display in the entry card.
 *
 * Each action type stores different keys in the JSONB:
 *   - grade_change: { canonical_grade: number }
 *   - status_change: { status: string }
 *   - tag_change: { color: string } or { wall_section: string }
 *   - media_removed: no old/new values needed
 */
function formatChange(
  action: string,
  oldValue: Record<string, any> | null,
  newValue: Record<string, any> | null
): string {
  switch (action) {
    case 'grade_change':
      return `Grade: ${oldValue?.canonical_grade ?? '?'} → ${newValue?.canonical_grade ?? '?'}`;

    case 'status_change':
      return `Status: ${oldValue?.status ?? '?'} → ${newValue?.status ?? '?'}`;

    case 'tag_change': {
      // Could be a color change or wall_section change — show whichever
      // key is present in the JSONB values.
      if (oldValue?.color !== undefined || newValue?.color !== undefined) {
        return `Color: ${oldValue?.color ?? '?'} → ${newValue?.color ?? '?'}`;
      }
      return `Section: ${oldValue?.wall_section ?? '?'} → ${newValue?.wall_section ?? '?'}`;
    }

    case 'media_removed':
      return 'Media removed';

    default:
      return action;
  }
}

/**
 * Format a timestamp string into a readable date + time.
 * Uses locale-sensitive formatting (date + time, no seconds).
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AuditLogScreen() {
  const { user } = useAuth();
  const gymId = user?.homeGymId ?? null;

  // ── Data hook ──────────────────────────────────────────────────────
  const { entries, isLoading, error } = useAuditLog(gymId);

  // ── Filter state ───────────────────────────────────────────────────
  // Tracks which action type tab is active. "all" shows everything.
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  // Apply filter — only recalculates when entries or filter changes
  const filteredEntries = useMemo(() => {
    if (activeFilter === 'all') return entries;
    return entries.filter((e: any) => e.action === activeFilter);
  }, [entries, activeFilter]);

  // ── Loading state ──────────────────────────────────────────────────
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

  // ── Error state ────────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || 'Failed to load audit log'}
        </Text>
      </View>
    );
  }

  // ── Main screen ────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <Text className="text-xl font-bold text-text-primary px-4 pt-4 pb-2">
        Audit Log
      </Text>

      {/* ── Filter Tabs ────────────────────────────────────────── */}
      {/* Horizontal row of pressable tabs. Active tab gets accent
          background; inactive tabs get a subtle surface border. */}
      <View className="flex-row px-4 mb-3 gap-2">
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveFilter(tab.key)}
            accessibilityRole="button"
            className={`px-3 py-1.5 rounded-full ${
              activeFilter === tab.key
                ? 'bg-accent'
                : 'bg-surface border border-text-secondary'
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                activeFilter === tab.key ? 'text-white' : 'text-text-primary'
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Empty State ──────────────────────────────────────── */}
      {filteredEntries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-text-secondary text-center">
            No audit log entries
          </Text>
        </View>
      ) : (
        /* ── Entry List ─────────────────────────────────────── */
        <FlatList
          data={filteredEntries}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }: { item: any }) => (
            <View className="bg-surface rounded-lg p-3 mb-2">
              {/* Top row: action badge + actor name */}
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center gap-2">
                  {/* Action badge — color-coded pill showing what changed */}
                  <View
                    className={`px-2 py-0.5 rounded-full ${
                      ACTION_COLORS[item.action] ?? 'bg-gray-500'
                    }`}
                  >
                    <Text className="text-white text-xs font-medium">
                      {ACTION_LABELS[item.action] ?? item.action}
                    </Text>
                  </View>

                  {/* Actor name — "System" fallback for null actor_id */}
                  <Text className="text-text-primary text-sm font-medium">
                    {item.actor?.display_name ?? 'System'}
                  </Text>
                </View>
              </View>

              {/* Target info — what entity was changed (type + truncated id) */}
              <Text className="text-text-secondary text-xs mb-1">
                {item.target_type}:{item.target_id?.slice(0, 8)}
              </Text>

              {/* Old → New value display — extracted from JSONB */}
              <Text className="text-text-primary text-sm mb-1">
                {formatChange(item.action, item.old_value, item.new_value)}
              </Text>

              {/* Timestamp — when the change occurred */}
              <Text className="text-text-secondary text-xs">
                {formatTimestamp(item.created_at)}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
