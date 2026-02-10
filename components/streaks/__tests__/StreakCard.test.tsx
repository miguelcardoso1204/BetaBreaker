// components/streaks/__tests__/StreakCard.test.tsx
//
// Tests for the StreakCard component — an enhanced streak display that shows
// current + longest streaks with a status badge indicator.
//
// TESTING APPROACH:
// These tests verify behavior, not styling. We check:
//   1. Correct streak numbers are displayed
//   2. The correct status badge label appears based on the status prop
// NativeWind className props don't affect queries — we test what the user
// sees, not the CSS classes applied.

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { StreakCard } from "../StreakCard";

describe("StreakCard", () => {
  it("renders current and longest streak numbers", () => {
    // Both streak numbers should be visible along with their labels.
    // This is the core data display responsibility of the component.
    render(
      <StreakCard currentStreak={5} longestStreak={8} status="active" />,
    );
    expect(screen.getByText("5")).toBeOnTheScreen();
    expect(screen.getByText("8")).toBeOnTheScreen();
    expect(screen.getByText("Current Streak")).toBeOnTheScreen();
    expect(screen.getByText("Longest Streak")).toBeOnTheScreen();
  });

  it('shows "Active" badge when status is active', () => {
    // An active streak means the user climbed this ISO week.
    // The success-variant badge gives positive visual feedback.
    render(
      <StreakCard currentStreak={3} longestStreak={5} status="active" />,
    );
    expect(screen.getByText("Active")).toBeOnTheScreen();
  });

  it('shows "At Risk" badge when status is at_risk', () => {
    // At risk means the user hasn't climbed this week yet.
    // The warning-variant badge motivates them to maintain the streak.
    render(
      <StreakCard currentStreak={3} longestStreak={5} status="at_risk" />,
    );
    expect(screen.getByText("At Risk")).toBeOnTheScreen();
  });

  it('shows "Broken" badge when status is broken', () => {
    // A broken streak means the user missed too many weeks.
    // The error-variant badge makes the status clear.
    render(
      <StreakCard currentStreak={0} longestStreak={5} status="broken" />,
    );
    expect(screen.getByText("Broken")).toBeOnTheScreen();
  });

  it('shows "No Streak" badge when status is none', () => {
    // No streak means the user is brand new or has never logged an ascent.
    // The default-variant badge is neutral and non-judgmental.
    render(
      <StreakCard currentStreak={0} longestStreak={0} status="none" />,
    );
    expect(screen.getByText("No Streak")).toBeOnTheScreen();
  });
});
