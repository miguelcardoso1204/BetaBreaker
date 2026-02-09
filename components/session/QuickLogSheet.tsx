/**
 * QuickLogSheet — Bottom Sheet for Logging Ascents During a Session
 *
 * This is the primary UI for tick-logging. When a climber taps "Log Ascent"
 * during an active session, this sheet slides up from the bottom with:
 *   1. Status selection: Flash / Send / Attempt (tap to select)
 *   2. Attempts counter: +/- stepper (auto-locked to 1 for Flash)
 *   3. Notes field: optional free-text input
 *   4. Confirm button: calls useSession().logAscent, fires haptics, dismisses
 *
 * WHY A MODAL INSTEAD OF @gorhom/bottom-sheet?
 * A gesture-driven bottom sheet (swipe to dismiss, snap points) is great for
 * content browsing, but this is a form — the user fills fields and taps
 * confirm. React Native's built-in `Modal` with `animationType="slide"` gives
 * us the same visual effect (sheet slides up from bottom) without adding a
 * heavy dependency. If we later need swipe-to-dismiss, we can swap to
 * @gorhom/bottom-sheet without changing the form internals.
 *
 * STATE MANAGEMENT:
 * All form state (status, attempts, notes) lives in local `useState` — it's
 * purely ephemeral UI state that doesn't need to survive component unmount.
 * When the sheet is dismissed (visible → false), a useEffect resets all state
 * so the next opening starts fresh.
 *
 * HAPTIC FEEDBACK:
 * On successful submit, we trigger `Haptics.notificationAsync(Success)` to
 * give the user tactile confirmation that their ascent was logged. This is a
 * common pattern in fitness/logging apps — it makes the action feel "real"
 * even before the server responds.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Minus, Plus } from "lucide-react-native";

import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { ASCENT_STATUSES } from "@/lib/constants";
import type { AscentStatus } from "@/lib/constants";

// ── Props ────────────────────────────────────────────────────────────

export interface QuickLogSheetProps {
  /** Which route is being logged — passed to logAscent mutation. */
  routeId: string;
  /** Controls whether the sheet is visible. Parent manages this state. */
  visible: boolean;
  /** Called after submit or when the user taps the backdrop to close. */
  onDismiss: () => void;
}

// ── Display labels for status buttons ────────────────────────────────

/**
 * Map from AscentStatus values to user-friendly display labels.
 * The DB stores lowercase "flash"/"send"/"attempt", but the UI shows
 * capitalized versions for readability. Using a record ensures we
 * handle all statuses defined in ASCENT_STATUSES.
 */
const STATUS_LABELS: Record<AscentStatus, string> = {
  flash: "Flash",
  send: "Send",
  attempt: "Attempt",
};

// ── Component ────────────────────────────────────────────────────────

export function QuickLogSheet({
  routeId,
  visible,
  onDismiss,
}: QuickLogSheetProps) {
  // ── Local form state ─────────────────────────────────────────────
  // These values reset every time the sheet is dismissed (via useEffect).
  // null status means "nothing selected yet" — the confirm button is
  // disabled until the user picks one.
  const [status, setStatus] = useState<AscentStatus | null>(null);
  const [attempts, setAttempts] = useState(1);
  const [notes, setNotes] = useState("");

  // ── Hook into session management ─────────────────────────────────
  // useSession returns the logAscent mutation from TanStack Query.
  // We use .mutate() (fire-and-forget) rather than .mutateAsync() because
  // the sheet dismisses immediately — we don't await the server response.
  // The optimistic update in useSession's onMutate handles UI feedback.
  const { logAscent } = useSession();

  // ── Reset form when sheet is dismissed ───────────────────────────
  // This useEffect watches `visible` — when it transitions to false,
  // all form fields are reset to their defaults. This ensures the next
  // time the sheet opens, it's a clean slate (no stale status/notes
  // from a previous log).
  useEffect(() => {
    if (!visible) {
      setStatus(null);
      setAttempts(1);
      setNotes("");
    }
  }, [visible]);

  // ── Status button handler ────────────────────────────────────────
  // When the user selects a status, update the local state.
  // Special case: "flash" means first-try completion, so attempts must
  // be 1. We enforce this here rather than in the stepper so the user
  // sees the change immediately when they tap "Flash".
  const handleStatusSelect = useCallback((selected: AscentStatus) => {
    setStatus(selected);
    if (selected === "flash") {
      setAttempts(1);
    }
  }, []);

  // ── Confirm handler ──────────────────────────────────────────────
  // Called when the user taps "Log Ascent". Fires the mutation, triggers
  // haptic feedback, and dismisses the sheet. We don't await the mutation
  // — optimistic updates in useSession handle showing the log immediately.
  const handleConfirm = useCallback(() => {
    if (!status) return; // Guard: shouldn't happen since button is disabled

    // Call the logAscent mutation with the form data.
    // The useSession hook injects the authenticated userId automatically.
    logAscent.mutate({
      routeId,
      status,
      attempts,
      // Only include notes if the user typed something. Sending an empty
      // string is technically fine, but undefined is cleaner (the service
      // omits undefined fields from the INSERT).
      notes: notes.trim() || undefined,
    });

    // Haptic feedback — a satisfying "success" vibration to confirm the log.
    // This runs synchronously; the actual vibration is handled by the OS.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Dismiss the sheet. The parent is responsible for setting visible=false.
    onDismiss();
  }, [status, routeId, attempts, notes, logAscent, onDismiss]);

  return (
    <Modal
      // "slide" animation slides the modal up from the bottom of the screen,
      // mimicking a bottom sheet without needing gesture libraries.
      animationType="slide"
      // "transparent" lets us render a semi-transparent backdrop behind the
      // sheet — tapping the backdrop dismisses the sheet (see Pressable below).
      transparent
      visible={visible}
      // onRequestClose fires when the user presses the hardware back button
      // on Android. We treat it the same as tapping the backdrop.
      onRequestClose={onDismiss}
    >
      {/* Full-screen container — flex-1 fills the entire modal area.
          justify-end pushes the sheet to the bottom of the screen. */}
      <View className="flex-1 justify-end">
        {/* Backdrop — semi-transparent overlay behind the sheet.
            Tapping it dismisses the sheet (same as swiping down on a
            gesture-driven bottom sheet). The dark overlay also focuses
            the user's attention on the sheet content. */}
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={onDismiss}
          // accessibilityRole="button" tells screen readers this is tappable.
          // The label explains what tapping does.
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
        />

        {/* Sheet container — dark surface card with rounded top corners.
            bg-surface matches the app's card background (#1C1C28).
            pb-8 adds extra bottom padding for devices with home indicators
            (iPhone gesture bar, Android nav bar). */}
        <View className="bg-surface rounded-t-2xl px-6 pt-6 pb-8">
          {/* ── Title ──────────────────────────────────────────── */}
          <Text className="text-text-primary text-xl font-bold mb-6">
            Log Ascent
          </Text>

          {/* ── Status Selection Row ───────────────────────────── */}
          {/* Three buttons in a horizontal row. The selected button gets
              an accent background to indicate the current choice. Unselected
              buttons have a subtle border for visibility. */}
          <View className="flex-row gap-3 mb-6">
            {ASCENT_STATUSES.map((s) => {
              // Check if this button is the currently selected status
              const isSelected = status === s;

              return (
                <Pressable
                  key={s}
                  onPress={() => handleStatusSelect(s)}
                  accessibilityRole="button"
                  accessibilityLabel={`${STATUS_LABELS[s]} status`}
                  accessibilityState={{ selected: isSelected }}
                  className={`flex-1 items-center py-3 rounded-xl ${
                    isSelected
                      ? "bg-accent" // Solid purple background when selected
                      : "border border-border" // Subtle border when unselected
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      isSelected ? "text-white" : "text-text-secondary"
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── Attempts Stepper ───────────────────────────────── */}
          {/* A label + "−" button + count + "+" button in a row.
              Min value is 1 (can't have zero attempts), max is 99.
              Disabled when status is "flash" — a flash is always 1 attempt. */}
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-text-primary text-base font-medium">
              Attempts
            </Text>

            <View className="flex-row items-center gap-4">
              {/* Decrement button — decreases attempts by 1 (min 1).
                  Disabled when attempts is 1 OR status is flash. */}
              <Pressable
                testID="attempts-decrement"
                onPress={() => setAttempts((prev) => Math.max(1, prev - 1))}
                disabled={attempts <= 1 || status === "flash"}
                accessibilityRole="button"
                accessibilityLabel="Decrease attempts"
                className={`w-10 h-10 rounded-lg items-center justify-center border border-border ${
                  attempts <= 1 || status === "flash" ? "opacity-30" : ""
                }`}
              >
                <Minus size={18} color="#EAEAF0" />
              </Pressable>

              {/* Attempts count display */}
              <Text
                testID="attempts-count"
                className="text-text-primary text-lg font-bold min-w-[24px] text-center"
              >
                {attempts}
              </Text>

              {/* Increment button — increases attempts by 1 (max 99).
                  Disabled when status is flash (always 1 attempt). */}
              <Pressable
                testID="attempts-increment"
                onPress={() => setAttempts((prev) => Math.min(99, prev + 1))}
                disabled={status === "flash"}
                accessibilityRole="button"
                accessibilityLabel="Increase attempts"
                className={`w-10 h-10 rounded-lg items-center justify-center border border-border ${
                  status === "flash" ? "opacity-30" : ""
                }`}
              >
                <Plus size={18} color="#EAEAF0" />
              </Pressable>
            </View>
          </View>

          {/* ── Notes Input ────────────────────────────────────── */}
          {/* Optional free-text field for beta tips, conditions, or
              any notes the climber wants to attach to this ascent. */}
          <AppTextInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            autoCapitalize="sentences"
          />

          {/* ── Confirm Button ─────────────────────────────────── */}
          {/* Primary CTA that submits the log. Disabled until a status
              is selected. Shows loading state during the mutation. */}
          <Button
            label="Log Ascent"
            onPress={handleConfirm}
            size="lg"
            // Disable when no status is selected — the user must make a choice.
            disabled={status === null}
            // Show loading spinner while the mutation is in-flight.
            loading={logAscent.isPending}
          />
        </View>
      </View>
    </Modal>
  );
}
