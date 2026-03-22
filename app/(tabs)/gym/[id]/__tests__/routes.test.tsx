/**
 * Gym Routes Screen Tests
 *
 * Tests the main route browsing screen that shows a filterable list of
 * RouteCard components for a specific gym. We mock:
 *   - expo-router — controls gymId param and captures navigation calls
 *   - useRoutes hook — controls loading/error/data states
 *   - routeFilterStore — provides default filter state
 *   - RouteCard — simple mock so we can detect renders and taps
 *   - FilterBar — simple mock so we can detect it renders
 *
 * WHY MOCK RouteCard AND FilterBar?
 * These components have their own dedicated test files. In screen tests,
 * we only care that the screen renders them with correct props and
 * responds to their callbacks — not that they render correctly internally.
 * Simple mocks make tests faster and isolate screen logic from component bugs.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock expo-router — provide gymId via useLocalSearchParams and
// capture navigation calls via useRouter.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "gym-1" }),
  useRouter: () => ({ push: mockPush }),
}));

// Mock useRoutes — define the mock state INSIDE the factory to avoid
// jest.mock hoisting issues (variables outside are in temporal dead zone).
jest.mock("@/hooks/useRoutes", () => {
  const mockData = {
    data: null as any[] | null,
    isLoading: false,
    error: null as Error | null,
    refetch: jest.fn(),
  };
  return {
    useRoutes: () => mockData,
    __mockData: mockData,
  };
});

// Mock routeFilterStore — return default filters for any gym.
// The screen reads `s.filters` (a map keyed by gymId) and individual setters.
jest.mock("@/stores/routeFilterStore", () => ({
  useRouteFilterStore: (selector: (s: any) => any) => {
    const state = {
      filters: {
        "gym-1": { sortBy: "newest" as const },
      },
      setGradeMin: jest.fn(),
      setGradeMax: jest.fn(),
      setSortBy: jest.fn(),
    };
    return selector(state);
  },
}));

// Mock RouteCard — render a simple Pressable that fires onPress.
// This lets us test that the screen passes correct props and handles taps.
jest.mock("@/components/routes/RouteCard", () => {
  const { Pressable, Text } = require("react-native");
  return {
    RouteCard: ({ route, onPress }: { route: any; onPress: () => void }) => (
      <Pressable testID={`route-card-${route.id}`} onPress={onPress}>
        <Text>{route.name}</Text>
      </Pressable>
    ),
  };
});

// Mock FilterBar — simple placeholder so we can verify it renders.
jest.mock("@/components/routes/FilterBar", () => {
  const { View } = require("react-native");
  return {
    FilterBar: () => <View testID="filter-bar" />,
  };
});

// Mock useGyms — the routes screen calls useGym(gymId) for the header title.
jest.mock("@/hooks/useGyms", () => ({
  useGym: () => ({
    data: { id: "gym-1", name: "Summit Climbing" },
    isLoading: false,
    error: null,
  }),
}));

// Mock lucide icons (FilterBar imports these, but since FilterBar is mocked
// the import chain may still try to resolve it)
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ChevronLeft: (props: any) => <View testID="icon-chevron-left" {...props} />,
  };
});

import GymRoutesScreen from "../routes";
const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: jest.Mock;
  };
}>("@/hooks/useRoutes");

// ── Fixtures ─────────────────────────────────────────────────────

const mockRoutes = [
  {
    id: "route-1",
    name: "Crimpy Arete",
    canonical_grade: 10,
    status: "active",
    color: "#EF4444",
    gym_id: "gym-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "route-2",
    name: "Slab Master",
    canonical_grade: 5,
    status: "active",
    color: "#3B82F6",
    gym_id: "gym-1",
    created_at: "2026-01-02T00:00:00Z",
  },
];

// ── Helper ───────────────────────────────────────────────────────

/** Reset mock data to default (no data, not loading, no error). */
function resetMockData() {
  __mockData.data = null;
  __mockData.isLoading = false;
  __mockData.error = null;
  __mockData.refetch = jest.fn();
}

// ── Tests ────────────────────────────────────────────────────────

describe("GymRoutesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading indicator when isLoading is true", () => {
    __mockData.isLoading = true;

    render(<GymRoutesScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
    // Should NOT show the route list while loading
    expect(screen.queryByTestId("route-list")).toBeNull();
  });

  it("renders route list when data is present", () => {
    __mockData.data = mockRoutes;

    render(<GymRoutesScreen />);

    // Both route cards should be rendered
    expect(screen.getByTestId("route-card-route-1")).toBeOnTheScreen();
    expect(screen.getByTestId("route-card-route-2")).toBeOnTheScreen();
    expect(screen.getByText("Crimpy Arete")).toBeOnTheScreen();
    expect(screen.getByText("Slab Master")).toBeOnTheScreen();
  });

  it("shows empty state when data is an empty array", () => {
    __mockData.data = [];

    render(<GymRoutesScreen />);

    expect(screen.getByTestId("empty-state")).toBeOnTheScreen();
    expect(screen.getByText("No routes found")).toBeOnTheScreen();
  });

  it("renders FilterBar component", () => {
    __mockData.data = mockRoutes;

    render(<GymRoutesScreen />);

    expect(screen.getByTestId("filter-bar")).toBeOnTheScreen();
  });

  it("pull-to-refresh calls refetch", () => {
    __mockData.data = mockRoutes;
    const mockRefetch = jest.fn();
    __mockData.refetch = mockRefetch;

    render(<GymRoutesScreen />);

    // Simulate pull-to-refresh by finding the FlatList and triggering onRefresh
    const flatList = screen.getByTestId("route-list");
    // The RefreshControl's onRefresh is wired to refetch
    const refreshControl = flatList.props.refreshControl;
    refreshControl.props.onRefresh();

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("tapping a RouteCard navigates to route detail", () => {
    __mockData.data = mockRoutes;

    render(<GymRoutesScreen />);

    // Tap the first route card
    fireEvent.press(screen.getByTestId("route-card-route-1"));

    // Should navigate to the route detail screen
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/gym/gym-1/route/route-1");
  });
});
