/**
 * Logbook Index Screen Tests
 *
 * Tests the main logbook screen with two segments: Sessions and Saved.
 *
 * Sessions segment:
 *   - Shows loading state (spinner while fetching)
 *   - Shows empty state ("No sessions yet" when no data)
 *   - Renders session history list with dates, ascent counts, top grades
 *   - Tapping a session navigates to the detail screen
 *
 * Saved segment:
 *   - Shows saved routes after switching segments
 *   - Shows empty state ("No saved routes yet")
 *
 * Mock strategy (matching leaderboards.test.tsx __mockData pattern):
 *   - @/hooks/useSessions: __mockData pattern for session history
 *   - @/hooks/useSavedRoutes: __mockData pattern for saved routes
 *   - expo-router: useRouter returns { push: mockPush }
 *   - lucide-react-native: icons as simple Views with testIDs
 *   - @/utils/grades: controlled grade display string
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock useSessionHistory — control session data via __mockSessionData.
jest.mock("@/hooks/useSessions", () => {
  const mockSessionData = {
    data: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useSessionHistory: () => mockSessionData,
    useSessionDetail: jest.fn(),
    __mockSessionData: mockSessionData,
  };
});

// Mock useSavedRoutesList — control saved routes via __mockSavedData.
jest.mock("@/hooks/useSavedRoutes", () => {
  const mockSavedData = {
    data: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useSavedRoutesList: () => mockSavedData,
    __mockSavedData: mockSavedData,
    // Re-export the other hooks so imports don't break
    useIsFavorite: jest.fn(),
    useToggleFavorite: jest.fn(),
  };
});

// Mock expo-router — useRouter returns push for session card navigation.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock lucide-react-native — replace SVG icons with simple Views.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    BookOpen: (props: any) => <View testID="icon-book-open" {...props} />,
    Bookmark: (props: any) => <View testID="icon-bookmark" {...props} />,
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

import LogbookScreen from "../index";

// Access __mockData objects to control state before each render.
const { __mockSessionData } = jest.requireMock<{
  __mockSessionData: {
    data: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useSessions");

const { __mockSavedData } = jest.requireMock<{
  __mockSavedData: {
    data: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useSavedRoutes");

// ── Fixtures ─────────────────────────────────────────────────────

/** Two mock session history entries — different dates and stats. */
const mockSessions = [
  {
    date: "2026-02-09",
    ascentCount: 5,
    sends: 3,
    flashes: 1,
    topGrade: 10,
  },
  {
    date: "2026-02-08",
    ascentCount: 3,
    sends: 2,
    flashes: 0,
    topGrade: 8,
  },
];

/** Mock saved route with joined route metadata. */
const mockSaved = [
  {
    id: "saved-1",
    user_id: "user-1",
    route_id: "route-1",
    save_type: "favorite",
    created_at: "2026-02-09T00:00:00Z",
    route: {
      id: "route-1",
      name: "Crimpy Arete",
      canonical_grade: 10,
      color: "#EF4444",
      status: "active",
    },
  },
];

// ── Helper ───────────────────────────────────────────────────────

/** Reset all mock data to defaults before each test. */
function resetMocks() {
  __mockSessionData.data = [];
  __mockSessionData.isLoading = false;
  __mockSessionData.error = null;

  __mockSavedData.data = [];
  __mockSavedData.isLoading = false;
  __mockSavedData.error = null;
}

// ── Tests ────────────────────────────────────────────────────────

describe("LogbookScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  // ── 1. Loading state ──────────────────────────────────────────

  it("shows loading state", () => {
    // When session data is still loading, the screen should show
    // a spinner so users know content is being fetched.
    __mockSessionData.isLoading = true;

    render(<LogbookScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  // ── 2. Empty state for sessions ───────────────────────────────

  it("shows empty state for sessions", () => {
    // When no sessions exist, show a friendly message encouraging
    // the user to start climbing.
    __mockSessionData.data = [];

    render(<LogbookScreen />);

    expect(screen.getByText("No sessions yet")).toBeOnTheScreen();
  });

  // ── 3. Renders session history list ───────────────────────────

  it("renders session history list", () => {
    // With data, each session should show its date and ascent count.
    __mockSessionData.data = mockSessions;

    render(<LogbookScreen />);

    // Both session dates should render (formatted by formatDate)
    expect(screen.getByText("Feb 9, 2026")).toBeOnTheScreen();
    expect(screen.getByText("Feb 8, 2026")).toBeOnTheScreen();

    // Ascent counts should be visible
    expect(screen.getByText("5 ascents")).toBeOnTheScreen();
    expect(screen.getByText("3 ascents")).toBeOnTheScreen();
  });

  // ── 4. Tapping session navigates to detail ────────────────────

  it("navigates to session detail on card press", () => {
    // Tapping a session card should push the detail route with the
    // session date as a route parameter.
    __mockSessionData.data = mockSessions;

    render(<LogbookScreen />);

    // Press the first session card (Feb 9, 2026)
    fireEvent.press(screen.getByText("Feb 9, 2026"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/logbook/[date]",
      params: { date: "2026-02-09" },
    });
  });

  // ── 5. Switches to Saved segment ─────────────────────────────

  it("switches to Saved segment", () => {
    // Tapping the "Saved" segment should show saved routes content
    // instead of sessions. Here we test with saved routes data.
    __mockSavedData.data = mockSaved;

    render(<LogbookScreen />);

    // Switch to Saved segment
    fireEvent.press(screen.getByTestId("segment-saved"));

    // Should show the saved route's name
    expect(screen.getByText("Crimpy Arete")).toBeOnTheScreen();
  });

  // ── 6. Shows empty state for saved routes ─────────────────────

  it("shows empty state for saved routes", () => {
    // When in the Saved segment with no data, show a placeholder.
    __mockSavedData.data = [];

    render(<LogbookScreen />);

    // Switch to Saved segment
    fireEvent.press(screen.getByTestId("segment-saved"));

    expect(screen.getByText("No saved routes yet")).toBeOnTheScreen();
  });

  // ── 7. Shows top grade on session card ────────────────────────

  it("shows top grade on session card", () => {
    // Each session card should display the top grade climbed that day
    // as a badge, converted from canonical to display format.
    __mockSessionData.data = mockSessions;

    render(<LogbookScreen />);

    // The canonicalToDisplay mock converts grade 10 → "V4"
    // Verify the badge is rendered with the correct testID
    expect(screen.getByTestId("top-grade-2026-02-09")).toBeOnTheScreen();
  });
});
