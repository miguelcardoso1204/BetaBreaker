/**
 * Export Results Utils Tests — CSV & HTML Generation
 *
 * Tests the pure functions that generate CSV strings and HTML documents
 * from ranked competition entries. These functions have zero side effects
 * (no file system, no native modules) — they take data in, return strings.
 *
 * Test categories:
 *   - generateCSV: header rows, data rows, CSV escaping, category sections
 *   - generateResultsHTML: structure, event header, tables, categories
 */

import type { RankedCompetitionEntry } from "@/utils/competitionScoring";
import type { ScoringModel } from "@/services/events.service";

// Import the functions under test — will fail until implementation exists
import { generateCSV, generateResultsHTML } from "@/utils/exportResults";

// ── Fixtures ──────────────────────────────────────────────────────────

const rankedEntries: RankedCompetitionEntry[] = [
  { userId: "u1", totalScore: 500, routeCount: 5, displayName: "Alice", avatarUrl: null, rank: 1 },
  { userId: "u2", totalScore: 350, routeCount: 4, displayName: "Bob", avatarUrl: null, rank: 2 },
  { userId: "u3", totalScore: 200, routeCount: 3, displayName: "Carol", avatarUrl: null, rank: 3 },
];

/** Category sections: each has a name and its own ranked entries (re-ranked). */
const categorySections = [
  {
    name: "Men Open",
    entries: [
      { userId: "u1", totalScore: 500, routeCount: 5, displayName: "Alice", avatarUrl: null, rank: 1 },
      { userId: "u3", totalScore: 200, routeCount: 3, displayName: "Carol", avatarUrl: null, rank: 2 },
    ] as RankedCompetitionEntry[],
  },
  {
    name: "Women Open",
    entries: [
      { userId: "u2", totalScore: 350, routeCount: 4, displayName: "Bob", avatarUrl: null, rank: 1 },
    ] as RankedCompetitionEntry[],
  },
];

const eventName = "Spring Bouldering Comp";
const startDate = "2026-03-01";
const endDate = "2026-03-02";
const scoringModel: ScoringModel = "points";

// ── generateCSV tests ─────────────────────────────────────────────────

describe("generateCSV", () => {
  it("includes event metadata in header rows", () => {
    const csv = generateCSV(eventName, startDate, endDate, scoringModel, rankedEntries);

    expect(csv).toContain("Spring Bouldering Comp");
    expect(csv).toContain("2026-03-01");
    expect(csv).toContain("2026-03-02");
    expect(csv).toContain("Points");
  });

  it("includes column headers for the results table", () => {
    const csv = generateCSV(eventName, startDate, endDate, scoringModel, rankedEntries);

    expect(csv).toContain("Rank,Name,Score,Routes");
  });

  it("includes all ranked entries as data rows", () => {
    const csv = generateCSV(eventName, startDate, endDate, scoringModel, rankedEntries);

    expect(csv).toContain("1,Alice,500,5");
    expect(csv).toContain("2,Bob,350,4");
    expect(csv).toContain("3,Carol,200,3");
  });

  it("escapes commas in display names by quoting the field", () => {
    const entriesWithComma: RankedCompetitionEntry[] = [
      { userId: "u1", totalScore: 100, routeCount: 2, displayName: "Last, First", avatarUrl: null, rank: 1 },
    ];

    const csv = generateCSV(eventName, startDate, endDate, scoringModel, entriesWithComma);

    // CSV spec: fields containing commas must be enclosed in double quotes
    expect(csv).toContain('"Last, First"');
  });

  it("escapes double quotes in display names by doubling them", () => {
    const entriesWithQuote: RankedCompetitionEntry[] = [
      { userId: "u1", totalScore: 100, routeCount: 2, displayName: 'The "Crusher"', avatarUrl: null, rank: 1 },
    ];

    const csv = generateCSV(eventName, startDate, endDate, scoringModel, entriesWithQuote);

    // CSV spec: double quotes inside a quoted field are escaped by doubling
    expect(csv).toContain('"The ""Crusher"""');
  });

  it("includes category sections when provided", () => {
    const csv = generateCSV(
      eventName, startDate, endDate, scoringModel,
      rankedEntries, categorySections
    );

    // Should have both the "All Results" section and category sections
    expect(csv).toContain("All Results");
    expect(csv).toContain("Men Open");
    expect(csv).toContain("Women Open");
  });

  it("returns valid CSV with no entries", () => {
    const csv = generateCSV(eventName, startDate, endDate, scoringModel, []);

    // Should still have header metadata and column headers, just no data rows
    expect(csv).toContain("Spring Bouldering Comp");
    expect(csv).toContain("Rank,Name,Score,Routes");
  });
});

// ── generateResultsHTML tests ─────────────────────────────────────────

describe("generateResultsHTML", () => {
  it("returns a complete HTML document", () => {
    const html = generateResultsHTML(eventName, startDate, endDate, scoringModel, rankedEntries);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes event name and scoring model in the header", () => {
    const html = generateResultsHTML(eventName, startDate, endDate, scoringModel, rankedEntries);

    expect(html).toContain("Spring Bouldering Comp");
    expect(html).toContain("Points");
  });

  it("includes a results table with all entries", () => {
    const html = generateResultsHTML(eventName, startDate, endDate, scoringModel, rankedEntries);

    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("Carol");
    expect(html).toContain("500");
    expect(html).toContain("350");
  });

  it("includes category sections when provided", () => {
    const html = generateResultsHTML(
      eventName, startDate, endDate, scoringModel,
      rankedEntries, categorySections
    );

    expect(html).toContain("Men Open");
    expect(html).toContain("Women Open");
  });

  it("includes inline CSS for standalone rendering", () => {
    const html = generateResultsHTML(eventName, startDate, endDate, scoringModel, rankedEntries);

    // expo-print renders standalone HTML, so styles must be inline or in <style>
    expect(html).toContain("<style");
  });
});
