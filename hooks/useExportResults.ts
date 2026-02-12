/**
 * useExportResults Hook — File Generation & Sharing for Competition Results
 *
 * Provides imperative callbacks (`exportCSV`, `exportPDF`) that:
 *   1. Generate content from ranked entries (pure functions in utils)
 *   2. Write the content to a temporary file (expo-file-system / expo-print)
 *   3. Open the native share sheet (expo-sharing) so users can save, email, AirDrop, etc.
 *
 * WHY NOT A TANSTACK QUERY MUTATION?
 * These operations don't change server state — they're purely local file I/O
 * followed by a share sheet. A simple useState for `isExporting` is sufficient.
 * TanStack mutations are for server-state changes that need cache invalidation.
 *
 * WHY SEPARATE FROM THE UTILS?
 * The pure functions (generateCSV, generateResultsHTML) are testable without
 * any mocks. This hook isolates the native module calls (FileSystem, Sharing,
 * Print) so they can be mocked independently in hook tests.
 *
 * EXPO FILE SYSTEM API (SDK 54):
 * The new API uses `File` and `Paths` classes instead of the legacy
 * `cacheDirectory` / `writeAsStringAsync` functions. `file.write()` is
 * synchronous — it writes directly to the native filesystem.
 *
 * USAGE:
 *   const { exportCSV, exportPDF, isExporting } = useExportResults();
 *   <Button onPress={() => exportCSV({ eventName, ... })} disabled={isExporting} />
 */

import { useCallback, useState } from "react";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";

import {
  generateCSV,
  generateResultsHTML,
  type CategorySection,
} from "@/utils/exportResults";
import type { RankedCompetitionEntry } from "@/utils/competitionScoring";
import type { ScoringModel } from "@/services/events.service";

// ── Types ──────────────────────────────────────────────────────────────

/** Parameters shared by both CSV and PDF export functions. */
export interface ExportParams {
  eventName: string;
  startDate: string;
  endDate: string;
  scoringModel: ScoringModel;
  allRanked: RankedCompetitionEntry[];
  categorySections?: CategorySection[];
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useExportResults() {
  // Tracks whether an export is in progress to prevent double-taps.
  // Not using useRef because we want the UI to re-render (disable buttons).
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Generate a CSV file from results and open the share sheet.
   *
   * Steps:
   *   1. Call the pure generateCSV() to build the CSV string
   *   2. Write it to a temp file in the app's cache directory
   *   3. Open the native share sheet with the file URI
   */
  const exportCSV = useCallback(async (params: ExportParams) => {
    setIsExporting(true);
    try {
      // Step 1: Generate CSV content (pure function, no I/O)
      const csv = generateCSV(
        params.eventName,
        params.startDate,
        params.endDate,
        params.scoringModel,
        params.allRanked,
        params.categorySections
      );

      // Step 2: Write to a temp file. Paths.cache is the OS-managed cache
      // directory — cleaned automatically when storage is low.
      // File.write() is synchronous in expo-file-system SDK 54.
      const file = new File(Paths.cache, "results.csv");
      file.write(csv);

      // Step 3: Open share sheet — user can save to files, email, AirDrop, etc.
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Share Results (CSV)",
      });
    } catch (_error) {
      // Share sheet dismissal or cancellation throws on some platforms.
      // Silently catch — the user already sees the share sheet close.
    } finally {
      setIsExporting(false);
    }
  }, []);

  /**
   * Generate a PDF from results and open the share sheet.
   *
   * Steps:
   *   1. Call the pure generateResultsHTML() to build an HTML document
   *   2. Pass it to expo-print which renders HTML → PDF natively
   *   3. Open the native share sheet with the PDF file URI
   */
  const exportPDF = useCallback(async (params: ExportParams) => {
    setIsExporting(true);
    try {
      // Step 1: Generate HTML content (pure function, no I/O)
      const html = generateResultsHTML(
        params.eventName,
        params.startDate,
        params.endDate,
        params.scoringModel,
        params.allRanked,
        params.categorySections
      );

      // Step 2: expo-print renders the HTML into a PDF file and returns its URI.
      // This uses the platform's native WebView rendering engine under the hood.
      const { uri } = await Print.printToFileAsync({ html });

      // Step 3: Share the PDF
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Results (PDF)",
      });
    } catch (_error) {
      // Same as CSV — share sheet dismissal can throw
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportCSV, exportPDF, isExporting };
}
