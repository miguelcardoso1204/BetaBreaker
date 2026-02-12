/**
 * Live Scoreboard Screen Tests
 *
 * Tests the public scoreboard where athletes and spectators view
 * real-time competition rankings. Shows aggregated scores ranked
 * by 1224 competition rules, with category filtering.
 *
 * Mock strategy:
 *   - expo-router: provides eventId via useLocalSearchParams
 *   - useEvents hooks: provide event data + categories
 *   - useScores hooks: provide all event scores
 *   - useScoreboardRealtime: mocked as no-op (tested separately)
 *   - useAuth: provides current user for row highlighting
 *   - competitionScoring utils: mocked to control aggregation output
 *   - useExportResults: mocked to verify export button wiring
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock expo-router ─────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "event-1" }),
}));

// ── Mock useAuth ─────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

// ── Mock useScoreboardRealtime ───────────────────────────────────────
jest.mock("@/hooks/useScoreboardRealtime", () => ({
  useScoreboardRealtime: jest.fn(),
}));

// ── Mock useEvents hooks ─────────────────────────────────────────────
const mockEventData = {
  event: null as any | null,
  isLoading: false,
  error: null as Error | null,
};
const mockCategoriesData = {
  categories: [] as any[],
  isLoading: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useEvents", () => ({
  useEvent: () => mockEventData,
  useEventCategories: () => mockCategoriesData,
}));

// ── Mock useScores hooks ─────────────────────────────────────────────
const mockScoresData = {
  scores: [] as any[],
  isLoading: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useScores", () => ({
  useEventScores: () => mockScoresData,
}));

// ── Mock lucide-react-native ─────────────────────────────────────────
jest.mock("lucide-react-native", () => {
  const { Text } = require("react-native");
  return {
    Trophy: (props: any) => <Text testID="icon-trophy" {...props}>Trophy</Text>,
  };
});

// ── Mock expo-image ──────────────────────────────────────────────────
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="avatar-image" {...props} />,
  };
});

// ── Mock useExportResults ────────────────────────────────────────────
const mockExportCSV = jest.fn().mockResolvedValue(undefined);
const mockExportPDF = jest.fn().mockResolvedValue(undefined);
const mockExportData = {
  exportCSV: mockExportCSV,
  exportPDF: mockExportPDF,
  isExporting: false,
};

jest.mock("@/hooks/useExportResults", () => ({
  useExportResults: () => mockExportData,
}));

// ── Mock competitionScoring utils ────────────────────────────────────
// Mock the aggregation and ranking so tests control exactly what renders
const mockAggregateScores = jest.fn().mockReturnValue([]);
const mockRankCompetitionEntries = jest.fn().mockReturnValue([]);
const mockFormatCompetitionScore = jest.fn().mockImplementation((s) => `${s}`);

jest.mock("@/utils/competitionScoring", () => ({
  aggregateScores: (...args: any[]) => mockAggregateScores(...args),
  rankCompetitionEntries: (...args: any[]) => mockRankCompetitionEntries(...args),
  formatCompetitionScore: (...args: any[]) => mockFormatCompetitionScore(...args),
}));

// Import the screen AFTER all mocks are set up
import ScoreboardScreen from "../[id]/scoreboard";

// ── Fixtures ─────────────────────────────────────────────────────────

const mockEvent = {
  id: "event-1",
  gym_id: "gym-1",
  name: "Spring Bouldering Comp",
  scoring_model: "points",
  start_date: "2026-03-01",
  end_date: "2026-03-02",
  status: "ongoing",
};

const mockRankedEntries = [
  { userId: "user-2", totalScore: 500, routeCount: 5, displayName: "Alice", avatarUrl: null, rank: 1 },
  { userId: "user-1", totalScore: 350, routeCount: 4, displayName: "Bob", avatarUrl: null, rank: 2 },
  { userId: "user-3", totalScore: 200, routeCount: 3, displayName: "Carol", avatarUrl: null, rank: 3 },
];

// ── Helpers ──────────────────────────────────────────────────────────

function resetMockData() {
  mockEventData.event = null;
  mockEventData.isLoading = false;
  mockEventData.error = null;
  mockCategoriesData.categories = [];
  mockScoresData.scores = [];
  mockAggregateScores.mockReturnValue([]);
  mockRankCompetitionEntries.mockReturnValue([]);
}

// ── Tests ────────────────────────────────────────────────────────────

describe("ScoreboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading indicator when event is loading", () => {
    mockEventData.isLoading = true;

    render(<ScoreboardScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows error message when event fails to load", () => {
    mockEventData.error = new Error("Network failed");

    render(<ScoreboardScreen />);

    expect(screen.getByText("Network failed")).toBeOnTheScreen();
  });

  it("shows event name and scoring model in header", () => {
    mockEventData.event = mockEvent;

    render(<ScoreboardScreen />);

    expect(screen.getByText("Spring Bouldering Comp")).toBeOnTheScreen();
    expect(screen.getByText("Points")).toBeOnTheScreen();
  });

  it("renders ranked entries with rank, name, and score", () => {
    mockEventData.event = mockEvent;
    mockAggregateScores.mockReturnValue(mockRankedEntries);
    mockRankCompetitionEntries.mockReturnValue(mockRankedEntries);
    mockFormatCompetitionScore.mockImplementation((s) => `${s}`);

    render(<ScoreboardScreen />);

    expect(screen.getByText("#1")).toBeOnTheScreen();
    expect(screen.getByText("Alice")).toBeOnTheScreen();
    expect(screen.getByText("500")).toBeOnTheScreen();

    expect(screen.getByText("#2")).toBeOnTheScreen();
    expect(screen.getByText("Bob")).toBeOnTheScreen();
    expect(screen.getByText("350")).toBeOnTheScreen();
  });

  it("highlights the current user's row", () => {
    mockEventData.event = mockEvent;
    mockAggregateScores.mockReturnValue(mockRankedEntries);
    mockRankCompetitionEntries.mockReturnValue(mockRankedEntries);

    render(<ScoreboardScreen />);

    // The current user (user-1 = Bob) should have a highlighted row
    const bobRow = screen.getByTestId("scoreboard-row-user-1");
    expect(bobRow).toBeOnTheScreen();
  });

  it("shows empty state when no scores exist", () => {
    mockEventData.event = mockEvent;
    mockAggregateScores.mockReturnValue([]);
    mockRankCompetitionEntries.mockReturnValue([]);

    render(<ScoreboardScreen />);

    expect(screen.getByText("No scores yet")).toBeOnTheScreen();
  });

  it("renders category filter chips when categories exist", () => {
    mockEventData.event = mockEvent;
    mockCategoriesData.categories = [
      { id: "cat-1", name: "Men Open" },
      { id: "cat-2", name: "Women Open" },
    ];

    render(<ScoreboardScreen />);

    expect(screen.getByText("All")).toBeOnTheScreen();
    expect(screen.getByText("Men Open")).toBeOnTheScreen();
    expect(screen.getByText("Women Open")).toBeOnTheScreen();
  });

  it("passes category filter to aggregateScores when a category chip is pressed", () => {
    mockEventData.event = mockEvent;
    mockScoresData.scores = [{ id: "s1" }]; // non-empty so aggregation runs
    mockCategoriesData.categories = [
      { id: "cat-1", name: "Men Open" },
    ];
    mockAggregateScores.mockReturnValue([]);
    mockRankCompetitionEntries.mockReturnValue([]);

    render(<ScoreboardScreen />);

    // Press the "Men Open" chip
    fireEvent.press(screen.getByText("Men Open"));

    // aggregateScores should have been called with the category ID
    expect(mockAggregateScores).toHaveBeenCalledWith(
      expect.anything(),
      "cat-1"
    );
  });

  // ── Export button tests ─────────────────────────────────────────────

  it("renders CSV and PDF export buttons when event is loaded", () => {
    mockEventData.event = mockEvent;

    render(<ScoreboardScreen />);

    expect(screen.getByText("CSV")).toBeOnTheScreen();
    expect(screen.getByText("PDF")).toBeOnTheScreen();
  });

  it("calls exportCSV when CSV button is pressed", () => {
    mockEventData.event = mockEvent;
    mockAggregateScores.mockReturnValue(mockRankedEntries);
    mockRankCompetitionEntries.mockReturnValue(mockRankedEntries);

    render(<ScoreboardScreen />);

    fireEvent.press(screen.getByText("CSV"));

    expect(mockExportCSV).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Spring Bouldering Comp",
        scoringModel: "points",
      })
    );
  });

  it("calls exportPDF when PDF button is pressed", () => {
    mockEventData.event = mockEvent;
    mockAggregateScores.mockReturnValue(mockRankedEntries);
    mockRankCompetitionEntries.mockReturnValue(mockRankedEntries);

    render(<ScoreboardScreen />);

    fireEvent.press(screen.getByText("PDF"));

    expect(mockExportPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "Spring Bouldering Comp",
        scoringModel: "points",
      })
    );
  });
});
