/**
 * Suggestion Scoring Tests — Pure Function Tests
 *
 * Tests for the personalized route suggestion scoring algorithm.
 * All functions are pure (no React, no Supabase) — they take data in
 * and return results. No mocks needed.
 *
 * The scoring system works in three steps:
 * 1. computeWeakStyles() — find tags where the user is below average
 * 2. scoreRoute() — assign points to a route based on tag overlap
 * 3. scoreSuggestions() — filter, score, sort, and paginate candidates
 */

import {
  computeWeakStyles,
  scoreRoute,
  scoreSuggestions,
  DEFAULT_SUGGESTION_PAGE_SIZE,
  SUGGESTION_GRADE_RANGE,
} from "../suggestions";
import type { CandidateRoute } from "../suggestions";
import type { StyleInsightEntry } from "@/services/sessions.service";

// ── computeWeakStyles ──────────────────────────────────────────────

describe("computeWeakStyles", () => {
  it("returns tags with counts below the mean", () => {
    // Distribution: slab=10, overhang=2, crimpy=3. Mean = 5.
    // Tags below mean: overhang (2), crimpy (3).
    const distribution: StyleInsightEntry[] = [
      { tagName: "slab", category: "angle", count: 10 },
      { tagName: "overhang", category: "angle", count: 2 },
      { tagName: "crimpy", category: "hold_type", count: 3 },
    ];

    const weak = computeWeakStyles(distribution);

    expect(weak).toEqual(new Set(["overhang", "crimpy"]));
  });

  it("returns empty set when all tags have equal counts", () => {
    // All counts are 5. Mean = 5. Nothing is below mean.
    const distribution: StyleInsightEntry[] = [
      { tagName: "slab", category: "angle", count: 5 },
      { tagName: "overhang", category: "angle", count: 5 },
    ];

    const weak = computeWeakStyles(distribution);

    expect(weak).toEqual(new Set());
  });

  it("returns empty set for empty distribution", () => {
    const weak = computeWeakStyles([]);

    expect(weak).toEqual(new Set());
  });
});

// ── scoreRoute ────────────────────────────────────────────────────

describe("scoreRoute", () => {
  it("scores novel tags (never tried) at +2 each", () => {
    // Route has "dyno" tag. User has never climbed any dyno routes
    // (it's not in knownStyles at all) → +2 per novel tag.
    const route: CandidateRoute = {
      id: "r1",
      name: "Big Dyno",
      canonical_grade: 10,
      color: null,
      status: "active",
      tags: ["dyno"],
    };
    const weakStyles = new Set<string>();
    const knownStyles = new Set(["slab", "crimpy"]);

    const score = scoreRoute(route, weakStyles, knownStyles);

    expect(score).toBe(2);
  });

  it("scores weak tags at +1 each", () => {
    // Route has "overhang" tag. User has tried it but it's a weak style.
    const route: CandidateRoute = {
      id: "r2",
      name: "Overhang Fest",
      canonical_grade: 8,
      color: null,
      status: "active",
      tags: ["overhang"],
    };
    const weakStyles = new Set(["overhang"]);
    const knownStyles = new Set(["slab", "overhang"]);

    const score = scoreRoute(route, weakStyles, knownStyles);

    expect(score).toBe(1);
  });

  it("scores strong (known, non-weak) tags at +0", () => {
    // Route has "slab" tag. User has it as a strong style (not weak).
    const route: CandidateRoute = {
      id: "r3",
      name: "Slab City",
      canonical_grade: 6,
      color: null,
      status: "active",
      tags: ["slab"],
    };
    const weakStyles = new Set(["overhang"]);
    const knownStyles = new Set(["slab", "overhang"]);

    const score = scoreRoute(route, weakStyles, knownStyles);

    expect(score).toBe(0);
  });

  it("sums scores across multiple tags", () => {
    // Route has: dyno (novel=+2), overhang (weak=+1), slab (strong=+0) → total 3
    const route: CandidateRoute = {
      id: "r4",
      name: "Mixed Move",
      canonical_grade: 12,
      color: "#FF0000",
      status: "active",
      tags: ["dyno", "overhang", "slab"],
    };
    const weakStyles = new Set(["overhang"]);
    const knownStyles = new Set(["slab", "overhang"]);

    const score = scoreRoute(route, weakStyles, knownStyles);

    expect(score).toBe(3); // 2 (dyno novel) + 1 (overhang weak) + 0 (slab strong)
  });

  it("returns 0 for a route with no tags", () => {
    const route: CandidateRoute = {
      id: "r5",
      name: "Mystery Route",
      canonical_grade: 10,
      color: null,
      status: "active",
      tags: [],
    };

    const score = scoreRoute(route, new Set(), new Set());

    expect(score).toBe(0);
  });
});

// ── scoreSuggestions ──────────────────────────────────────────────

describe("scoreSuggestions", () => {
  // Reusable candidate routes for multiple tests
  const candidates: CandidateRoute[] = [
    {
      id: "r1",
      name: "Easy Slab",
      canonical_grade: 6,
      color: "#22C55E",
      status: "active",
      tags: ["slab"],
    },
    {
      id: "r2",
      name: "Overhang Problem",
      canonical_grade: 8,
      color: "#EF4444",
      status: "active",
      tags: ["overhang", "crimpy"],
    },
    {
      id: "r3",
      name: "Dyno King",
      canonical_grade: 10,
      color: "#3B82F6",
      status: "active",
      tags: ["dyno"],
    },
    {
      id: "r4",
      name: "Already Sent",
      canonical_grade: 8,
      color: "#A855F7",
      status: "active",
      tags: ["overhang"],
    },
  ];

  it("filters out already-sent routes", () => {
    const result = scoreSuggestions({
      candidates,
      sentRouteIds: new Set(["r4"]), // "Already Sent" is excluded
      weakStyles: new Set(["overhang"]),
      knownStyles: new Set(["slab", "overhang"]),
      page: 0,
    });

    // r4 should not appear in suggestions
    const ids = result.suggestions.map((s) => s.id);
    expect(ids).not.toContain("r4");
  });

  it("sorts by score descending, then grade descending as tiebreaker", () => {
    // weakStyles = overhang. knownStyles = slab, overhang.
    // r1 "Easy Slab" — tags: [slab] → score 0 (strong), grade 6
    // r2 "Overhang Problem" — tags: [overhang, crimpy] → score 1 (weak) + 2 (novel) = 3, grade 8
    // r3 "Dyno King" — tags: [dyno] → score 2 (novel), grade 10
    const result = scoreSuggestions({
      candidates,
      sentRouteIds: new Set(["r4"]),
      weakStyles: new Set(["overhang"]),
      knownStyles: new Set(["slab", "overhang"]),
      page: 0,
    });

    expect(result.suggestions.map((s) => s.id)).toEqual(["r2", "r3", "r1"]);
    expect(result.suggestions[0].score).toBe(3);
    expect(result.suggestions[1].score).toBe(2);
    expect(result.suggestions[2].score).toBe(0);
  });

  it("paginates results with default page size", () => {
    // Create more candidates than DEFAULT_SUGGESTION_PAGE_SIZE
    const manyCandidates: CandidateRoute[] = Array.from(
      { length: 12 },
      (_, i) => ({
        id: `route-${i}`,
        name: `Route ${i}`,
        canonical_grade: 10,
        color: null,
        status: "active" as const,
        tags: ["slab"],
      })
    );

    const result = scoreSuggestions({
      candidates: manyCandidates,
      sentRouteIds: new Set(),
      weakStyles: new Set(),
      knownStyles: new Set(),
      page: 0,
    });

    expect(result.suggestions).toHaveLength(DEFAULT_SUGGESTION_PAGE_SIZE);
    expect(result.hasMore).toBe(true);
  });

  it("returns hasMore=false when all results fit on one page", () => {
    const result = scoreSuggestions({
      candidates: candidates.slice(0, 2),
      sentRouteIds: new Set(),
      weakStyles: new Set(),
      knownStyles: new Set(),
      page: 0,
    });

    expect(result.suggestions).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });

  it("returns second page of results", () => {
    // 12 candidates, page size 8 → page 0 has 8, page 1 has 4
    const manyCandidates: CandidateRoute[] = Array.from(
      { length: 12 },
      (_, i) => ({
        id: `route-${i}`,
        name: `Route ${i}`,
        canonical_grade: 10,
        color: null,
        status: "active" as const,
        tags: ["slab"],
      })
    );

    const result = scoreSuggestions({
      candidates: manyCandidates,
      sentRouteIds: new Set(),
      weakStyles: new Set(),
      knownStyles: new Set(),
      page: 1,
    });

    expect(result.suggestions).toHaveLength(4);
    expect(result.hasMore).toBe(false);
  });

  it("returns empty suggestions when all candidates are already sent", () => {
    const result = scoreSuggestions({
      candidates,
      sentRouteIds: new Set(["r1", "r2", "r3", "r4"]),
      weakStyles: new Set(),
      knownStyles: new Set(),
      page: 0,
    });

    expect(result.suggestions).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it("returns empty suggestions when candidates list is empty", () => {
    const result = scoreSuggestions({
      candidates: [],
      sentRouteIds: new Set(),
      weakStyles: new Set(),
      knownStyles: new Set(),
      page: 0,
    });

    expect(result.suggestions).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it("exports the expected constants", () => {
    expect(DEFAULT_SUGGESTION_PAGE_SIZE).toBe(8);
    expect(SUGGESTION_GRADE_RANGE).toBe(2);
  });
});
