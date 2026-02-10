/**
 * ChallengeProgress Component Tests (Step 8.4)
 *
 * Tests for the progress bar sub-component used in challenge cards.
 * Verifies that the "current / target" text label renders correctly
 * for various progress states (none, partial, complete).
 *
 * These tests use @testing-library/react-native's behavior-based queries.
 * We test the text output, not the visual bar width (that's a style concern).
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { ChallengeProgress } from "../ChallengeProgress";

describe("ChallengeProgress", () => {
  it('renders "current / target" text', () => {
    // The progress label should show the exact current and target values
    // separated by a slash, e.g., "7 / 10".
    render(<ChallengeProgress current={7} target={10} />);
    expect(screen.getByText("7 / 10")).toBeOnTheScreen();
  });

  it("shows 0 / 10 for no progress", () => {
    // When the user hasn't started the challenge, current is 0.
    render(<ChallengeProgress current={0} target={10} />);
    expect(screen.getByText("0 / 10")).toBeOnTheScreen();
  });

  it("shows 10 / 10 for completed challenge", () => {
    // When the user has met the target, current equals target.
    render(<ChallengeProgress current={10} target={10} />);
    expect(screen.getByText("10 / 10")).toBeOnTheScreen();
  });

  it("shows partial progress", () => {
    // Mid-challenge progress — current is between 0 and target.
    render(<ChallengeProgress current={3} target={5} />);
    expect(screen.getByText("3 / 5")).toBeOnTheScreen();
  });
});
