// utils/__tests__/streakStatus.test.ts
//
// Tests for deriveStreakStatus() — the client-side function that derives
// real-time streak status from stale DB data.
//
// WHY CLIENT-SIDE DERIVATION?
// The DB's `user_streaks.current_streak` only updates when a trigger fires
// (on ascent insert/delete). If a user goes inactive, the DB value becomes
// stale — it still shows the old streak even though weeks have passed.
// deriveStreakStatus() compares `last_active_date` against the current date
// using ISO week gaps to determine the real-time status.
//
// REFERENCE DATE:
// All tests use a fixed reference date of Thursday Feb 5, 2026 — which falls
// in ISO week starting Monday Feb 2, 2026. This makes gap calculations
// deterministic and easy to reason about.

import { deriveStreakStatus } from "../streakStatus";

// Thursday Feb 5, 2026 — ISO week starts Mon Feb 2
const REFERENCE = new Date(2026, 1, 5);

describe("deriveStreakStatus", () => {
  it("returns none when lastActiveDate is null", () => {
    // A null last_active_date means the user has never logged an ascent.
    // Even if currentStreak is somehow non-zero (shouldn't happen),
    // null date means no streak to derive.
    const result = deriveStreakStatus(5, null, REFERENCE);
    expect(result).toEqual({ displayStreak: 0, status: "none" });
  });

  it("returns none when currentStreak is zero", () => {
    // A zero streak means the user has no active streak in the DB,
    // regardless of their last active date. This is the fresh/reset state.
    const result = deriveStreakStatus(0, "2026-02-02", REFERENCE);
    expect(result).toEqual({ displayStreak: 0, status: "none" });
  });

  it("returns active when last active in the current ISO week (gap=0)", () => {
    // last_active_date Mon Feb 2 is in the same ISO week as reference
    // (Thu Feb 5). Gap = 0 weeks → streak is alive and growing.
    const result = deriveStreakStatus(5, "2026-02-02", REFERENCE);
    expect(result).toEqual({ displayStreak: 5, status: "active" });
  });

  it("returns at_risk when last active was last week (gap=1)", () => {
    // Mon Jan 26 is one ISO week before Mon Feb 2 (the reference week).
    // Gap = 1 → streak isn't broken yet, but user needs to climb this week.
    const result = deriveStreakStatus(5, "2026-01-26", REFERENCE);
    expect(result).toEqual({ displayStreak: 5, status: "at_risk" });
  });

  it("returns at_risk with decayedFrom when 2 weeks ago (gap=2, freeze)", () => {
    // Mon Jan 19 is two ISO weeks before the reference week.
    // Gap = 2 → freeze mechanic applies. Streak is preserved but frozen.
    // decayedFrom tells the UI the streak was frozen at this value.
    const result = deriveStreakStatus(5, "2026-01-19", REFERENCE);
    expect(result).toEqual({
      displayStreak: 5,
      status: "at_risk",
      decayedFrom: 5,
    });
  });

  it("returns broken when 3 weeks ago (gap=3)", () => {
    // Mon Jan 12 is three ISO weeks before the reference week.
    // Gap >= 3 → streak is expired. The DB value is stale, so we
    // override displayStreak to 0 to reflect the truth.
    const result = deriveStreakStatus(5, "2026-01-12", REFERENCE);
    expect(result).toEqual({ displayStreak: 0, status: "broken" });
  });

  it("returns broken when far in the past", () => {
    // Dec 1, 2025 is many weeks before the reference date.
    // This tests that the function handles large gaps correctly.
    const result = deriveStreakStatus(5, "2025-12-01", REFERENCE);
    expect(result).toEqual({ displayStreak: 0, status: "broken" });
  });

  it("defaults to current date when no referenceDate provided", () => {
    // When referenceDate is omitted, the function should use new Date().
    // We use jest fake timers to control "now" for deterministic results.
    jest.useFakeTimers();
    // Set fake clock to Monday Feb 2, 2026 — the start of the ISO week
    jest.setSystemTime(new Date(2026, 1, 2));

    // last_active_date is also in this ISO week → gap = 0 → active
    const result = deriveStreakStatus(3, "2026-02-02");
    expect(result).toEqual({ displayStreak: 3, status: "active" });

    jest.useRealTimers();
  });
});
