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
 *   - Favorite star toggle (adds/removes from favorites via useToggleFavoriteGym)
 *   - "Start Session" button (starts session via useSession + navigates to routes)
 *   - Navigation cards: Routes (navigates), Leaderboards/Style Analysis (coming soon)
 *
 * Mock strategy (matching [routeId].test.tsx patterns):
 *   - expo-router: provides gymId via useLocalSearchParams, router.push for navigation
 *   - @/hooks/useGyms: useGym() with __mockData pattern, useFavoriteGyms() + useToggleFavoriteGym()
 *   - @/hooks/useAuth: provides user identity
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
// rendering. Also mock useFavoriteGyms + useToggleFavoriteGym for the
// favorite toggle.
const mockToggleFavorite = jest.fn();
jest.mock("@/hooks/useGyms", () => {
  const mockData = {
    data: null as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  const mockFavData = {
    data: null as { ids: Set<string>; gyms: any[] } | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useGym: () => mockData,
    useFavoriteGyms: () => mockFavData,
    useToggleFavoriteGym: () => ({ mutate: mockToggleFavorite }),
    __mockData: mockData,
    __mockFavData: mockFavData,
    useGyms: jest.fn(),
  };
});

// Mock useAuth — provide user identity for favorites queries.
const mockUser = {
  id: "user-1",
};
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock useSession — provides startSession action and isActive state.
// We track startSession calls and control isActive per-test.
const mockStartSession = jest.fn();
let mockIsActive = false;
jest.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    startSession: mockStartSession,
    isActive: mockIsActive,
  }),
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

// Access the __mockData and __mockFavData objects to control gym and favorites data.
const { __mockData, __mockFavData } = jest.requireMock<{
  __mockData: {
    data: any | null;
    isLoading: boolean;
    error: Error | null;
  };
  __mockFavData: {
    data: { ids: Set<string>; gyms: any[] } | null;
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
  __mockFavData.data = null;
  __mockFavData.isLoading = false;
  __mockFavData.error = null;
  mockUser.id = "user-1";
  mockIsActive = false;
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

  it("calls toggleFavorite when favorite button is pressed", () => {
    // Pressing the star toggles this gym's favorite status. The
    // mutation receives the userId, gymId, and current favorite state.
    __mockData.data = mockGym;
    __mockFavData.data = { ids: new Set<string>(), gyms: [] };

    render(<GymMainScreen />);

    const favoriteButton = screen.getByTestId("favorite-button");
    fireEvent.press(favoriteButton);

    expect(mockToggleFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        gymId: "gym-1",
      }),
    );
  });

  it("shows gold star when gym is favorited", () => {
    // When the gym is in the user's favorites set, the star icon
    // should use gold (#F59E0B) to indicate it's favorited.
    __mockData.data = mockGym;
    __mockFavData.data = { ids: new Set(["gym-1"]), gyms: [mockGym] };

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

    expect(mockPush).toHaveBeenCalledWith("/(tabs)/gym/gym-1/routes");
  });

  it("navigates to leaderboard screen when Leaderboards card is pressed", () => {
    // The Leaderboards card navigates to the gym's leaderboard detail
    // screen where users see weekly rankings by scoring model.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    const leaderboardsCard = screen.getByText("Leaderboards");
    fireEvent.press(leaderboardsCard);

    expect(mockPush).toHaveBeenCalledWith("/(tabs)/gym/gym-1/leaderboard");
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

  // ── Start Session button ────────────────────────────────────────

  it("calls startSession and navigates to routes when Start Session is pressed", () => {
    // The Start Session button should activate the Zustand session store
    // with this gymId and navigate to the routes list so the user can
    // browse and log ascents.
    __mockData.data = mockGym;

    render(<GymMainScreen />);

    const button = screen.getByTestId("start-session-button");
    expect(screen.getByText("Start Session")).toBeOnTheScreen();

    fireEvent.press(button);

    expect(mockStartSession).toHaveBeenCalledWith("gym-1");
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/gym/gym-1/routes");
  });

  it("shows 'View Routes' and skips startSession when session is already active", () => {
    // If a session is already running (e.g., user navigated back from
    // routes), the button should say "View Routes" and just navigate
    // without calling startSession again.
    __mockData.data = mockGym;
    mockIsActive = true;

    render(<GymMainScreen />);

    expect(screen.getByText("View Routes")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("start-session-button"));

    expect(mockStartSession).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/gym/gym-1/routes");
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
