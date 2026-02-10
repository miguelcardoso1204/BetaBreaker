/**
 * ChallengeCard Component Tests (Step 8.4)
 *
 * Tests for the challenge card component that displays challenge info,
 * progress bar, status badge, time remaining, and reward badge.
 *
 * These tests use @testing-library/react-native's behavior-based queries
 * (getByText, queryByText) to verify what the user sees, not internal
 * component state or styles.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { ChallengeCard } from "../ChallengeCard";

describe("ChallengeCard", () => {
  // Default props used across most tests — overridden per test as needed
  const defaultProps = {
    name: "Flash Five Challenge",
    description: "Flash 5 different routes this week",
    progress: 3,
    target: 5,
    status: "active" as const,
    timeRemaining: "3 days left",
    rewardBadge: { name: "Flash Master", icon_key: "badge-flash" },
  };

  it("renders challenge name", () => {
    // The challenge name should be prominently displayed in the card header.
    render(<ChallengeCard {...defaultProps} />);
    expect(screen.getByText("Flash Five Challenge")).toBeOnTheScreen();
  });

  it("renders description when provided", () => {
    // The optional description gives users more context about the challenge.
    render(<ChallengeCard {...defaultProps} />);
    expect(
      screen.getByText("Flash 5 different routes this week"),
    ).toBeOnTheScreen();
  });

  it('renders progress as "X / Y"', () => {
    // The ChallengeProgress sub-component renders the progress label.
    render(<ChallengeCard {...defaultProps} />);
    expect(screen.getByText("3 / 5")).toBeOnTheScreen();
  });

  it('shows "Active" badge for active status', () => {
    // Active challenges display a green "Active" badge to indicate
    // the user can still make progress.
    render(<ChallengeCard {...defaultProps} status="active" />);
    expect(screen.getByText("Active")).toBeOnTheScreen();
  });

  it('shows "Completed" badge for completed status', () => {
    // Completed challenges show a green "Completed" badge — celebration!
    render(<ChallengeCard {...defaultProps} status="completed" />);
    expect(screen.getByText("Completed")).toBeOnTheScreen();
  });

  it('shows "Expired" badge for expired status', () => {
    // Expired challenges show a red "Expired" badge — clear signal.
    render(<ChallengeCard {...defaultProps} status="expired" />);
    expect(screen.getByText("Expired")).toBeOnTheScreen();
  });

  it("shows time remaining when provided", () => {
    // The time remaining countdown creates urgency for active challenges.
    render(<ChallengeCard {...defaultProps} />);
    expect(screen.getByText("3 days left")).toBeOnTheScreen();
  });

  it("shows reward badge name when provided", () => {
    // The reward badge name motivates users by showing what they'll earn.
    render(<ChallengeCard {...defaultProps} />);
    expect(screen.getByText("Flash Master")).toBeOnTheScreen();
  });
});
