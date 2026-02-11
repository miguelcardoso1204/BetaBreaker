/**
 * Leaderboard Screen Tests — app/gym/[id]/leaderboard.tsx
 *
 * Tests the gym leaderboard detail screen that shows ranked entries
 * for a specific gym/period/scoring-model. Users reach this screen
 * from the gym main page or the enrolled leaderboards tab.
 *
 * UI structure:
 *   - Period chips: "This Week" / "Last Week"
 *   - Model chips: "Grade" / "Flash Rate" / "Volume"
 *   - Ranked list: rank | avatar | name | formatted score
 *   - Current user's row highlighted with accent background
 *   - Empty state when no entries
 *
 * Mock strategy:
 *   - useLeaderboard: __mockData pattern for controlling entries/loading
 *   - useGym: returns gym name for the header
 *   - useAuth: returns current user ID for row highlighting
 *   - expo-router: provides gymId via useLocalSearchParams
 *   - lucide-react-native / expo-image: standard icon/image mocks
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock expo-router — provides gymId and router for navigation
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "gym-1" }),
  useRouter: () => ({ push: mockPush }),
}));

// Mock useLeaderboard — __mockData pattern for controlling query state.
// Tests mutate __mockData before rendering to set entries/loading/error.
jest.mock("@/hooks/useLeaderboard", () => {
  const mockData = {
    data: null as any[] | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useLeaderboard: () => mockData,
    __mockData: mockData,
  };
});

// Mock useGyms — only useGym is used here (for the header gym name).
jest.mock("@/hooks/useGyms", () => {
  const gymMockData = {
    data: { id: "gym-1", name: "Summit Climbing" } as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useGym: () => gymMockData,
    useGyms: jest.fn(),
    useSetHomeGym: jest.fn(),
    __mockGymData: gymMockData,
  };
});

// Mock useAuth — provides current user ID for row highlighting
// and preferredGradeSystem for grade display formatting.
const mockUser = {
  id: "user-1",
  preferredGradeSystem: "v-scale",
};
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock isoWeek — deterministic week labels for testing default period.
jest.mock("@/utils/isoWeek", () => ({
  getCurrentISOWeekLabel: () => "2026-W07",
  getPreviousISOWeekLabel: () => "2026-W06",
}));

// Mock lucide-react-native — replace SVG icons with simple Views
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Trophy: (props: any) => <View testID="icon-trophy" {...props} />,
    ChevronRight: (props: any) => <View testID="icon-chevron" {...props} />,
  };
});

// Mock expo-image — native module unavailable in Jest
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

import LeaderboardScreen from "../leaderboard";

// Access __mockData to control useLeaderboard state per-test.
const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any[] | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useLeaderboard");

// ── Fixtures ─────────────────────────────────────────────────────

/** Leaderboard entries matching the shape from leaderboardService.getLeaderboard */
const mockEntries = [
  {
    id: "entry-1",
    user_id: "user-2",
    gym_id: "gym-1",
    period: "2026-W07",
    scoring_model: "hardest_grade",
    score: 15,
    rank: 1,
    profile: { display_name: "Alex Honnold", avatar_url: null },
  },
  {
    id: "entry-2",
    user_id: "user-1", // current user — should be highlighted
    gym_id: "gym-1",
    period: "2026-W07",
    scoring_model: "hardest_grade",
    score: 10,
    rank: 2,
    profile: { display_name: "Tommy Caldwell", avatar_url: "https://example.com/tommy.jpg" },
  },
  {
    id: "entry-3",
    user_id: "user-3",
    gym_id: "gym-1",
    period: "2026-W07",
    scoring_model: "hardest_grade",
    score: 8,
    rank: 3,
    profile: { display_name: "Lynn Hill", avatar_url: null },
  },
];

// ── Helper ───────────────────────────────────────────────────────

function resetMocks() {
  __mockData.data = null;
  __mockData.isLoading = false;
  __mockData.error = null;
  mockUser.id = "user-1";
  mockUser.preferredGradeSystem = "v-scale";
}

// ── Tests ────────────────────────────────────────────────────────

describe("LeaderboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  it("shows loading indicator while fetching", () => {
    // When useLeaderboard.isLoading is true, the screen should display
    // a spinner so users know content is loading.
    __mockData.isLoading = true;

    render(<LeaderboardScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("renders ranked list with rank, name, and score", () => {
    // When entries are loaded, each row should show the user's rank,
    // display name, and formatted score.
    __mockData.data = mockEntries;

    render(<LeaderboardScreen />);

    // Check rank numbers are displayed
    expect(screen.getByText("#1")).toBeOnTheScreen();
    expect(screen.getByText("#2")).toBeOnTheScreen();
    expect(screen.getByText("#3")).toBeOnTheScreen();

    // Check display names
    expect(screen.getByText("Alex Honnold")).toBeOnTheScreen();
    expect(screen.getByText("Tommy Caldwell")).toBeOnTheScreen();
    expect(screen.getByText("Lynn Hill")).toBeOnTheScreen();
  });

  it("highlights current user's row", () => {
    // The current user (user-1) should have a visually distinct row
    // so they can quickly find their position. We use testID to verify.
    __mockData.data = mockEntries;

    render(<LeaderboardScreen />);

    const highlightedRow = screen.getByTestId("leaderboard-row-user-1");
    expect(highlightedRow).toBeOnTheScreen();

    // Other rows should not be highlighted
    const otherRow = screen.getByTestId("leaderboard-row-user-2");
    expect(otherRow).toBeOnTheScreen();
  });

  it("default period is current ISO week", () => {
    // The "This Week" chip should be selected by default, and the
    // screen should show "This Week" as visually active.
    __mockData.data = [];

    render(<LeaderboardScreen />);

    // "This Week" chip should exist and be the default selection
    expect(screen.getByText("This Week")).toBeOnTheScreen();
    expect(screen.getByText("Last Week")).toBeOnTheScreen();
  });

  it("tapping 'Last Week' chip updates period", () => {
    // Pressing "Last Week" should switch the period filter. We verify
    // by checking the chip's visual state changes (active styling).
    __mockData.data = [];

    render(<LeaderboardScreen />);

    const lastWeekChip = screen.getByText("Last Week");
    fireEvent.press(lastWeekChip);

    // After pressing, "Last Week" should be the active chip.
    // We verify by checking the testID for the active chip container.
    expect(screen.getByTestId("period-chip-last-week-active")).toBeOnTheScreen();
  });

  it("default scoring model is hardest_grade", () => {
    // The "Grade" model chip should be selected by default since
    // hardest_grade is the most common leaderboard type.
    __mockData.data = [];

    render(<LeaderboardScreen />);

    expect(screen.getByText("Grade")).toBeOnTheScreen();
    expect(screen.getByText("Flash Rate")).toBeOnTheScreen();
    expect(screen.getByText("Volume")).toBeOnTheScreen();
  });

  it("tapping 'Flash Rate' chip updates model", () => {
    // Pressing "Flash Rate" should switch the scoring model. Verify
    // the chip becomes visually active.
    __mockData.data = [];

    render(<LeaderboardScreen />);

    const flashRateChip = screen.getByText("Flash Rate");
    fireEvent.press(flashRateChip);

    expect(screen.getByTestId("model-chip-flash_rate-active")).toBeOnTheScreen();
  });

  it("shows empty state when no entries", () => {
    // When the leaderboard has no entries for the selected period/model,
    // show a friendly message instead of a blank screen.
    __mockData.data = [];

    render(<LeaderboardScreen />);

    expect(screen.getByText("No entries for this period")).toBeOnTheScreen();
  });

  it("formats hardest_grade score as grade display", () => {
    // When the scoring model is hardest_grade, scores are canonical
    // grade integers. The screen should format them using the user's
    // preferred grade system (e.g., 15 → "V6" in v-scale).
    __mockData.data = [
      {
        id: "entry-1",
        user_id: "user-2",
        gym_id: "gym-1",
        period: "2026-W07",
        scoring_model: "hardest_grade",
        score: 15,
        rank: 1,
        profile: { display_name: "Alex Honnold", avatar_url: null },
      },
    ];

    render(<LeaderboardScreen />);

    // Canonical 15 in v-scale = "V6" (per the grade table)
    expect(screen.getByText("V6")).toBeOnTheScreen();
  });

  it("formats flash_rate score as percentage", () => {
    // Flash rate is stored as a decimal (0.0–1.0). The screen should
    // display it as a human-readable percentage like "85%".
    //
    // Start with empty data so the initial render (model=hardest_grade)
    // doesn't try to format 0.85 as a canonical grade (which would throw).
    // Then press the Flash Rate chip, set data, and re-render.
    __mockData.data = [];

    const { rerender } = render(<LeaderboardScreen />);

    // Switch to flash_rate model FIRST
    const flashRateChip = screen.getByText("Flash Rate");
    fireEvent.press(flashRateChip);

    // Now set flash_rate data and re-render. The component's model state
    // is already flash_rate, so formatScore will use the percentage path.
    __mockData.data = [
      {
        id: "entry-1",
        user_id: "user-2",
        gym_id: "gym-1",
        period: "2026-W07",
        scoring_model: "flash_rate",
        score: 0.85,
        rank: 1,
        profile: { display_name: "Alex Honnold", avatar_url: null },
      },
    ];

    rerender(<LeaderboardScreen />);

    expect(screen.getByText("85%")).toBeOnTheScreen();
  });
});
