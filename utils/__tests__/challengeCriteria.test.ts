/**
 * Challenge Criteria Utility Tests (Step 8.4)
 *
 * Tests for the challenge criteria Zod schema and pure helper functions
 * used to validate challenge definitions, compute progress from ascent
 * data, derive challenge status from dates, and format time remaining.
 *
 * These are all pure functions with no side effects — no mocking needed.
 * Each function is deterministic: same inputs always produce same outputs.
 *
 * Test categories:
 *   - Zod schema validation (8 tests): Valid/invalid criteria objects
 *   - computeChallengeProgress (5 tests): Progress calculation per criteria type
 *   - deriveChallengeStatus (4 tests): Status derivation from dates + completion
 *   - computeTimeRemaining (3 tests): Human-readable time remaining strings
 */

import {
  challengeCriteriaSchema,
  computeChallengeProgress,
  deriveChallengeStatus,
  computeTimeRemaining,
} from "../challengeCriteria";

// ===========================================================================
// Zod Schema Validation (8 tests)
// ===========================================================================
// The schema validates challenge criteria objects from the JSONB column.
// It ensures only known criteria types are used, targets are positive,
// and grade_sends includes the required min_grade field.

describe("challengeCriteriaSchema", () => {
  it("accepts valid send_count criteria", () => {
    // send_count = total successful ascents (flash + send) during challenge.
    // No min_grade needed — just a target count.
    const result = challengeCriteriaSchema.safeParse({
      type: "send_count",
      target: 10,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid flash_count criteria", () => {
    // flash_count = total flash ascents (first attempt sends) during challenge.
    const result = challengeCriteriaSchema.safeParse({
      type: "flash_count",
      target: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid unique_routes criteria", () => {
    // unique_routes = distinct routes sent during challenge period.
    const result = challengeCriteriaSchema.safeParse({
      type: "unique_routes",
      target: 8,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid grade_sends criteria with min_grade", () => {
    // grade_sends requires min_grade — sends at or above this grade count.
    // min_grade 14 = V5 in the canonical 0-30 scale.
    const result = challengeCriteriaSchema.safeParse({
      type: "grade_sends",
      target: 3,
      min_grade: 14,
    });
    expect(result.success).toBe(true);
  });

  it("rejects grade_sends without min_grade", () => {
    // grade_sends MUST include min_grade — without it we wouldn't know
    // which grade threshold to check. The Zod refine() enforces this.
    const result = challengeCriteriaSchema.safeParse({
      type: "grade_sends",
      target: 3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid criteria type", () => {
    // Only the four known types are valid. Unknown types would mean the
    // trigger function doesn't know how to compute progress.
    const result = challengeCriteriaSchema.safeParse({
      type: "invalid",
      target: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects target less than 1", () => {
    // A challenge with target 0 would be instantly completed — nonsensical.
    // target must be at least 1 to require at least one qualifying action.
    const result = challengeCriteriaSchema.safeParse({
      type: "send_count",
      target: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects min_grade out of range (31)", () => {
    // Grades are on the 0-30 canonical scale (V0 to V16+ in V-scale).
    // min_grade 31 exceeds the scale maximum.
    const result = challengeCriteriaSchema.safeParse({
      type: "grade_sends",
      target: 3,
      min_grade: 31,
    });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// computeChallengeProgress (5 tests)
// ===========================================================================
// This pure function takes challenge criteria and an array of ascent data,
// then computes how much progress the user has made. The ascent data shape
// mirrors what the service layer returns (status, route_id, route_grade).

describe("computeChallengeProgress", () => {
  // Sample ascent data covering various statuses and routes.
  // 3 flashes + 4 sends + 3 attempts = 10 total ascents.
  const sampleAscents = [
    { status: "flash", route_id: "r1", route_grade: 10 },
    { status: "flash", route_id: "r2", route_grade: 14 },
    { status: "flash", route_id: "r3", route_grade: 8 },
    { status: "send", route_id: "r1", route_grade: 10 },
    { status: "send", route_id: "r2", route_grade: 14 },
    { status: "send", route_id: "r4", route_grade: 16 },
    { status: "send", route_id: "r1", route_grade: 10 },
    { status: "attempt", route_id: "r5", route_grade: 20 },
    { status: "attempt", route_id: "r6", route_grade: 22 },
    { status: "attempt", route_id: "r7", route_grade: 24 },
  ];

  it("send_count counts flash + send ascents", () => {
    // send_count includes both flash and send status, excludes attempts.
    // 3 flashes + 4 sends = 7 successful ascents.
    const progress = computeChallengeProgress(
      { type: "send_count", target: 10 },
      sampleAscents,
    );
    expect(progress).toBe(7);
  });

  it("flash_count only counts flashes", () => {
    // flash_count only counts ascents with status "flash".
    // Sends and attempts are excluded.
    const progress = computeChallengeProgress(
      { type: "flash_count", target: 5 },
      sampleAscents,
    );
    expect(progress).toBe(3);
  });

  it("unique_routes deduplicates by route_id", () => {
    // unique_routes counts DISTINCT routes sent (flash or send).
    // r1 appears 3 times, r2 twice, r3 once, r4 once = 4 unique routes.
    // Attempts (r5, r6, r7) don't count.
    const ascents = [
      { status: "send", route_id: "r1", route_grade: 10 },
      { status: "flash", route_id: "r1", route_grade: 10 },
      { status: "send", route_id: "r2", route_grade: 14 },
    ];
    const progress = computeChallengeProgress(
      { type: "unique_routes", target: 5 },
      ascents,
    );
    expect(progress).toBe(2);
  });

  it("grade_sends filters by min_grade", () => {
    // grade_sends counts successful ascents (flash/send) at or above min_grade.
    // With min_grade=14: grade 14 (2 ascents) + grade 16 (1 ascent) = 3.
    // grade 10 and grade 8 are below 14 so excluded.
    const progress = computeChallengeProgress(
      { type: "grade_sends", target: 5, min_grade: 14 },
      sampleAscents,
    );
    expect(progress).toBe(3);
  });

  it("returns 0 for empty ascents", () => {
    // No ascents means no progress, regardless of criteria type.
    const progress = computeChallengeProgress(
      { type: "send_count", target: 10 },
      [],
    );
    expect(progress).toBe(0);
  });
});

// ===========================================================================
// deriveChallengeStatus (4 tests)
// ===========================================================================
// Derives a challenge's display status from its date range and whether the
// user has completed it. Uses a reference date for testability.

describe("deriveChallengeStatus", () => {
  it("returns 'active' when now is in range and no completion", () => {
    // The challenge is ongoing — started in the past, ends in the future,
    // and the user hasn't completed it yet.
    const status = deriveChallengeStatus(
      { start_date: "2026-02-01T00:00:00Z", end_date: "2026-02-15T00:00:00Z" },
      null,
      new Date("2026-02-10T12:00:00Z"),
    );
    expect(status).toBe("active");
  });

  it("returns 'completed' when completed_at is set", () => {
    // Even if the challenge period is still active, once the user has
    // completed the goal, their status should show "completed".
    const status = deriveChallengeStatus(
      { start_date: "2026-02-01T00:00:00Z", end_date: "2026-02-15T00:00:00Z" },
      { completed_at: "2026-02-08T10:00:00Z" },
      new Date("2026-02-10T12:00:00Z"),
    );
    expect(status).toBe("completed");
  });

  it("returns 'expired' when end_date is past", () => {
    // The challenge period has ended and the user didn't complete it.
    const status = deriveChallengeStatus(
      { start_date: "2026-01-01T00:00:00Z", end_date: "2026-01-15T00:00:00Z" },
      null,
      new Date("2026-02-10T12:00:00Z"),
    );
    expect(status).toBe("expired");
  });

  it("returns 'upcoming' when start_date is future", () => {
    // The challenge hasn't started yet — it's scheduled for the future.
    const status = deriveChallengeStatus(
      { start_date: "2026-03-01T00:00:00Z", end_date: "2026-03-15T00:00:00Z" },
      null,
      new Date("2026-02-10T12:00:00Z"),
    );
    expect(status).toBe("upcoming");
  });
});

// ===========================================================================
// computeTimeRemaining (3 tests)
// ===========================================================================
// Formats the time remaining until a challenge's end_date into a
// human-readable string. Used by ChallengeCard for the countdown display.

describe("computeTimeRemaining", () => {
  it('returns "X days left" for multi-day future', () => {
    // When the end date is 3+ days away, show days remaining.
    const result = computeTimeRemaining(
      "2026-02-13T12:00:00Z",
      new Date("2026-02-10T12:00:00Z"),
    );
    expect(result).toBe("3 days left");
  });

  it('returns "X hours left" for same-day future', () => {
    // When less than 24 hours remain, switch to hours for urgency.
    const result = computeTimeRemaining(
      "2026-02-10T17:00:00Z",
      new Date("2026-02-10T12:00:00Z"),
    );
    expect(result).toBe("5 hours left");
  });

  it('returns "Ended" for past end_date', () => {
    // When the challenge has already ended, show "Ended".
    const result = computeTimeRemaining(
      "2026-02-09T00:00:00Z",
      new Date("2026-02-10T12:00:00Z"),
    );
    expect(result).toBe("Ended");
  });
});
