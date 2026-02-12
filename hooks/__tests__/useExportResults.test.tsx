/**
 * useExportResults Hook Tests
 *
 * Tests the hook that orchestrates file generation and sharing for
 * competition result exports (CSV and PDF).
 *
 * Mock strategy:
 *   - expo-file-system: mocked File class (captures write calls) + Paths.cache
 *   - expo-sharing: mocked shareAsync (captures share sheet calls)
 *   - expo-print: mocked printToFileAsync (returns a fake PDF URI)
 *   - utils/exportResults: mocked generateCSV and generateResultsHTML
 *     (pure functions tested separately — here we just verify they're called)
 *
 * WHY renderHook?
 * useExportResults is a plain custom hook (no TanStack Query, no providers).
 * renderHook from @testing-library/react-native lets us call the hook
 * outside of a component and inspect its return values.
 */

import { renderHook, act } from "@testing-library/react-native";

// ── Mock expo-file-system (SDK 54 class-based API) ───────────────────
// The hook does `new File(Paths.cache, "results.csv")` then `file.write(csv)`.
// We mock File as a class that records .write() calls and exposes a .uri.
const mockFileWrite = jest.fn();
jest.mock("expo-file-system", () => {
  return {
    File: class MockFile {
      uri: string;
      constructor(...uris: string[]) {
        // Join path segments like the real implementation
        this.uri = uris.join("/");
      }
      write = mockFileWrite;
    },
    Paths: {
      cache: { uri: "file:///cache" },
    },
  };
});

// ── Mock expo-sharing ─────────────────────────────────────────────────
const mockShareAsync = jest.fn().mockResolvedValue(undefined);
jest.mock("expo-sharing", () => ({
  shareAsync: (...args: any[]) => mockShareAsync(...args),
}));

// ── Mock expo-print ───────────────────────────────────────────────────
const mockPrintToFileAsync = jest.fn().mockResolvedValue({ uri: "file:///cache/results.pdf" });
jest.mock("expo-print", () => ({
  printToFileAsync: (...args: any[]) => mockPrintToFileAsync(...args),
}));

// ── Mock export utils ─────────────────────────────────────────────────
const mockGenerateCSV = jest.fn().mockReturnValue("csv-content");
const mockGenerateResultsHTML = jest.fn().mockReturnValue("<html>pdf</html>");
jest.mock("@/utils/exportResults", () => ({
  generateCSV: (...args: any[]) => mockGenerateCSV(...args),
  generateResultsHTML: (...args: any[]) => mockGenerateResultsHTML(...args),
}));

// Import after mocks
import { useExportResults } from "@/hooks/useExportResults";

// ── Fixtures ──────────────────────────────────────────────────────────

const exportParams = {
  eventName: "Spring Comp",
  startDate: "2026-03-01",
  endDate: "2026-03-02",
  scoringModel: "points" as const,
  allRanked: [
    { userId: "u1", totalScore: 500, routeCount: 5, displayName: "Alice", avatarUrl: null, rank: 1 },
  ],
  categorySections: undefined,
};

// ── Tests ─────────────────────────────────────────────────────────────

describe("useExportResults", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default implementations after tests that override them
    // (clearAllMocks resets calls/results but NOT implementations)
    mockShareAsync.mockResolvedValue(undefined);
    mockPrintToFileAsync.mockResolvedValue({ uri: "file:///cache/results.pdf" });
    mockGenerateCSV.mockReturnValue("csv-content");
    mockGenerateResultsHTML.mockReturnValue("<html>pdf</html>");
  });

  it("returns exportCSV, exportPDF, and isExporting", () => {
    const { result } = renderHook(() => useExportResults());

    expect(typeof result.current.exportCSV).toBe("function");
    expect(typeof result.current.exportPDF).toBe("function");
    expect(result.current.isExporting).toBe(false);
  });

  it("exportCSV writes a CSV file and opens the share sheet", async () => {
    const { result } = renderHook(() => useExportResults());

    await act(async () => {
      await result.current.exportCSV(exportParams);
    });

    // generateCSV should be called with the export params
    expect(mockGenerateCSV).toHaveBeenCalledWith(
      "Spring Comp", "2026-03-01", "2026-03-02", "points",
      exportParams.allRanked, undefined
    );

    // Should write the CSV string via File.write()
    expect(mockFileWrite).toHaveBeenCalledWith("csv-content");

    // Should open the native share sheet with the file URI
    expect(mockShareAsync).toHaveBeenCalledWith(
      expect.stringContaining("results.csv"),
      expect.objectContaining({ mimeType: "text/csv" })
    );
  });

  it("exportPDF generates a PDF via expo-print and opens the share sheet", async () => {
    const { result } = renderHook(() => useExportResults());

    await act(async () => {
      await result.current.exportPDF(exportParams);
    });

    // generateResultsHTML should be called with the export params
    expect(mockGenerateResultsHTML).toHaveBeenCalledWith(
      "Spring Comp", "2026-03-01", "2026-03-02", "points",
      exportParams.allRanked, undefined
    );

    // Should pass the HTML to expo-print for PDF conversion
    expect(mockPrintToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ html: "<html>pdf</html>" })
    );

    // Should share the resulting PDF URI
    expect(mockShareAsync).toHaveBeenCalledWith(
      "file:///cache/results.pdf",
      expect.objectContaining({ mimeType: "application/pdf" })
    );
  });

  it("sets isExporting back to false after export completes", async () => {
    const { result } = renderHook(() => useExportResults());

    // Before export: not exporting
    expect(result.current.isExporting).toBe(false);

    await act(async () => {
      await result.current.exportCSV(exportParams);
    });

    // After export completes: back to not exporting
    expect(result.current.isExporting).toBe(false);
  });

  it("resets isExporting to false even if an error occurs", async () => {
    mockShareAsync.mockRejectedValueOnce(new Error("Share cancelled"));

    const { result } = renderHook(() => useExportResults());

    await act(async () => {
      // Should not throw — the hook catches the error
      await result.current.exportCSV(exportParams);
    });

    expect(result.current.isExporting).toBe(false);
  });

  it("passes categorySections through to the generate functions", async () => {
    const paramsWithCategories = {
      ...exportParams,
      categorySections: [
        {
          name: "Men Open",
          entries: exportParams.allRanked,
        },
      ],
    };

    const { result } = renderHook(() => useExportResults());

    await act(async () => {
      await result.current.exportCSV(paramsWithCategories);
    });

    expect(mockGenerateCSV).toHaveBeenCalledWith(
      "Spring Comp", "2026-03-01", "2026-03-02", "points",
      exportParams.allRanked, paramsWithCategories.categorySections
    );
  });
});
