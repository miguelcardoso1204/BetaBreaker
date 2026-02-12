/**
 * Event Detail Screen Tests (Athlete View)
 *
 * Tests the public event screen where athletes browse event routes
 * and submit scores. Shows event info, routes with score status,
 * and inline score entry for unscored routes.
 *
 * Mock strategy:
 *   - expo-router: provides eventId via useLocalSearchParams
 *   - useEvents hooks: provide event data + routes
 *   - useScores hooks: provide user's scores + create mutation
 *   - useAuth: provide stable athlete user
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

// ── Mock expo-router ────────────────────────────────────────────────
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({ back: mockBack }),
}));

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "athlete-1", homeGymId: "gym-1" },
    role: "climber",
  }),
}));

// ── Mock useEvents hooks ────────────────────────────────────────────
const mockEventData = {
  event: null as any | null,
  isLoading: false,
  error: null as Error | null,
};
const mockRoutesData = {
  eventRoutes: [] as any[],
  isLoading: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useEvents", () => ({
  useEvent: () => mockEventData,
  useEventRoutes: () => mockRoutesData,
}));

// ── Mock useScores hooks ────────────────────────────────────────────
const mockCreateScoreMutate = jest.fn();
const mockUserScoresData = {
  scores: [] as any[],
  isLoading: false,
  error: null as Error | null,
};

jest.mock("@/hooks/useScores", () => ({
  useUserEventScores: () => mockUserScoresData,
  useCreateScore: () => ({
    mutate: mockCreateScoreMutate,
    isPending: false,
  }),
}));

// ── Mock lucide-react-native ────────────────────────────────────────
jest.mock("lucide-react-native", () => {
  const { Text } = require("react-native");
  return {
    CheckCircle: (props: any) => <Text testID="icon-check" {...props}>Check</Text>,
    Clock: (props: any) => <Text testID="icon-clock" {...props}>Clock</Text>,
    Trophy: (props: any) => <Text testID="icon-trophy" {...props}>Trophy</Text>,
    Send: (props: any) => <Text testID="icon-send" {...props}>Send</Text>,
  };
});

import EventDetailScreen from "../[id]";

// ── Fixtures ────────────────────────────────────────────────────────

const mockEvent = {
  id: "event-1",
  gym_id: "gym-1",
  name: "Spring Comp",
  scoring_model: "points",
  start_date: "2026-03-01T09:00:00Z",
  end_date: "2026-03-01T18:00:00Z",
  status: "ongoing",
};

const mockRoutes = [
  {
    route_id: "r-1",
    sort_order: 0,
    route: { name: "Problem 1", canonical_grade: 10, color: "red" },
  },
  {
    route_id: "r-2",
    sort_order: 1,
    route: { name: "Problem 2", canonical_grade: 15, color: "blue" },
  },
];

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  mockEventData.event = null;
  mockEventData.isLoading = false;
  mockEventData.error = null;
  mockRoutesData.eventRoutes = [];
  mockRoutesData.isLoading = false;
  mockUserScoresData.scores = [];
  mockUserScoresData.isLoading = false;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("EventDetailScreen (Athlete)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    mockEventData.isLoading = true;

    render(<EventDetailScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows event not found when event is null", () => {
    mockEventData.event = null;

    render(<EventDetailScreen />);

    expect(screen.getByText("Event not found")).toBeOnTheScreen();
  });

  it("renders event name and status when loaded", () => {
    mockEventData.event = mockEvent;

    render(<EventDetailScreen />);

    expect(screen.getByText("Spring Comp")).toBeOnTheScreen();
    expect(screen.getByText("ongoing")).toBeOnTheScreen();
  });

  it("renders event routes list", () => {
    mockEventData.event = mockEvent;
    mockRoutesData.eventRoutes = mockRoutes;

    render(<EventDetailScreen />);

    expect(screen.getByText("Problem 1")).toBeOnTheScreen();
    expect(screen.getByText("Problem 2")).toBeOnTheScreen();
  });

  it("shows existing score for a route as read-only", () => {
    mockEventData.event = mockEvent;
    mockRoutesData.eventRoutes = mockRoutes;
    // Athlete already scored Problem 1
    mockUserScoresData.scores = [
      {
        id: "score-1",
        route_id: "r-1",
        score: 100,
        verified_by: null,
      },
    ];

    render(<EventDetailScreen />);

    // Should show the score value for Problem 1
    expect(screen.getByText("100")).toBeOnTheScreen();
  });

  it("shows verified badge when score is verified", () => {
    mockEventData.event = mockEvent;
    mockRoutesData.eventRoutes = [mockRoutes[0]];
    mockUserScoresData.scores = [
      {
        id: "score-1",
        route_id: "r-1",
        score: 100,
        verified_by: "judge-1",
      },
    ];

    render(<EventDetailScreen />);

    expect(screen.getByText("Verified")).toBeOnTheScreen();
  });

  it("shows score input for unscored routes", () => {
    mockEventData.event = mockEvent;
    mockRoutesData.eventRoutes = [mockRoutes[0]];
    mockUserScoresData.scores = []; // No scores yet

    render(<EventDetailScreen />);

    // Should have a text input for score entry
    expect(screen.getByPlaceholderText("Score")).toBeOnTheScreen();
  });

  it("calls createScore mutation on submit", () => {
    mockEventData.event = mockEvent;
    mockRoutesData.eventRoutes = [mockRoutes[0]];
    mockUserScoresData.scores = [];

    render(<EventDetailScreen />);

    // Enter a score
    fireEvent.changeText(screen.getByPlaceholderText("Score"), "150");
    // Press submit
    fireEvent.press(screen.getByTestId("submit-score-r-1"));

    expect(mockCreateScoreMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        routeId: "r-1",
        score: 150,
      }),
      expect.anything()
    );
  });
});
