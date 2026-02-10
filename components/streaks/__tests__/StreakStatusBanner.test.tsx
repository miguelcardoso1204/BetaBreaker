// components/streaks/__tests__/StreakStatusBanner.test.tsx
//
// Tests for the StreakStatusBanner — a contextual warning/recovery banner
// displayed below the streak card when the user's streak needs attention.
//
// KEY BEHAVIOR:
// The banner only renders for at_risk and broken statuses. Active and none
// statuses return null — there's nothing actionable to communicate.
// For at_risk with decayedFrom, a special "frozen" message is shown.

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { StreakStatusBanner } from "../StreakStatusBanner";

describe("StreakStatusBanner", () => {
  it("returns null when status is active", () => {
    // Active streaks need no banner — the user is doing great.
    // Rendering null keeps the profile clean and focused.
    const { toJSON } = render(<StreakStatusBanner status="active" />);
    expect(toJSON()).toBeNull();
  });

  it("returns null when status is none", () => {
    // No streak means the user hasn't started — showing a "broken"
    // or "at risk" message would be confusing and discouraging.
    const { toJSON } = render(<StreakStatusBanner status="none" />);
    expect(toJSON()).toBeNull();
  });

  it("shows recovery message when at_risk (no decayedFrom)", () => {
    // The user missed this week but their streak is still alive.
    // A gentle nudge to climb this week keeps them motivated.
    render(<StreakStatusBanner status="at_risk" />);
    expect(
      screen.getByText("Climb this week to keep your streak alive!"),
    ).toBeOnTheScreen();
  });

  it("shows frozen message when at_risk with decayedFrom", () => {
    // The freeze mechanic preserved the streak for 2 weeks, but
    // time is running out. The message includes the frozen value
    // so the user knows exactly what they'll lose.
    render(<StreakStatusBanner status="at_risk" decayedFrom={5} />);
    expect(
      screen.getByText(
        "Your streak is frozen at 5. Climb this week to keep it going!",
      ),
    ).toBeOnTheScreen();
  });

  it("shows broken message when streak has expired", () => {
    // The streak is gone — no sugar-coating. But the message is
    // encouraging ("Start a new one today!") rather than punishing.
    render(<StreakStatusBanner status="broken" />);
    expect(
      screen.getByText("Your streak has ended. Start a new one today!"),
    ).toBeOnTheScreen();
  });
});
