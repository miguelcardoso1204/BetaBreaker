/**
 * ReportSheet — Bottom Sheet Modal for Reporting Inappropriate Content
 *
 * When a user sees something inappropriate (spam, harassment, dangerous
 * activity), they tap a Flag icon which opens this sheet. The flow is:
 *
 *   1. Sheet slides up with a list of predefined reasons
 *   2. User taps a reason (highlights the selection)
 *   3. User taps "Submit Report" → creates a content_reports row
 *   4. Success message shows briefly, then the sheet dismisses
 *
 * FOLLOWS THE QuickLogSheet PATTERN:
 * Uses React Native's built-in `Modal` with `animationType="slide"` and
 * a transparent backdrop. This avoids adding a gesture-driven bottom sheet
 * library just for a simple form. The parent controls visibility via the
 * `visible` prop and handles dismissal via `onDismiss`.
 *
 * PREDEFINED REASONS:
 * Rather than free-text input, we use a fixed set of reasons. This:
 *   - Makes it easier for admins to categorize and triage reports
 *   - Reduces the effort for users (tap, don't type)
 *   - Prevents abuse of the report system with nonsense text
 *
 * The reasons match common community guideline violations:
 *   - Inappropriate content (nudity, graphic content)
 *   - Spam (promotional, off-topic, repetitive)
 *   - Harassment (targeting another user)
 *   - Dangerous activity (unsafe climbing practices)
 *   - Other (catch-all)
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { useCreateReport } from "@/hooks/useModeration";

// ── Props ─────────────────────────────────────────────────────────────

export interface ReportSheetProps {
  /** Controls whether the sheet is visible. Parent manages this state. */
  visible: boolean;
  /** Called when the user taps the backdrop or after successful submission. */
  onDismiss: () => void;
  /** What kind of content is being reported — matches content_reports CHECK constraint. */
  targetType: "video" | "feedback" | "user";
  /** UUID of the reported item (route_media, route_feedback, or profile). */
  targetId: string;
}

// ── Predefined report reasons ─────────────────────────────────────────

/**
 * Fixed set of report reasons shown as tappable options.
 * Each entry has a `value` (stored in content_reports.reason in
 * English, regardless of locale) and a `labelKey` (i18n key for
 * the user-facing translated label).
 */
const REPORT_REASONS = [
  { value: "Inappropriate content", labelKey: "social.reasonInappropriate" },
  { value: "Spam", labelKey: "social.reasonSpam" },
  { value: "Harassment", labelKey: "social.reasonHarassment" },
  { value: "Dangerous activity", labelKey: "social.reasonDangerous" },
  { value: "Other", labelKey: "social.reasonOther" },
] as const;

// ── Component ─────────────────────────────────────────────────────────

export function ReportSheet({
  visible,
  onDismiss,
  targetType,
  targetId,
}: ReportSheetProps) {
  const { t } = useTranslation();

  // Selected reason — null means nothing picked yet (submit disabled).
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  // useCreateReport provides the mutation to submit the report.
  // isSuccess flips to true after a successful mutation, triggering
  // the success message UI.
  const { mutate: createReport, isPending, isSuccess } = useCreateReport();

  // Reset the selected reason when the sheet is dismissed or reopened.
  // This ensures a clean slate each time — no stale selection from
  // a previous report attempt.
  useEffect(() => {
    if (!visible) {
      setSelectedReason(null);
    }
  }, [visible]);

  /**
   * Handle the submit button press.
   * Only fires if a reason is selected. Calls the createReport mutation
   * with the target info and selected reason. On success, the isSuccess
   * flag triggers the success message.
   */
  function handleSubmit() {
    if (!selectedReason) return;

    createReport(
      {
        targetType,
        targetId,
        reason: selectedReason,
      },
      {
        // Auto-dismiss after a short delay to show the success message
        onSuccess: () => {
          setTimeout(() => {
            onDismiss();
          }, 1500);
        },
      }
    );
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View className="flex-1 justify-end">
        {/* Backdrop — semi-transparent overlay, tap to dismiss */}
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t("social.closeReportSheet")}
        />

        {/* Sheet content */}
        <View className="bg-surface rounded-t-2xl px-6 pt-6 pb-8">
          {isSuccess ? (
            // ── Success state ──────────────────────────────────────
            // Brief confirmation that the report was submitted.
            // The sheet auto-dismisses after 1.5 seconds.
            <View className="items-center py-6">
              <Text className="text-text-primary text-lg font-bold">
                {t("social.reportSubmitted")}
              </Text>
              <Text className="text-text-secondary text-sm mt-2">
                {t("social.reportThankYou")}
              </Text>
            </View>
          ) : (
            // ── Reason picker state ────────────────────────────────
            <>
              <Text className="text-text-primary text-xl font-bold mb-2">
                {t("social.reportContent")}
              </Text>
              <Text className="text-text-secondary text-sm mb-4">
                {t("social.reportReason")}
              </Text>

              {/* Reason list — each reason is a tappable row.
                  The selected reason gets an accent border/background
                  to indicate the current choice. */}
              {REPORT_REASONS.map(({ value, labelKey }) => {
                const isSelected = selectedReason === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setSelectedReason(value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    className={`py-3 px-4 rounded-lg mb-2 ${
                      isSelected
                        ? "bg-accent/20 border border-accent"
                        : "border border-border"
                    }`}
                  >
                    <Text
                      className={`text-base ${
                        isSelected
                          ? "text-accent font-semibold"
                          : "text-text-primary"
                      }`}
                    >
                      {t(labelKey)}
                    </Text>
                  </Pressable>
                );
              })}

              {/* Submit button — disabled until a reason is selected.
                  Shows loading state during the mutation. */}
              <Pressable
                onPress={handleSubmit}
                disabled={!selectedReason || isPending}
                accessibilityRole="button"
                className={`mt-4 py-3 rounded-xl items-center ${
                  selectedReason && !isPending
                    ? "bg-accent"
                    : "bg-accent/30"
                }`}
              >
                <Text
                  className={`font-semibold text-base ${
                    selectedReason && !isPending
                      ? "text-white"
                      : "text-white/50"
                  }`}
                >
                  {isPending ? t("social.submitting") : t("social.submitReport")}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
