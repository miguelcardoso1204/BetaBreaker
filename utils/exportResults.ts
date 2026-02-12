/**
 * Export Results Utils — CSV & HTML Generation for Competition Results
 *
 * Pure functions that transform ranked competition entries into export
 * formats (CSV string, HTML document). Zero side effects — no file system
 * access, no native modules. That makes them trivially testable.
 *
 * DATA FLOW:
 *   Ranked entries from aggregateScores() + rankCompetitionEntries()
 *     → generateCSV()         → CSV string → written to file by hook
 *     → generateResultsHTML() → HTML string → rendered to PDF by expo-print
 *
 * WHY PURE FUNCTIONS?
 * Separating data formatting (pure) from I/O (hook with native modules)
 * lets us test CSV/HTML generation with zero mocks. The hook layer handles
 * file writing and share sheet — tested separately with mocked natives.
 *
 * CSV FORMAT:
 * Follows RFC 4180 — fields containing commas or double quotes are
 * enclosed in double quotes, with internal quotes escaped by doubling.
 *
 * HTML/PDF FORMAT:
 * expo-print.printToFileAsync({ html }) renders standalone HTML to PDF.
 * No external stylesheets allowed — all styles must be inline or in a
 * <style> block within the document.
 */

import type { RankedCompetitionEntry } from "@/utils/competitionScoring";
import type { ScoringModel } from "@/services/events.service";

// ── Types ──────────────────────────────────────────────────────────────

/** A category section with its own re-ranked entries. */
export interface CategorySection {
  name: string;
  entries: RankedCompetitionEntry[];
}

// ── Scoring Model Labels ───────────────────────────────────────────────

/** Human-readable labels matching the scoreboard screen's SCORING_LABELS. */
const SCORING_LABELS: Record<ScoringModel, string> = {
  tops_and_zones: "Tops & Zones",
  points: "Points",
  thousand_divide_by: "1000/Attempts",
  redpoint: "Redpoint",
};

// ── CSV Generation ─────────────────────────────────────────────────────

/**
 * Escapes a string for CSV according to RFC 4180.
 *
 * Rules:
 * - If the value contains a comma, double quote, or newline, wrap it in quotes
 * - Any double quotes inside the value are escaped by doubling them
 *
 * @param value - Raw string to escape
 * @returns CSV-safe string
 */
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    // Double any existing quotes, then wrap the whole thing in quotes
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generates a CSV string from ranked competition results.
 *
 * Structure:
 *   - Header rows: event name, date range, scoring model
 *   - Blank separator line
 *   - "All Results" section with column headers + data rows
 *   - Per-category sections (if provided): section header + column headers + data rows
 *
 * @param eventName      - Competition name
 * @param startDate      - ISO date string (YYYY-MM-DD)
 * @param endDate        - ISO date string (YYYY-MM-DD)
 * @param scoringModel   - Scoring model key (e.g., "points")
 * @param allRanked      - All entries ranked across all categories
 * @param categorySections - Optional per-category sections with re-ranked entries
 * @returns Complete CSV string ready to write to a file
 */
export function generateCSV(
  eventName: string,
  startDate: string,
  endDate: string,
  scoringModel: ScoringModel,
  allRanked: RankedCompetitionEntry[],
  categorySections?: CategorySection[]
): string {
  const lines: string[] = [];

  // ── Event metadata header ──────────────────────────────────────────
  lines.push(`Event,${escapeCSV(eventName)}`);
  lines.push(`Start Date,${startDate}`);
  lines.push(`End Date,${endDate}`);
  lines.push(`Scoring Model,${SCORING_LABELS[scoringModel]}`);
  lines.push(""); // blank separator

  // ── All Results section ────────────────────────────────────────────
  lines.push("All Results");
  lines.push("Rank,Name,Score,Routes");
  for (const entry of allRanked) {
    lines.push(
      `${entry.rank},${escapeCSV(entry.displayName)},${entry.totalScore},${entry.routeCount}`
    );
  }

  // ── Per-category sections ──────────────────────────────────────────
  if (categorySections && categorySections.length > 0) {
    for (const section of categorySections) {
      lines.push(""); // blank separator before each category
      lines.push(section.name);
      lines.push("Rank,Name,Score,Routes");
      for (const entry of section.entries) {
        lines.push(
          `${entry.rank},${escapeCSV(entry.displayName)},${entry.totalScore},${entry.routeCount}`
        );
      }
    }
  }

  return lines.join("\n");
}

// ── HTML/PDF Generation ────────────────────────────────────────────────

/**
 * Builds an HTML table string from ranked entries.
 *
 * Extracted as a helper because both the "All Results" table and each
 * category table use the same column structure.
 */
function buildResultsTable(entries: RankedCompetitionEntry[]): string {
  const rows = entries
    .map(
      (e) => `
      <tr>
        <td style="text-align:center;padding:6px 12px;">${e.rank}</td>
        <td style="padding:6px 12px;">${escapeHTML(e.displayName)}</td>
        <td style="text-align:center;padding:6px 12px;">${e.totalScore}</td>
        <td style="text-align:center;padding:6px 12px;">${e.routeCount}</td>
      </tr>`
    )
    .join("");

  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#2d2d2d;">
          <th style="text-align:center;padding:8px 12px;color:#a78bfa;">Rank</th>
          <th style="text-align:left;padding:8px 12px;color:#a78bfa;">Name</th>
          <th style="text-align:center;padding:8px 12px;color:#a78bfa;">Score</th>
          <th style="text-align:center;padding:8px 12px;color:#a78bfa;">Routes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Escapes HTML special characters to prevent XSS in generated documents.
 *
 * Even though this HTML is rendered locally (not served to browsers),
 * unescaped user names with < or & could break the HTML structure.
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generates a standalone HTML document for PDF rendering via expo-print.
 *
 * The HTML includes:
 *   - Inline <style> block (expo-print can't load external stylesheets)
 *   - Event header: name, date range, scoring model
 *   - "All Results" table with rank, name, score, routes
 *   - Per-category tables (if categories provided)
 *   - Dark-themed styling to match the app's visual identity
 *
 * @param eventName      - Competition name
 * @param startDate      - ISO date string
 * @param endDate        - ISO date string
 * @param scoringModel   - Scoring model key
 * @param allRanked      - All entries ranked across all categories
 * @param categorySections - Optional per-category sections
 * @returns Complete HTML document string
 */
export function generateResultsHTML(
  eventName: string,
  startDate: string,
  endDate: string,
  scoringModel: ScoringModel,
  allRanked: RankedCompetitionEntry[],
  categorySections?: CategorySection[]
): string {
  // ── Category sections HTML ─────────────────────────────────────────
  const categoryHTML = categorySections
    ? categorySections
        .map(
          (section) => `
        <h2 style="color:#a78bfa;margin:24px 0 8px;font-size:18px;">${escapeHTML(section.name)}</h2>
        ${buildResultsTable(section.entries)}`
        )
        .join("")
    : "";

  // ── Full HTML document ─────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      margin: 0;
      padding: 24px;
    }
    h1 { color: #ffffff; margin: 0 0 4px; font-size: 24px; }
    .subtitle { color: #9ca3af; font-size: 14px; margin-bottom: 24px; }
    h2 { border-bottom: 1px solid #374151; padding-bottom: 4px; }
    table { font-size: 14px; }
    thead th { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    tbody tr:nth-child(odd) { background: #1f1f38; }
    tbody tr:nth-child(even) { background: #16162a; }
    .footer { margin-top: 32px; color: #6b7280; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <h1>${escapeHTML(eventName)}</h1>
  <div class="subtitle">${startDate} — ${endDate} · ${SCORING_LABELS[scoringModel]}</div>

  <h2 style="color:#a78bfa;margin:0 0 8px;font-size:18px;">All Results</h2>
  ${buildResultsTable(allRanked)}

  ${categoryHTML}

  <div class="footer">Generated by Beta Breaker</div>
</body>
</html>`;
}
