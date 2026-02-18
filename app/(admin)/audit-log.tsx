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
import { useTranslation } from 'react-i18next';
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

// ── Action label translation keys ────────────────────────────────────
// Converts DB action names like 'grade_change' to translation keys
// for display in the action badge pill. Resolved via t() at render time.
const ACTION_LABEL_KEYS: Record<string, string> = {
  grade_change: 'admin.auditLog.grade',
  status_change: 'admin.auditLog.status',
  tag_change: 'admin.auditLog.tag',
  media_removed: 'admin.auditLog.media',
};

// ── Filter tab definitions ───────────────────────────────────────────
// "all" shows everything; other keys match the action column prefix.
// Labels are translation keys — resolved at render time via t()
const FILTER_TABS = [
  { key: 'all', labelKey: 'common.all' },
  { key: 'grade_change', labelKey: 'admin.auditLog.grade' },
  { key: 'status_change', labelKey: 'admin.auditLog.status' },
  { key: 'tag_change', labelKey: 'admin.auditLog.tag' },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]['key'];

// ── Value display helpers ────────────────────────────────────────────
// Extract meaningful values from the JSONB old_value/new_value columns
// and format them as human-readable strings.

/**
 * Format the old → new change for display in the entry card.
 * Accepts a translation function so strings are localized.
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
  newValue: Record<string, any> | null,
  t: (key: string) => string
): string {
  switch (action) {
    case 'grade_change':
      return `${t('admin.auditLog.gradeField')} ${oldValue?.canonical_grade ?? '?'} → ${newValue?.canonical_grade ?? '?'}`;

    case 'status_change':
      return `${t('admin.auditLog.statusField')} ${oldValue?.status ?? '?'} → ${newValue?.status ?? '?'}`;

    case 'tag_change': {
      // Could be a color change or wall_section change — show whichever
      // key is present in the JSONB values.
      if (oldValue?.color !== undefined || newValue?.color !== undefined) {
        return `${t('admin.auditLog.colorField')} ${oldValue?.color ?? '?'} → ${newValue?.color ?? '?'}`;
      }
      return `${t('admin.auditLog.sectionField')} ${oldValue?.wall_section ?? '?'} → ${newValue?.wall_section ?? '?'}`;
    }

    case 'media_removed':
      return t('admin.auditLog.mediaRemoved');

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
  const { t } = useTranslation();
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
          {error.message || t('admin.auditLog.failedToLoad')}
        </Text>
      </View>
    );
  }

  // ── Main screen ────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <Text className="text-xl font-bold text-text-primary px-4 pt-4 pb-2">
        {t('admin.auditLog.title')}
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
              {t(tab.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Empty State ──────────────────────────────────────── */}
      {filteredEntries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-text-secondary text-center">
            {t('admin.auditLog.noEntries')}
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
                      {t(ACTION_LABEL_KEYS[item.action] ?? item.action)}
                    </Text>
                  </View>

                  {/* Actor name — "System" fallback for null actor_id */}
                  <Text className="text-text-primary text-sm font-medium">
                    {item.actor?.display_name ?? t('admin.auditLog.system')}
                  </Text>
                </View>
              </View>

              {/* Target info — what entity was changed (type + truncated id) */}
              <Text className="text-text-secondary text-xs mb-1">
                {item.target_type}:{item.target_id?.slice(0, 8)}
              </Text>

              {/* Old → New value display — extracted from JSONB */}
              <Text className="text-text-primary text-sm mb-1">
                {formatChange(item.action, item.old_value, item.new_value, t)}
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
