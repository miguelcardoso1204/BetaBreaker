/**
 * Map Browse Screen Tests
 *
 * Tests the full-screen interactive map tab that shows gym markers, a search
 * overlay, a favorites filter toggle, and a bottom sheet gym count. Users
 * browse gyms visually and tap markers to navigate to the Gym Main Page.
 *
 * This screen integrates:
 *   - react-native-maps MapView + Marker for the interactive map
 *   - useGyms() to fetch all gyms (filtered client-side by search + coordinates)
 *   - useAuth() for the user's homeGymId (favorites filter)
 *   - expo-router for marker → gym page navigation
 *
 * Mock strategy (matching gym/[id]/__tests__/index.test.tsx patterns):
 *   - react-native-maps: MapView as View with testID, Marker as Pressable
 *   - @/hooks/useGyms: useGyms() with __mockData pattern (array data)
 *   - @/hooks/useAuth: mutable mockUser with homeGymId
 *   - expo-router: useRouter returns { push: mockPush }
 *   - lucide-react-native: icons as simple Views with testIDs
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock react-native-maps — MapView as a View that renders children (markers),
// and Marker as a Pressable so we can fireEvent.press to test navigation.
// The `identifier` prop maps to testID="marker-{identifier}" for easy querying.
// Mock react-native-map-clustering — drop-in MapView replacement that
// handles marker clustering. In tests we just render children like a View.
jest.mock("react-native-map-clustering", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => (
      <View testID="map-view">{props.children}</View>
    ),
  };
});

// Mock react-native-maps — Marker and Callout components.
jest.mock("react-native-maps", () => {
  const { View, Pressable } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => (
      <View testID="map-view">{props.children}</View>
    ),
    Marker: (props: any) => (
      <View testID={`marker-${props.identifier}`}>
        {props.children}
      </View>
    ),
    Callout: (props: any) => (
      <Pressable testID={props.testID} onPress={props.onPress}>
        {props.children}
      </Pressable>
    ),
  };
});

// Mock expo-location — immediately resolves with "denied" by default so the
// map falls back to gym-based centering. Individual tests can override this
// to test the GPS-centered behavior.
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({
    status: "denied",
  })),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

// Mock expo-router — useRouter returns push for marker tap navigation.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock useGyms — control gym data via __mockData pattern.
// Unlike the gym detail tests (single object), map tests need an ARRAY of gyms.
jest.mock("@/hooks/useGyms", () => {
  const mockData = {
    data: null as any[] | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useGyms: () => mockData,
    __mockData: mockData,
    // Include other exports the module might need (prevents import errors)
    useGym: jest.fn(),
    useSetHomeGym: jest.fn(),
  };
});

// Mock useAuth — provide user with homeGymId for favorites filter.
// Mutable so individual tests can change homeGymId.
const mockUser = {
  id: "user-1",
  homeGymId: null as string | null,
};
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock lucide-react-native — replace SVG icons with simple Views.
// Search, Star, and ChevronRight are the icons used by the map screen.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Search: (props: any) => <View testID="icon-search" {...props} />,
    Star: (props: any) => <View testID="icon-star" {...props} />,
    ChevronRight: (props: any) => <View testID="icon-chevron" {...props} />,
    LocateFixed: (props: any) => <View testID="icon-locate" {...props} />,
  };
});

import MapScreen from "../map";

// Access __mockData to control gym data before each render.
const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any[] | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useGyms");

// ── Fixtures ─────────────────────────────────────────────────────

/**
 * Three test gyms — two with coordinates (should get markers) and one
 * without coordinates (should NOT get a marker). This tests the filtering
 * pipeline that excludes gyms with null lat/lng.
 */
const mockGyms = [
  {
    id: "gym-1",
    name: "Summit Climbing Gym",
    latitude: 45.5152,
    longitude: -122.6784,
    address: "123 Boulder Ave, Portland, OR 97201",
    social_links: null,
    default_grade_system: "v-scale",
    operating_hours: { monday: { open: "06:00", close: "22:00" }, tuesday: { open: "06:00", close: "22:00" } },
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "gym-2",
    name: "Vertical World",
    latitude: 47.6062,
    longitude: -122.3321,
    address: "456 Wall St, Seattle, WA 98101",
    social_links: null,
    default_grade_system: "v-scale",
    operating_hours: null,
    created_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "gym-3",
    name: "No Coords Gym",
    latitude: null,
    longitude: null,
    address: "789 Nowhere Rd",
    social_links: null,
    default_grade_system: "font",
    operating_hours: null,
    created_at: "2026-01-03T00:00:00Z",
  },
];

// ── Helper ───────────────────────────────────────────────────────

/** Reset mock data and user state to defaults before each test. */
function resetMocks() {
  __mockData.data = null;
  __mockData.isLoading = false;
  __mockData.error = null;
  mockUser.id = "user-1";
  mockUser.homeGymId = null;
}

// ── Tests ────────────────────────────────────────────────────────

describe("MapScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  // ── 1. Map renders ───────────────────────────────────────────────

  it("renders the map view", async () => {
    // The MapView component should always render (even with no gyms loaded).
    // We verify this via the testID on our mocked MapView.
    __mockData.data = mockGyms;

    render(<MapScreen />);

    // Wait for the async location effect to resolve before the map appears.
    await waitFor(() => {
      expect(screen.getByTestId("map-view")).toBeOnTheScreen();
    });
  });

  // ── 2. Gym markers displayed (null coords excluded) ─────────────

  it("displays markers for gyms with coordinates and excludes null-coord gyms", async () => {
    // Only gym-1 and gym-2 have valid lat/lng. gym-3 has null coordinates
    // and should NOT get a marker — you can't place a marker without coords.
    __mockData.data = mockGyms;

    render(<MapScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("marker-gym-1")).toBeOnTheScreen();
    });
    expect(screen.getByTestId("marker-gym-2")).toBeOnTheScreen();
    expect(screen.queryByTestId("marker-gym-3")).toBeNull();
  });

  // ── 3. Search bar renders ────────────────────────────────────────

  it("renders a search bar", async () => {
    // The search input lets users type a gym name to filter markers.
    // We check for the placeholder text, which doubles as a visual label.
    __mockData.data = mockGyms;

    render(<MapScreen />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Search gyms...")
      ).toBeOnTheScreen();
    });
  });

  // ── 4. Favorites filter renders ──────────────────────────────────

  it("renders a favorites filter toggle", async () => {
    // The star icon button toggles between showing all gyms and only
    // the user's home gym. testID="favorites-filter" on the Pressable.
    __mockData.data = mockGyms;

    render(<MapScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("favorites-filter")).toBeOnTheScreen();
    });
  });

  // ── 5. Bottom sheet lists visible gyms ──────────────────────────

  it("lists visible gyms in the bottom sheet", async () => {
    // The bottom sheet shows a scrollable list of gym names for gyms
    // currently displayed on the map. Only gyms with coords appear.
    // Gym names also appear in marker callouts, so we check the list
    // items by their testIDs instead.
    __mockData.data = mockGyms;

    render(<MapScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("bottom-sheet")).toBeOnTheScreen();
    });
    expect(screen.getByTestId("gym-list-item-gym-1")).toBeOnTheScreen();
    expect(screen.getByTestId("gym-list-item-gym-2")).toBeOnTheScreen();
    // gym-3 has no coords — shouldn't appear in list
    expect(screen.queryByTestId("gym-list-item-gym-3")).toBeNull();
  });

  // ── 6. Tap callout navigates to gym page ─────────────────────────

  it("navigates to gym page when a callout is tapped", async () => {
    // Tapping a pin shows a callout with gym info. Tapping the callout
    // navigates to the Gym Main Page for that gym's ID.
    __mockData.data = mockGyms;

    render(<MapScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("marker-gym-1")).toBeOnTheScreen();
    });

    // The callout content is rendered inside the marker. Tap it to navigate.
    fireEvent.press(screen.getByTestId("callout-gym-1"));

    expect(mockPush).toHaveBeenCalledWith("/gym/gym-1");
  });

  // ── 7. Search shows dropdown results ─────────────────────────────

  it("shows search results dropdown when typing a gym name", async () => {
    // Typing "Summit" should show a dropdown with matching gyms.
    // All markers remain on the map — search is for navigation, not filtering.
    __mockData.data = mockGyms;

    render(<MapScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search gyms...")).toBeOnTheScreen();
    });

    const searchInput = screen.getByPlaceholderText("Search gyms...");
    fireEvent.changeText(searchInput, "Summit");

    // Search results dropdown appears with the matching gym
    expect(screen.getByTestId("search-results")).toBeOnTheScreen();
    expect(screen.getByTestId("search-result-gym-1")).toBeOnTheScreen();
    // Non-matching gym should NOT be in the dropdown
    expect(screen.queryByTestId("search-result-gym-2")).toBeNull();
    // Both markers still visible — search doesn't filter markers
    expect(screen.getByTestId("marker-gym-1")).toBeOnTheScreen();
    expect(screen.getByTestId("marker-gym-2")).toBeOnTheScreen();
  });
});
