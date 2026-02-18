// components/streaks/StreakStatusBanner.tsx
//
// Contextual warning/recovery banner shown below the StreakCard when the
// user's streak needs attention. Returns null when there's nothing to show.
//
// WHY A SEPARATE COMPONENT?
// The StreakCard shows the data (numbers + status badge). This banner
// provides the actionable context — it tells the user WHAT TO DO about
// their streak status. Separating these concerns means:
//   1. The card stays clean and focused on data display
//   2. The banner can be conditionally rendered without affecting card layout
//   3. Each component has a single responsibility and is easier to test
//
// MESSAGE DESIGN:
// Messages are encouraging, not punitive. Climbing streaks should motivate,
// not guilt. "Climb this week to keep your streak alive!" is a gentle nudge.
// "Your streak has ended. Start a new one today!" acknowledges the loss but
// immediately redirects to positive action.

import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import type { StreakStatus } from "@/utils/streaks";

/**
 * Props for the StreakStatusBanner component.
 *
 * @property status      - The derived streak status from deriveStreakStatus()
 * @property decayedFrom - Set when the streak is frozen (gap = 2 weeks).
 *                         Included in the message so the user knows the value.
 * @property testID      - Optional testID for the outer Card
 */
export interface StreakStatusBannerProps {
  status: StreakStatus;
  decayedFrom?: number;
  testID?: string;
}

/**
 * StreakStatusBanner — contextual streak recovery/warning messages.
 *
 * Rendering rules:
 *   - active → null (no banner needed — user is climbing regularly)
 *   - none   → null (no banner — user hasn't started yet)
 *   - at_risk (no decay) → "Climb this week to keep your streak alive!"
 *   - at_risk (with decay) → "Your streak is frozen at N. Climb this week..."
 *   - broken → "Your streak has ended. Start a new one today!"
 *
 * The banner uses the outlined Card variant with a warning or error border
 * color depending on the severity. This makes it visually distinct from
 * the main content without being too heavy.
 */
export function StreakStatusBanner({
  status,
  decayedFrom,
  testID,
}: StreakStatusBannerProps) {
  // useTranslation hook provides t() for looking up i18n keys from locales/
  const { t } = useTranslation();

  // Active and none statuses don't need a banner — nothing to communicate.
  // Returning null means React renders nothing (no DOM node at all).
  if (status === "active" || status === "none") {
    return null;
  }

  // Determine the message and border color based on status + decay state.
  // The at_risk status has two sub-cases: normal (1 week gap) and frozen
  // (2 week gap, indicated by decayedFrom being set).
  let message: string;
  let borderColor: string;

  if (status === "at_risk") {
    borderColor = "border-warning";
    // When decayedFrom is set, interpolate the frozen count into the message.
    // Otherwise, show the generic at-risk nudge.
    message = decayedFrom
      ? t("streaks.frozenMessage", { count: decayedFrom })
      : t("streaks.atRiskMessage");
  } else {
    // status === "broken"
    borderColor = "border-error";
    message = t("streaks.brokenMessage");
  }

  return (
    <Card
      variant="outlined"
      testID={testID}
      className={`mx-4 mt-2 ${borderColor}`}
    >
      <Text className="text-text-secondary text-sm text-center">
        {message}
      </Text>
    </Card>
  );
}
