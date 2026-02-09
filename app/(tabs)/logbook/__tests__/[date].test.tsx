/**
 * Session Detail Screen Tests
 *
 * Tests the per-date drill-down screen that shows:
 *   - SessionSummary card with aggregated stats + grade distribution
 *   - Individual ascent list with route names, grades, and status badges
 *
 * Mock strategy:
 *   - expo-router: useLocalSearchParams returns { date: "2026-02-09" }
 *   - @/hooks/useSessions: __mockData pattern for combined summary + ascents
 *   - @/components/session/SessionSummary: stub View with testID (tested separately)
 *   - lucide-react-native: icons as simple Views
 *   - @/utils/grades: controlled grade display string
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock expo-router — provide the date param via useLocalSearchParams.
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ date: "2026-02-09" }),
  useRouter: () => ({ back: jest.fn() }),
}));

// Mock useSessionDetail — control summary + ascents data.
jest.mock("@/hooks/useSessions", () => {
  const mockData = {
    data: null as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useSessionDetail: () => mockData,
    useSessionHistory: jest.fn(),
    __mockData: mockData,
  };
});

// Mock SessionSummary — replace with a simple View stub since it's
// already tested in its own test file. We just verify it receives props.
jest.mock("@/components/session/SessionSummary", () => {
  const { View, Text } = require("react-native");
  return {
    SessionSummary: (props: any) => (
      <View testID={props.testID || "session-summary"}>
        <Text>Session Summary</Text>
        <Text>{props.date}</Text>
      </View>
    ),
  };
});

// Mock lucide-react-native — replace SVG icons with simple Views.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ChevronLeft: (props: any) => (
      <View testID="icon-chevron-left" {...props} />
    ),
  };
});

// Mock expo-image — Image component isn't available in Jest.
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

// Mock grades utility — return a controlled display string.
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn((grade: number) => `V${grade - 6}`),
}));

import SessionDetailScreen from "../[date]";

const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useSessions");

// ── Fixtures ─────────────────────────────────────────────────────

const mockSummary = {
  date: "2026-02-09",
  totalAscents: 3,
  sends: 2,
  flashes: 1,
  attempts: 0,
  gradeDistribution: { 8: 1, 10: 2 },
};

const mockAscents = [
  {
    id: "ascent-1",
    user_id: "user-1",
    route_id: "route-1",
    status: "send",
    attempts: 2,
    notes: null,
    perceived_grade: null,
    created_at: "2026-02-09T18:00:00Z",
    route: { name: "Crimpy Arete", canonical_grade: 10, color: "#EF4444" },
  },
  {
    id: "ascent-2",
    user_id: "user-1",
    route_id: "route-2",
    status: "flash",
    attempts: 1,
    notes: null,
    perceived_grade: null,
    created_at: "2026-02-09T18:30:00Z",
    route: { name: "Slab Master", canonical_grade: 8, color: "#3B82F6" },
  },
];

// ── Helper ───────────────────────────────────────────────────────

/** Reset mock data to defaults before each test. */
function resetMockData() {
  __mockData.data = null;
  __mockData.isLoading = false;
  __mockData.error = null;
}

// ── Tests ────────────────────────────────────────────────────────

describe("SessionDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  // ── 1. Loading state ──────────────────────────────────────────

  it("shows loading state", () => {
    // While the session detail data is loading, show a spinner.
    __mockData.isLoading = true;

    render(<SessionDetailScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  // ── 2. Renders session summary card ───────────────────────────

  it("renders session summary card", () => {
    // When data is loaded, the SessionSummary component should render
    // with the summary data. We verify via the stub's testID and text.
    __mockData.data = { summary: mockSummary, ascents: mockAscents };

    render(<SessionDetailScreen />);

    expect(screen.getByText("Session Summary")).toBeOnTheScreen();
    // The stub renders the date prop as text
    expect(screen.getByText("Feb 9, 2026")).toBeOnTheScreen();
  });

  // ── 3. Renders ascent list ────────────────────────────────────

  it("renders ascent list", () => {
    // Each ascent should display its route name so users can see
    // which routes they climbed during this session.
    __mockData.data = { summary: mockSummary, ascents: mockAscents };

    render(<SessionDetailScreen />);

    expect(screen.getByText("Crimpy Arete")).toBeOnTheScreen();
    expect(screen.getByText("Slab Master")).toBeOnTheScreen();
    expect(screen.getByText("Ascents")).toBeOnTheScreen();
  });

  // ── 4. Shows grade on ascent items ────────────────────────────

  it("shows grade on ascent items", () => {
    // Each ascent with a canonical grade should display the converted
    // grade string (from canonicalToDisplay mock).
    __mockData.data = { summary: mockSummary, ascents: mockAscents };

    render(<SessionDetailScreen />);

    // canonicalToDisplay(10) → "V4", canonicalToDisplay(8) → "V2"
    expect(screen.getByText("V4")).toBeOnTheScreen();
    expect(screen.getByText("V2")).toBeOnTheScreen();
  });

  // ── 5. Shows error state ──────────────────────────────────────

  it("shows error state", () => {
    // When the service returns an error, show a user-friendly message.
    __mockData.error = new Error("Failed to load session");

    render(<SessionDetailScreen />);

    expect(screen.getByTestId("error-message")).toBeOnTheScreen();
    expect(screen.getByText("Failed to load session")).toBeOnTheScreen();
  });
});
