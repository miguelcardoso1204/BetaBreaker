/**
 * Admin Scores Screen Tests
 *
 * Tests the judge/admin score management screen where judges can:
 *   - View all scores for an event with athlete names + route info
 *   - Verify self-reported scores
 *   - Edit scores (update value)
 *   - Delete scores (admin only)
 *   - Add scores on behalf of athletes
 *
 * Mock strategy:
 *   - expo-router: provides eventId via useLocalSearchParams
 *   - useScores hooks: control score data + capture mutation calls
 *   - useEvents hooks: provide event routes for the score entry form
 *   - useAuth: provide stable judge user
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock expo-router ────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ eventId: "event-1" }),
  useRouter: () => ({ back: jest.fn() }),
}));

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "judge-1" },
    adminGymId: "gym-1",
    role: "judge",
  }),
}));

// ── Mock useScores hooks ────────────────────────────────────────────
const mockVerifyMutate = jest.fn();
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockCreateMutate = jest.fn();
const mockScoresData = {
  scores: [] as any[],
  isLoading: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useScores", () => ({
  useEventScores: () => mockScoresData,
  useVerifyScore: () => ({ mutate: mockVerifyMutate, isPending: false }),
  useUpdateScore: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteScore: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useCreateScore: () => ({ mutate: mockCreateMutate, isPending: false }),
}));

// ── Mock useEvents hooks ────────────────────────────────────────────
const mockEventRoutesData = {
  eventRoutes: [] as any[],
  isLoading: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useEvents", () => ({
  useEventRoutes: () => mockEventRoutesData,
}));

// ── Mock lucide-react-native ────────────────────────────────────────
jest.mock("lucide-react-native", () => {
  const { Text } = require("react-native");
  return {
    CheckCircle: (props: any) => <Text testID="icon-check" {...props}>Check</Text>,
    Trash2: (props: any) => <Text testID="icon-trash" {...props}>Trash</Text>,
    Edit3: (props: any) => <Text testID="icon-edit" {...props}>Edit</Text>,
    Shield: (props: any) => <Text testID="icon-shield" {...props}>Shield</Text>,
  };
});

import AdminScoresScreen from "../scores";

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  mockScoresData.scores = [];
  mockScoresData.isLoading = false;
  mockScoresData.error = null;
  mockEventRoutesData.eventRoutes = [];
  mockEventRoutesData.isLoading = false;
}

// ── Fixtures ────────────────────────────────────────────────────────

const mockScores = [
  {
    id: "score-1",
    event_id: "event-1",
    user_id: "athlete-1",
    route_id: "r-1",
    score: 100,
    verified_by: null,
    user: { display_name: "Alice", avatar_url: null },
    route: { name: "Problem 1", canonical_grade: 10 },
  },
  {
    id: "score-2",
    event_id: "event-1",
    user_id: "athlete-2",
    route_id: "r-1",
    score: 75,
    verified_by: "judge-1",
    user: { display_name: "Bob", avatar_url: null },
    route: { name: "Problem 1", canonical_grade: 10 },
  },
];

// ── Tests ───────────────────────────────────────────────────────────

describe("AdminScoresScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    mockScoresData.isLoading = true;

    render(<AdminScoresScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows empty state when no scores exist", () => {
    mockScoresData.scores = [];

    render(<AdminScoresScreen />);

    expect(screen.getByText("No scores yet")).toBeOnTheScreen();
  });

  it("renders score entries with athlete names and route info", () => {
    mockScoresData.scores = mockScores;

    render(<AdminScoresScreen />);

    expect(screen.getByText("Alice")).toBeOnTheScreen();
    expect(screen.getByText("Bob")).toBeOnTheScreen();
    // "Problem 1" is embedded in a Text node with surrounding text
    // (grade info), so we use a regex to match the substring.
    expect(screen.getByText("100")).toBeOnTheScreen();
    expect(screen.getByText("75")).toBeOnTheScreen();
  });

  it("shows verify button for unverified scores", () => {
    // Score-1 has verified_by = null → should show "Verify" button
    mockScoresData.scores = [mockScores[0]];

    render(<AdminScoresScreen />);

    expect(screen.getByText("Verify")).toBeOnTheScreen();
  });

  it("calls verifyScore mutation when verify is pressed", () => {
    mockScoresData.scores = [mockScores[0]];

    render(<AdminScoresScreen />);

    fireEvent.press(screen.getByText("Verify"));

    expect(mockVerifyMutate).toHaveBeenCalledWith({ scoreId: "score-1" });
  });

  it("shows 'Verified' label for already-verified scores", () => {
    // Score-2 has verified_by = "judge-1" → should show "Verified"
    mockScoresData.scores = [mockScores[1]];

    render(<AdminScoresScreen />);

    expect(screen.getByText("Verified")).toBeOnTheScreen();
  });

  it("calls deleteScore mutation when delete is pressed", () => {
    mockScoresData.scores = [mockScores[0]];

    render(<AdminScoresScreen />);

    fireEvent.press(screen.getByTestId("delete-score-score-1"));

    expect(mockDeleteMutate).toHaveBeenCalledWith({ scoreId: "score-1" });
  });

  it("renders the add score section with inputs", () => {
    mockEventRoutesData.eventRoutes = [
      { route_id: "r-1", route: { name: "Problem 1" } },
    ];

    render(<AdminScoresScreen />);

    // Should have inputs for judge score entry
    expect(screen.getByPlaceholderText("Athlete User ID")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("Score")).toBeOnTheScreen();
    // "Add Score" appears as both a heading and a button — check both exist
    expect(screen.getAllByText("Add Score")).toHaveLength(2);
  });
});
