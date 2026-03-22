// app/__tests__/start-session.test.tsx
//
// Tests for the Start Session modal screen.
//
// This screen has three states:
//   1. Loading — spinner + "Finding nearby gyms..."
//   2. Prompt — nearest gym found, confirm or choose another
//   3. Error — location denied or no gyms, fallback to map
//
// Mock strategy:
//   - expo-location: control permission status and GPS position
//   - @/hooks/useGyms: __mockData pattern for gym list
//   - expo-router: track router.replace calls
//   - lucide-react-native: MapPin as a simple View
//   - @/utils/geo: real implementation (pure function, no deps)

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock expo-location — control permission and position responses.
// We use __mockConfig to let each test override behavior before rendering.
jest.mock("expo-location", () => {
  const mockConfig = {
    permissionStatus: "granted" as string,
    position: {
      coords: { latitude: 45.5152, longitude: -122.6784 },
    },
    shouldThrow: false,
  };

  return {
    __esModule: true,
    __mockConfig: mockConfig,
    requestForegroundPermissionsAsync: jest.fn(async () => ({
      status: mockConfig.permissionStatus,
    })),
    getCurrentPositionAsync: jest.fn(async () => {
      if (mockConfig.shouldThrow) {
        throw new Error("Location unavailable");
      }
      return mockConfig.position;
    }),
    Accuracy: { Balanced: 3 },
  };
});

// Mock expo-router — track replace calls for navigation assertions.
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Mock useGyms — __mockData pattern (consistent with map.test.tsx).
// Tests set __mockData.data before rendering to control the gym list.
jest.mock("@/hooks/useGyms", () => {
  const mockData = {
    data: null as any[] | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useGyms: () => mockData,
    __mockData: mockData,
    useGym: jest.fn(),
    useToggleFavoriteGym: jest.fn(),
  };
});

// Mock useSession — provides startSession action for the "Yes" button.
const mockStartSession = jest.fn();
jest.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    startSession: mockStartSession,
    isActive: false,
  }),
}));

// Mock lucide-react-native — MapPin as a simple View with testID.
// Jest can't process SVG transforms from the real lucide package.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    MapPin: (props: any) => <View testID="icon-map-pin" {...props} />,
  };
});

// Import the screen AFTER mocks are registered
import StartSessionScreen from "../start-session";

// Access mock controls via jest.requireMock
const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any[] | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useGyms");

const { __mockConfig } = jest.requireMock<{
  __mockConfig: {
    permissionStatus: string;
    position: { coords: { latitude: number; longitude: number } };
    shouldThrow: boolean;
  };
}>("expo-location");

// ── Fixtures ─────────────────────────────────────────────────────

const mockGyms = [
  {
    id: "gym-1",
    name: "Summit Climbing Gym",
    latitude: 45.5152,
    longitude: -122.6784,
    address: "123 Boulder Ave, Portland, OR 97201",
    social_links: null,
    default_grade_system: "v-scale",
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
    created_at: "2026-01-02T00:00:00Z",
  },
];

// ── Helpers ──────────────────────────────────────────────────────

function resetMocks() {
  __mockData.data = null;
  __mockData.isLoading = false;
  __mockData.error = null;
  __mockConfig.permissionStatus = "granted";
  __mockConfig.position = {
    coords: { latitude: 45.5152, longitude: -122.6784 },
  };
  __mockConfig.shouldThrow = false;
  mockReplace.mockClear();
}

// ── Tests ────────────────────────────────────────────────────────

describe("StartSessionScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  // ── 1. Loading state ─────────────────────────────────────────

  it("shows loading state with spinner and text", () => {
    // When gyms haven't loaded yet (data is null), the useEffect
    // hasn't run, so the screen stays in its initial "loading" state.
    // This is the first thing the user sees when tapping the FAB.
    __mockData.data = null;

    render(<StartSessionScreen />);

    expect(screen.getByTestId("loading-state")).toBeOnTheScreen();
    expect(screen.getByText("Finding nearby gyms...")).toBeOnTheScreen();
  });

  // ── 2. Nearest gym prompt ────────────────────────────────────

  it("shows nearest gym prompt with gym name after location resolves", async () => {
    // With gyms loaded and location permission granted, the screen
    // should resolve to the prompt state showing the closest gym.
    // User is at Portland coords → Summit Climbing Gym is nearest.
    __mockData.data = mockGyms;
    __mockConfig.permissionStatus = "granted";
    __mockConfig.position = {
      coords: { latitude: 45.5152, longitude: -122.6784 },
    };

    render(<StartSessionScreen />);

    // Wait for the async location flow to complete and state to update.
    // waitFor retries until the assertion passes or times out.
    await waitFor(() => {
      expect(screen.getByText("Summit Climbing Gym")).toBeOnTheScreen();
    });

    expect(screen.getByText("Start session at")).toBeOnTheScreen();
    expect(screen.getByText("123 Boulder Ave, Portland, OR 97201")).toBeOnTheScreen();
  });

  // ── 3. "Yes" button starts session and navigates to gym page ──

  it("starts session and navigates to active session hub when 'Yes, start session!' is pressed", async () => {
    // The primary CTA should start the session in Zustand store (so
    // the app knows a climbing session is active) and then replace
    // the modal with the active session hub.
    __mockData.data = mockGyms;

    render(<StartSessionScreen />);

    await waitFor(() => {
      expect(screen.getByText("Yes, start session!")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText("Yes, start session!"));

    expect(mockStartSession).toHaveBeenCalledWith("gym-1");
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/active-session");
  });

  // ── 4. "No" button navigates to map ──────────────────────────

  it("navigates to map when 'No, choose another gym' is pressed", async () => {
    // The ghost button lets users browse all gyms on the map instead
    // of accepting the nearest gym suggestion.
    __mockData.data = mockGyms;

    render(<StartSessionScreen />);

    await waitFor(() => {
      expect(screen.getByText("No, choose another gym")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText("No, choose another gym"));

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/map");
  });

  // ── 5. Location error shows fallback ─────────────────────────

  it("shows error fallback when location permission is denied", async () => {
    // If the user denies location permission, the screen should show
    // an error message and a button to browse gyms on the map manually.
    __mockData.data = mockGyms;
    __mockConfig.permissionStatus = "denied";

    render(<StartSessionScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeOnTheScreen();
    });

    expect(
      screen.getByText("Location permission is needed to find nearby gyms.")
    ).toBeOnTheScreen();

    // The fallback button should navigate to the map
    fireEvent.press(screen.getByText("Browse gyms on map"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/map");
  });
});
