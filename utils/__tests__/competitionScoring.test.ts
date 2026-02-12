/**
 * Competition Scoring Utils Tests
 *
 * Tests the three pure functions that power the live scoreboard:
 *   - aggregateScores: groups raw competition_scores by user, SUMs scores
 *   - rankCompetitionEntries: maps aggregated data to LeaderboardEntry[],
 *     delegates to rankLeaderboard() for 1224 ranking
 *   - formatCompetitionScore: converts a numeric score to display string
 *
 * These are pure functions — no mocks needed, just input → output.
 */

import {
  aggregateScores,
  rankCompetitionEntries,
  formatCompetitionScore,
} from "../competitionScoring";
import type { AggregatedEntry } from "../competitionScoring";

// ── Fixtures ──────────────────────────────────────────────────────────

/** Minimal score shape matching what getEventScores returns. */
function makeScore(overrides: {
  user_id: string;
  score: number;
  route_id?: string;
  category_id?: string | null;
  user?: { display_name: string; avatar_url: string | null };
}) {
  return {
    id: `score-${Math.random().toString(36).slice(2)}`,
    event_id: "event-1",
    route_id: overrides.route_id ?? "route-1",
    user_id: overrides.user_id,
    score: overrides.score,
    category_id: overrides.category_id ?? null,
    verified_by: null,
    created_at: "2026-03-01T12:00:00Z",
    user: overrides.user ?? {
      display_name: `User ${overrides.user_id}`,
      avatar_url: null,
    },
  };
}

// ── aggregateScores ──────────────────────────────────────────────────

describe("aggregateScores", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateScores([])).toEqual([]);
  });

  it("aggregates a single user with one score", () => {
    const scores = [
      makeScore({
        user_id: "u1",
        score: 100,
        user: { display_name: "Alice", avatar_url: "http://img/a.png" },
      }),
    ];

    const result = aggregateScores(scores);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      userId: "u1",
      totalScore: 100,
      routeCount: 1,
      displayName: "Alice",
      avatarUrl: "http://img/a.png",
    });
  });

  it("sums scores across multiple routes for one user", () => {
    const scores = [
      makeScore({ user_id: "u1", score: 100, route_id: "r1" }),
      makeScore({ user_id: "u1", score: 200, route_id: "r2" }),
      makeScore({ user_id: "u1", score: 50, route_id: "r3" }),
    ];

    const result = aggregateScores(scores);

    expect(result).toHaveLength(1);
    expect(result[0].totalScore).toBe(350);
    expect(result[0].routeCount).toBe(3);
  });

  it("aggregates multiple users independently", () => {
    const scores = [
      makeScore({ user_id: "u1", score: 100, route_id: "r1" }),
      makeScore({ user_id: "u2", score: 200, route_id: "r1" }),
      makeScore({ user_id: "u1", score: 50, route_id: "r2" }),
    ];

    const result = aggregateScores(scores);

    expect(result).toHaveLength(2);

    const u1 = result.find((e) => e.userId === "u1")!;
    const u2 = result.find((e) => e.userId === "u2")!;

    expect(u1.totalScore).toBe(150);
    expect(u1.routeCount).toBe(2);
    expect(u2.totalScore).toBe(200);
    expect(u2.routeCount).toBe(1);
  });

  it("filters by categoryId when provided", () => {
    const scores = [
      makeScore({ user_id: "u1", score: 100, category_id: "cat-a" }),
      makeScore({ user_id: "u1", score: 200, category_id: "cat-b" }),
      makeScore({ user_id: "u2", score: 300, category_id: "cat-a" }),
    ];

    const result = aggregateScores(scores, "cat-a");

    expect(result).toHaveLength(2);

    const u1 = result.find((e) => e.userId === "u1")!;
    expect(u1.totalScore).toBe(100); // Only cat-a score
    expect(u2result(result, "u2").totalScore).toBe(300);
  });

  it("returns empty when categoryId matches no scores", () => {
    const scores = [
      makeScore({ user_id: "u1", score: 100, category_id: "cat-a" }),
    ];

    expect(aggregateScores(scores, "cat-nonexistent")).toEqual([]);
  });

  it("handles null avatar_url in embedded user", () => {
    const scores = [
      makeScore({
        user_id: "u1",
        score: 50,
        user: { display_name: "NoAvatar", avatar_url: null },
      }),
    ];

    const result = aggregateScores(scores);
    expect(result[0].avatarUrl).toBeNull();
  });

  it("handles score of zero correctly", () => {
    const scores = [
      makeScore({ user_id: "u1", score: 0, route_id: "r1" }),
      makeScore({ user_id: "u1", score: 100, route_id: "r2" }),
    ];

    const result = aggregateScores(scores);
    expect(result[0].totalScore).toBe(100);
    expect(result[0].routeCount).toBe(2);
  });
});

// Small helper to reduce repetition in tests above
function u2result(results: AggregatedEntry[], userId: string) {
  return results.find((e) => e.userId === userId)!;
}

// ── rankCompetitionEntries ──────────────────────────────────────────

describe("rankCompetitionEntries", () => {
  it("returns empty array for empty input", () => {
    expect(rankCompetitionEntries([])).toEqual([]);
  });

  it("ranks entries by totalScore descending (1224 system)", () => {
    const entries: AggregatedEntry[] = [
      { userId: "u1", totalScore: 100, routeCount: 2, displayName: "A", avatarUrl: null },
      { userId: "u2", totalScore: 300, routeCount: 3, displayName: "B", avatarUrl: null },
      { userId: "u3", totalScore: 200, routeCount: 2, displayName: "C", avatarUrl: null },
    ];

    const result = rankCompetitionEntries(entries);

    expect(result[0].userId).toBe("u2");
    expect(result[0].rank).toBe(1);
    expect(result[1].userId).toBe("u3");
    expect(result[1].rank).toBe(2);
    expect(result[2].userId).toBe("u1");
    expect(result[2].rank).toBe(3);
  });

  it("assigns same rank to tied entries (1224)", () => {
    const entries: AggregatedEntry[] = [
      { userId: "u1", totalScore: 200, routeCount: 2, displayName: "A", avatarUrl: null },
      { userId: "u2", totalScore: 200, routeCount: 2, displayName: "B", avatarUrl: null },
      { userId: "u3", totalScore: 100, routeCount: 1, displayName: "C", avatarUrl: null },
    ];

    const result = rankCompetitionEntries(entries);

    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    // Next rank skips to 3 (1224 system)
    expect(result[2].rank).toBe(3);
  });

  it("preserves displayName and avatarUrl through ranking", () => {
    const entries: AggregatedEntry[] = [
      { userId: "u1", totalScore: 500, routeCount: 5, displayName: "Alice", avatarUrl: "http://img/a.png" },
    ];

    const result = rankCompetitionEntries(entries);

    expect(result[0].displayName).toBe("Alice");
    expect(result[0].avatarUrl).toBe("http://img/a.png");
  });
});

// ── formatCompetitionScore ──────────────────────────────────────────

describe("formatCompetitionScore", () => {
  it("formats as plain integer string for all models", () => {
    // Competition scores are always plain integers — the per-route
    // encoding already captures model semantics
    expect(formatCompetitionScore(150, "points")).toBe("150");
    expect(formatCompetitionScore(42, "tops_and_zones")).toBe("42");
    expect(formatCompetitionScore(1000, "thousand_divide_by")).toBe("1000");
    expect(formatCompetitionScore(250, "redpoint")).toBe("250");
  });

  it("formats zero correctly", () => {
    expect(formatCompetitionScore(0, "points")).toBe("0");
  });
});
