/**
 * Gym Main Page Screen Tests
 *
 * Tests the central hub screen for a specific gym. Users reach this screen
 * from the Home tab or Map Browse and use it to access routes, leaderboards,
 * style analysis, and start sessions.
 *
 * This screen shows:
 *   - Gym name, address (MapPin icon), hours placeholder (Clock icon)
 *   - Avatar with initials fallback (no logo_url column exists yet)
 *   - Social media handle from gym.social_links
 *   - Favorite star toggle (sets home gym via useSetHomeGym)
 *   - "Start Session" button (placeholder until Phase 5)
 *   - Navigation cards: Routes (navigates), Leaderboards/Style Analysis (coming soon)
 *
 * Mock strategy (matching [routeId].test.tsx patterns):
 *   - expo-router: provides gymId via useLocalSearchParams, router.push for navigation
 *   - @/hooks/useGyms: useGym() with __mockData pattern, useSetHomeGym() with mockMutate
 *   - @/hooks/useAuth: provides user with homeGymId for star state
 *   - lucide-react-native: replaces SVG icons with simple test Views
 *   - expo-image: mocked since native module unavailable in Jest
 *   - Alert: spied on for placeholder action verification
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock expo-router — provide gymId via useLocalSearchParams and router.push
// for navigation to child screens (routes, etc.).
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "gym-1" }),
  useRouter: () => ({ push: mockPush }),
}));

// Mock useGyms — control gym data returned to the screen.
// We use the __mockData pattern so tests can mutate the mock state before
// rendering. Also mock useSetHomeGym for the favorite toggle mutation.
const mockSetHomeGym = jest.fn();
jest.mock("@/hooks/useGyms", () => {
  const mockData = {
    data: null as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useGym: () => mockData,
    __mockData: mockData,
    useGyms: jest.fn(),
    useSetHomeGym: () => ({ mutate: mockSetHomeGym }),
  };
});

// Mock useAuth — provide user with homeGymId for the favorite star state.
// We use a mutable object so tests can change homeGymId per-test.
const mockUser = {
  id: "user-1",
  homeGymId: null as string | null,
};
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock lucide-react-native — replace SVG icons with simple Views that have
// testIDs. This avoids native SVG rendering in tests and lets us verify
// which icons are rendered and what props they receive.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Star: (props: any) => <View testID="icon-star" {...props} />,
    MapPin: (props: any) => <View testID="icon-map-pin" {...props} />,
    Clock: (props: any) => <View testID="icon-clock" {...props} />,
    ChevronRight: (props: any) => <View testID="icon-chevron-right" {...props} />,
    Play: (props: any) => <View testID="icon-play" {...props} />,
  };
});

// Mock expo-image — native module unavailable in Jest environment.
// Replace Image with a simple View that captures the source prop.
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

// Mock Alert to capture placeholder action calls.
// We spy on Alert.alert to verify the screen shows "Coming Soon" dialogs
// for features not yet implemented.
import { Alert } from "react-native";
jest.spyOn(Alert, "alert");

import GymMainScreen from "../index";

// Access the __mockData object to control gym data in each test.
const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useGyms");

// ── Fixtures ─────────────────────────────────────────────────────

/** A gym object matching the shape returned by gymService.getGymById */
const mockGym = {
  id: "gym-1",
  name: "Summit Climbing Gym",
  address: "123 Boulder Ave, Portland, OR 97201",
  latitude: 45.5152,
  longitude: -122.6784,
  social_links: { instagram: "@summitclimbing" },
  default_grade_system: "v-scale",
  created_at: "2026-01-01T00:00:00Z",
};

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

describe("GymMainScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  // ── Basic rendering ──────────────────────────────────────────────

  it("renders gym name", () => {
    // The gym name should be prominently displayed as the main heading
    // so users know which gym's page they're viewing.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    expect(screen.getByText("Summit Climbing Gym")).toBeOnTheScreen();
  });

  it("renders gym address with MapPin icon", () => {
    // The address is shown with a MapPin icon for quick visual context.
    // testID="gym-address" wraps both icon and text for easy querying.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    const addressRow = screen.getByTestId("gym-address");
    expect(addressRow).toBeOnTheScreen();
    expect(
      screen.getByText("123 Boulder Ave, Portland, OR 97201")
    ).toBeOnTheScreen();
  });

  it("renders hours placeholder with Clock icon", () => {
    // No operating_hours column exists in the gyms table yet, so the
    // screen shows a static "Hours not available" placeholder with a
    // Clock icon. This structure allows adding real hours data later.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    const hoursRow = screen.getByTestId("gym-hours");
    expect(hoursRow).toBeOnTheScreen();
    expect(screen.getByText("Hours not available")).toBeOnTheScreen();
  });

  it("does not show open/closed indicator when no hours data", () => {
    // Without operating_hours data, there's no way to determine if the
    // gym is currently open. The open/closed dot should not render.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    expect(screen.queryByTestId("open-indicator")).toBeNull();
  });

  it("displays social media handle from social_links", () => {
    // The gym's Instagram handle is extracted from the social_links
    // JSONB column and displayed for user reference.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    expect(screen.getByText("@summitclimbing")).toBeOnTheScreen();
  });

  // ── Favorite toggle ──────────────────────────────────────────────

  it("calls setHomeGym when favorite button is pressed", () => {
    // Pressing the star sets this gym as the user's home gym. The
    // mutation receives the userId and gymId to update the profile.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    const favoriteButton = screen.getByTestId("favorite-button");
    fireEvent.press(favoriteButton);

    expect(mockSetHomeGym).toHaveBeenCalledWith({
      userId: "user-1",
      gymId: "gym-1",
    });
  });

  it("shows gold star when gym is user's home gym", () => {
    // When the user's homeGymId matches the current gym, the star icon
    // should use gold (#F59E0B) to indicate it's their home gym.
    __mockData.data = mockGym;
    mockUser.homeGymId = "gym-1";

    render(<GymMainScreen />);

    const starIcon = screen.getByTestId("icon-star");
    expect(starIcon.props.color).toBe("#F59E0B");
  });

  // ── Navigation cards ─────────────────────────────────────────────

  it("navigates to routes screen when Routes card is pressed", () => {
    // The Routes card is the main navigation path to browse gym routes.
    // It should push the routes screen onto the navigation stack.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    const routesCard = screen.getByText("Routes");
    fireEvent.press(routesCard);

    expect(mockPush).toHaveBeenCalledWith("/gym/gym-1/routes");
  });

  it("shows coming soon alert for Leaderboards card", () => {
    // Leaderboards are a Phase 10 feature — not yet implemented.
    // Pressing the card shows a "Coming Soon" alert as a placeholder.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    const leaderboardsCard = screen.getByText("Leaderboards");
    fireEvent.press(leaderboardsCard);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Coming Soon",
      expect.any(String)
    );
  });

  it("shows coming soon alert for Style Analysis card", () => {
    // Style Analysis is a later-phase feature — not yet implemented.
    // Same placeholder behavior as Leaderboards.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    const styleCard = screen.getByText("Style Analysis");
    fireEvent.press(styleCard);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Coming Soon",
      expect.any(String)
    );
  });

  // ── Loading state ────────────────────────────────────────────────

  it("shows loading indicator when isLoading is true", () => {
    // While TanStack Query fetches the gym data, show a spinner so
    // the user knows content is loading.
    __mockData.isLoading = true;

    render(<GymMainScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });
});
