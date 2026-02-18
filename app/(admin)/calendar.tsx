/**
 * Admin Calendar Screen — Setting Session Scheduling (Step 15.3)
 *
 * Gym admins use this screen to plan route-setting work:
 *   1. CalendarGrid — monthly view with dots on dates that have sessions
 *   2. Session list — sessions on the selected date (setter name, status, notes)
 *   3. Add session form — setter picker + notes input
 *   4. Workload summary — route count per setter this month
 *
 * DATA FLOW:
 *   1. useAuth() → homeGymId for the current admin
 *   2. useSettingSessions(gymId, start, end) → sessions for the month
 *   3. useSetterWorkload(gymId, start, end) → route counts per setter
 *   4. useGymSetters(gymId) → setter list for the assignment dropdown
 *   5. Mutations: create/update/delete sessions → invalidate queries
 *
 * STATES:
 *   - Loading: centered ActivityIndicator
 *   - Error: error message
 *   - Calendar: always shown (with session list below when date selected)
 *   - Workload: shown at bottom when data available
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { Plus, Trash2 } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import {
  useSettingSessions,
  useSetterWorkload,
  useCreateSettingSession,
  useUpdateSettingSession,
  useDeleteSettingSession,
} from "@/hooks/useSettingCalendar";
import { useGymSetters } from "@/hooks/useAdminRoutes";
import CalendarGrid from "@/components/admin/CalendarGrid";
import { SETTING_SESSION_STATUSES } from "@/lib/constants";

/** Maps session status to a background color for the status badge */
const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-500",
};

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const gymId = user?.homeGymId ?? null;

  // ── Month navigation state ──────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSessionSetterId, setNewSessionSetterId] = useState<string>("");
  const [newSessionNotes, setNewSessionNotes] = useState("");

  // Compute date range for the current month (ISO strings)
  const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  // ── Data hooks ──────────────────────────────────────────────────
  const {
    sessions,
    isLoading,
    error,
  } = useSettingSessions(gymId, monthStart, monthEnd);

  const { workload } = useSetterWorkload(gymId, monthStart, monthEnd);
  const { setters } = useGymSetters(gymId);

  const createMutation = useCreateSettingSession();
  const updateMutation = useUpdateSettingSession();
  const deleteMutation = useDeleteSettingSession();

  // Build a list of dates that have sessions (for CalendarGrid dots)
  const sessionDates = useMemo(
    () => [...new Set(sessions.map((s: any) => s.scheduled_date))],
    [sessions]
  );

  // Filter sessions to only show those on the selected date
  const selectedSessions = useMemo(
    () =>
      selectedDate
        ? sessions.filter((s: any) => s.scheduled_date === selectedDate)
        : [],
    [sessions, selectedDate]
  );

  // ── Handlers ────────────────────────────────────────────────────

  function handlePrevMonth() {
    setCurrentMonth((m) => subMonths(m, 1));
    setSelectedDate(null);
    setShowAddForm(false);
  }

  function handleNextMonth() {
    setCurrentMonth((m) => addMonths(m, 1));
    setSelectedDate(null);
    setShowAddForm(false);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setShowAddForm(false);
  }

  async function handleCreateSession() {
    if (!gymId || !selectedDate || !newSessionSetterId) return;

    await createMutation.mutateAsync({
      gymId,
      setterId: newSessionSetterId,
      scheduledDate: selectedDate,
      notes: newSessionNotes || undefined,
    });

    // Reset form
    setNewSessionSetterId("");
    setNewSessionNotes("");
    setShowAddForm(false);
  }

  async function handleUpdateStatus(sessionId: string, newStatus: string) {
    await updateMutation.mutateAsync({
      sessionId,
      data: { status: newStatus },
    });
  }

  async function handleDeleteSession(sessionId: string) {
    Alert.alert(t("admin.calendar.deleteSession"), t("admin.calendar.deleteSessionConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deleteMutation.mutateAsync({ sessionId }),
      },
    ]);
  }

  // ── Loading state ──────────────────────────────────────────────
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

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-error text-center">
          {error.message || t("admin.calendar.failedToLoad")}
        </Text>
      </View>
    );
  }

  // ── Main screen ────────────────────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-background">
      <Text className="text-xl font-bold text-text-primary px-4 pt-4 pb-2">
        {t("admin.calendar.title")}
      </Text>

      {/* ── Calendar Grid ──────────────────────────────────────── */}
      <CalendarGrid
        currentMonth={currentMonth}
        sessionDates={sessionDates}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />

      {/* ── Selected Date Section ──────────────────────────────── */}
      {selectedDate && (
        <View className="px-4 mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-lg font-semibold text-text-primary">
              {selectedDate}
            </Text>
            <Pressable
              testID="add-session-button"
              onPress={() => setShowAddForm(true)}
              accessibilityRole="button"
              className="bg-accent px-3 py-1.5 rounded-lg flex-row items-center"
            >
              <Plus size={16} color="white" />
              <Text className="text-white font-medium ml-1">{t("common.add")}</Text>
            </Pressable>
          </View>

          {/* ── Add Session Form ─────────────────────────────────── */}
          {showAddForm && (
            <View className="bg-surface rounded-lg p-3 mb-3">
              <Text className="text-text-primary font-medium mb-2">
                {t("admin.calendar.newSession")}
              </Text>

              {/* Setter picker — simple list of pressable items */}
              <Text className="text-text-secondary text-sm mb-1">{t("admin.calendar.setter")}</Text>
              <View className="flex-row flex-wrap gap-2 mb-2">
                {setters.map((setter: any) => (
                  <Pressable
                    key={setter.user_id}
                    testID={`setter-option-${setter.user_id}`}
                    onPress={() => setNewSessionSetterId(setter.user_id)}
                    className={`px-3 py-1.5 rounded-full border ${
                      newSessionSetterId === setter.user_id
                        ? "bg-accent border-accent"
                        : "border-text-secondary"
                    }`}
                  >
                    <Text
                      className={
                        newSessionSetterId === setter.user_id
                          ? "text-white font-medium"
                          : "text-text-primary"
                      }
                    >
                      {setter.display_name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Notes input */}
              <Text className="text-text-secondary text-sm mb-1">{t("admin.calendar.notes")}</Text>
              <TextInput
                testID="notes-input"
                value={newSessionNotes}
                onChangeText={setNewSessionNotes}
                placeholder={t("admin.calendar.notesPlaceholder")}
                placeholderTextColor="#9CA3AF"
                className="bg-background rounded-lg px-3 py-2 text-text-primary mb-3"
              />

              {/* Save / Cancel buttons */}
              <View className="flex-row gap-2">
                <Pressable
                  testID="save-session-button"
                  onPress={handleCreateSession}
                  disabled={!newSessionSetterId || createMutation.isPending}
                  accessibilityRole="button"
                  className="flex-1 bg-accent py-2 rounded-lg items-center"
                >
                  <Text className="text-white font-medium">{t("common.save")}</Text>
                </Pressable>
                <Pressable
                  testID="cancel-add-button"
                  onPress={() => setShowAddForm(false)}
                  accessibilityRole="button"
                  className="flex-1 bg-surface border border-text-secondary py-2 rounded-lg items-center"
                >
                  <Text className="text-text-primary font-medium">{t("common.cancel")}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Session List ─────────────────────────────────────── */}
          {selectedSessions.length === 0 ? (
            <Text className="text-text-secondary text-center py-4">
              {t("admin.calendar.noSessions")}
            </Text>
          ) : (
            selectedSessions.map((session: any) => (
              <View
                key={session.id}
                className="bg-surface rounded-lg p-3 mb-2"
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-text-primary font-medium">
                    {session.setter?.display_name ?? t("admin.calendar.unknownSetter")}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {/* Status badge */}
                    <View
                      className={`px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[session.status] ?? "bg-gray-500"
                      }`}
                    >
                      <Text className="text-white text-xs font-medium">
                        {session.status}
                      </Text>
                    </View>

                    {/* Delete button */}
                    <Pressable
                      testID={`delete-session-${session.id}`}
                      onPress={() => handleDeleteSession(session.id)}
                      accessibilityRole="button"
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>

                {/* Notes */}
                {session.notes && (
                  <Text className="text-text-secondary text-sm">
                    {session.notes}
                  </Text>
                )}

                {/* Status transition buttons — only for 'planned' sessions */}
                {session.status === "planned" && (
                  <View className="flex-row gap-2 mt-2">
                    <Pressable
                      testID={`complete-session-${session.id}`}
                      onPress={() =>
                        handleUpdateStatus(session.id, "completed")
                      }
                      className="px-3 py-1 bg-green-600 rounded-lg"
                      accessibilityRole="button"
                    >
                      <Text className="text-white text-xs font-medium">
                        {t("admin.calendar.complete")}
                      </Text>
                    </Pressable>
                    <Pressable
                      testID={`cancel-session-${session.id}`}
                      onPress={() =>
                        handleUpdateStatus(session.id, "cancelled")
                      }
                      className="px-3 py-1 bg-gray-500 rounded-lg"
                      accessibilityRole="button"
                    >
                      <Text className="text-white text-xs font-medium">
                        {t("common.cancel")}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {/* ── Workload Summary ─────────────────────────────────────── */}
      {workload.length > 0 && (
        <View className="px-4 mb-6">
          <Text className="text-lg font-semibold text-text-primary mb-2">
            {t("admin.calendar.workload")}
          </Text>
          {workload.map((entry: any) => (
            <View
              key={entry.setter_id}
              className="flex-row items-center justify-between bg-surface rounded-lg p-3 mb-2"
            >
              <Text className="text-text-primary font-medium">
                {entry.display_name}
              </Text>
              <Text className="text-text-secondary">
                {entry.route_count} {t("admin.calendar.routes")}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
