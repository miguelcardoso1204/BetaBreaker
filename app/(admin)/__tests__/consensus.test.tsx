/**
 * Admin Consensus Screen Tests (Step 15.4)
 *
 * Tests the screen that displays:
 *   - Summary stats: routes with consensus, routes with divergence ≥2
 *   - Filter toggle: "All" vs "Divergent Only"
 *   - FlatList of GradeConsensusCard items
 *   - Loading, empty, and error states
 *
 * Mock strategy:
 *   - useRoutesGradeConsensus: mutable __mockData pattern
 *   - useAuth: provides adminGymId
 *   - GradeConsensusCard: simplified mock to avoid nested hook complexity
 *   - lucide-react-native: mocked for SVG processing
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1" },
    adminGymId: "gym-1",
    role: "gym_admin",
  }),
}));

// ── Mock useGradeConsensus hooks ─────────────────────────────────────
jest.mock("@/hooks/useGradeConsensus", () => {
  const mockRoutesData = {
    routes: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useRoutesGradeConsensus: () => mockRoutesData,
    // useGradeSubmissions used by the card — mock here too
    useGradeSubmissions: () => ({
      submissions: [],
      isLoading: false,
      error: null,
    }),
    __mockRoutesData: mockRoutesData,
  };
});

// ── Mock GradeConsensusCard ─────────────────────────────────────────
// The card has its own tests — here we just need a simple renderable.
jest.mock("@/components/admin/GradeConsensusCard", () => {
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => (
      <View testID={`consensus-card-${props.routeId}`}>
        <Text>{props.name}</Text>
      </View>
    ),
  };
});

// ── Mock lucide ─────────────────────────────────────────────────────
jest.mock("lucide-react-native", () => ({
  Filter: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>Filter</Text>;
  },
}));

import ConsensusScreen from "../consensus";

const { __mockRoutesData } = jest.requireMock<{
  __mockRoutesData: {
    routes: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useGradeConsensus");

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockRoutesData.routes = [];
  __mockRoutesData.isLoading = false;
  __mockRoutesData.error = null;
}

const sampleRoutes = [
  {
    route_id: "r1",
    name: "Boulder A",
    color: "red",
    canonical_grade: 14,
    consensus_grade: 17,
    submission_count: 8,
    divergence: 3,
  },
  {
    route_id: "r2",
    name: "Boulder B",
    color: "blue",
    canonical_grade: 10,
    consensus_grade: 10,
    submission_count: 6,
    divergence: 0,
  },
  {
    route_id: "r3",
    name: "Boulder C",
    color: "green",
    canonical_grade: 8,
    consensus_grade: null,
    submission_count: 2,
    divergence: null,
  },
];

describe("ConsensusScreen", () => {
  beforeEach(resetMockData);

  it("renders screen header", () => {
    render(<ConsensusScreen />);
    expect(screen.getByText("Grade Consensus")).toBeTruthy();
  });

  it("shows loading state", () => {
    __mockRoutesData.isLoading = true;
    render(<ConsensusScreen />);
    expect(screen.getByTestId("loading-indicator")).toBeTruthy();
  });

  it("shows error state", () => {
    __mockRoutesData.error = new Error("Network failure");
    render(<ConsensusScreen />);
    expect(screen.getByText(/Network failure/)).toBeTruthy();
  });

  it("shows empty state when no routes", () => {
    __mockRoutesData.routes = [];
    render(<ConsensusScreen />);
    expect(screen.getByText(/No routes/i)).toBeTruthy();
  });

  it("renders route cards for all routes", () => {
    __mockRoutesData.routes = sampleRoutes;
    render(<ConsensusScreen />);

    expect(screen.getByText("Boulder A")).toBeTruthy();
    expect(screen.getByText("Boulder B")).toBeTruthy();
    expect(screen.getByText("Boulder C")).toBeTruthy();
  });

  it("displays summary stats", () => {
    __mockRoutesData.routes = sampleRoutes;
    render(<ConsensusScreen />);

    // 2 routes have consensus (r1 and r2 have non-null consensus_grade)
    expect(screen.getByText(/2 with consensus/)).toBeTruthy();
    // 1 route has divergence ≥2 (r1 with divergence 3)
    expect(screen.getByText(/1 divergent/)).toBeTruthy();
  });

  it("filters to divergent-only routes when toggle pressed", () => {
    __mockRoutesData.routes = sampleRoutes;
    render(<ConsensusScreen />);

    // Press the filter toggle
    fireEvent.press(screen.getByTestId("filter-divergent"));

    // Only r1 (divergence 3) should remain — r2 (0) and r3 (null) are hidden
    expect(screen.getByText("Boulder A")).toBeTruthy();
    expect(screen.queryByText("Boulder B")).toBeNull();
    expect(screen.queryByText("Boulder C")).toBeNull();
  });

  it("shows all routes again when filter is toggled off", () => {
    __mockRoutesData.routes = sampleRoutes;
    render(<ConsensusScreen />);

    const filterBtn = screen.getByTestId("filter-divergent");

    // Toggle on
    fireEvent.press(filterBtn);
    expect(screen.queryByText("Boulder B")).toBeNull();

    // Toggle off — all routes should appear again
    fireEvent.press(filterBtn);
    expect(screen.getByText("Boulder B")).toBeTruthy();
    expect(screen.getByText("Boulder C")).toBeTruthy();
  });
});
