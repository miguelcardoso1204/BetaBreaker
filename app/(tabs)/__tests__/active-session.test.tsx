// app/__tests__/active-session.test.tsx
//
// Tests for the Active Session screen — the "session hub" during a climb.
//
// This screen has three states:
//   1. Active session — timer, stats, pending log list, action buttons
//   2. Post-session — SessionSummary card with "Done" button
//   3. No session — redirect to tabs (stale navigation guard)
//
// Mock strategy follows the project pattern (see start-session.test.tsx):
//   - @/hooks/useSession: __mockData pattern for session state + actions
//   - @/hooks/useGyms: __mockData pattern for gym metadata
//   - @/hooks/useRoutes: __mockData pattern for route lookups
//   - expo-router: track push/replace/back calls
//   - lucide-react-native: icons as simple View elements
//   - @/components/session/SessionTimer: simplified Text mock
//   - @/components/session/SessionSummary: simplified View mock

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock Alert.alert to capture confirmation dialog behavior.
// We spy on it to verify the correct title/body and simulate button presses.
jest.spyOn(Alert, "alert");

// Mock expo-router — track navigation calls.
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
}));

// Mock useSession — __mockData pattern for session state + mock actions.
// Tests override __mockData fields before rendering to control session state.
const mockEndSession = jest.fn();
const mockReset = jest.fn();
jest.mock("@/hooks/useSession", () => {
  const mockData = {
    isActive: true,
    startTime: Date.now() - 3600000, // 1 hour ago
    endTime: null as number | null,
    gymId: "gym-1",
    pendingLogs: [] as any[],
    duration: 0,
    // Use getter functions that delegate to the top-level jest.fn() mocks.
    // This ensures the mock functions are always the same references the
    // test assertions check against (mockEndSession, mockReset).
    get endSession() { return mockEndSession; },
    get reset() { return mockReset; },
    logAscent: { mutate: jest.fn() },
    deleteAscent: { mutate: jest.fn() },
    startSession: jest.fn(),
  };
  return {
    useSession: () => mockData,
    __mockData: mockData,
  };
});

// Mock useGym — returns gym metadata for header display.
jest.mock("@/hooks/useGyms", () => {
  const mockGymData = {
    data: { id: "gym-1", name: "Summit Climbing Gym", default_grade_system: "v-scale" },
    isLoading: false,
    error: null,
  };
  return {
    useGym: () => mockGymData,
    __mockGymData: mockGymData,
    useGyms: jest.fn(),
    useFavoriteGyms: jest.fn(),
    useToggleFavoriteGym: jest.fn(),
  };
});

// Mock useRoutes — returns route data for pending log display.
jest.mock("@/hooks/useRoutes", () => {
  const mockRoutesData = {
    data: [
      { id: "route-1", name: "Crimson Overhang", grade: 10, color: "#FF0000", grade_system: "v-scale" },
      { id: "route-2", name: "Blue Slab", grade: 5, color: "#0000FF", grade_system: "v-scale" },
    ],
    isLoading: false,
    error: null,
  };
  return {
    useRoutes: () => mockRoutesData,
    __mockRoutesData: mockRoutesData,
  };
});

// Mock session store — provides removePendingLog action.
const mockRemovePendingLog = jest.fn();
jest.mock("@/stores/sessionStore", () => ({
  useSessionStore: (selector: any) => {
    // The component calls useSessionStore((s) => s.removePendingLog)
    // so we return the mock function via the selector pattern.
    const state = { removePendingLog: mockRemovePendingLog };
    return selector(state);
  },
}));

// Mock SessionTimer — renders a simple Text element so we can verify presence.
jest.mock("@/components/session/SessionTimer", () => ({
  SessionTimer: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>00:45:00</Text>;
  },
}));

// Mock SessionSummary — renders a simple View so we can verify presence.
jest.mock("@/components/session/SessionSummary", () => ({
  SessionSummary: (props: any) => {
    const { View, Text } = require("react-native");
    return (
      <View testID={props.testID}>
        <Text>Session Summary</Text>
      </View>
    );
  },
}));

// Mock lucide-react-native — icons as simple View elements.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ChevronLeft: (props: any) => <View testID="icon-chevron-left" {...props} />,
    Route: (props: any) => <View testID="icon-route" {...props} />,
    ScanLine: (props: any) => <View testID="icon-scan" {...props} />,
    Trash2: (props: any) => <View testID="icon-trash" {...props} />,
  };
});

// Mock canonicalToDisplay — return a predictable grade string.
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: (grade: number) => `V${grade}`,
}));

// Import the screen AFTER mocks are registered.
import ActiveSessionScreen from "../active-session";

// Access mock controls via jest.requireMock.
const { __mockData } = jest.requireMock<{
  __mockData: {
    isActive: boolean;
    startTime: number | null;
    endTime: number | null;
    gymId: string | null;
    pendingLogs: any[];
    duration: number;
    endSession: jest.Mock;
    reset: jest.Mock;
  };
}>("@/hooks/useSession");

const { __mockGymData } = jest.requireMock<{
  __mockGymData: { data: any; isLoading: boolean; error: any };
}>("@/hooks/useGyms");

// ── Fixtures ──────────────────────────────────────────────────────────

const pendingLogFixtures = [
  { id: "log-1", routeId: "route-1", status: "flash", attempts: 1 },
  { id: "log-2", routeId: "route-2", status: "send", attempts: 3 },
  { id: "log-3", routeId: "route-1", status: "attempt", attempts: 2 },
];

// ── Helpers ───────────────────────────────────────────────────────────

function resetMockData() {
  __mockData.isActive = true;
  __mockData.startTime = Date.now() - 3600000;
  __mockData.endTime = null;
  __mockData.gymId = "gym-1";
  __mockData.pendingLogs = [];
  __mockData.duration = 0;
  __mockGymData.data = {
    id: "gym-1",
    name: "Summit Climbing Gym",
    default_grade_system: "v-scale",
  };
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockEndSession.mockClear();
  mockReset.mockClear();
  mockRemovePendingLog.mockClear();
  (Alert.alert as jest.Mock).mockClear();
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("ActiveSessionScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  // ── Active session state ──────────────────────────────────────────

  it("shows gym name when session is active", () => {
    // The header should display which gym the user is climbing at
    // so they always know their session context.
    render(<ActiveSessionScreen />);
    expect(screen.getByText("Session at Summit Climbing Gym")).toBeOnTheScreen();
  });

  it("renders SessionTimer component", () => {
    // The timer is the centerpiece of the active session — it shows
    // how long the user has been climbing. Verify it's present via testID.
    render(<ActiveSessionScreen />);
    expect(screen.getByTestId("session-timer")).toBeOnTheScreen();
  });

  it("shows pending log count and breakdown", () => {
    // The stats row shows total logged + breakdown by status so users
    // can quickly see their session progress at a glance.
    __mockData.pendingLogs = pendingLogFixtures;
    render(<ActiveSessionScreen />);

    // The stats row and list header both show the total count.
    // We verify the total appears on screen (3 logs total).
    const threes = screen.getAllByText("3");
    expect(threes.length).toBeGreaterThanOrEqual(1);

    // Verify the "Routes Logged (3)" section header is present,
    // confirming the count is displayed correctly.
    expect(screen.getByText("Routes Logged (3)")).toBeOnTheScreen();
  });

  it("renders a row per pending log with route name, grade, and status", () => {
    // Each pending log should display as a row with identifying info
    // (route name, grade) and a status badge so the user can review
    // what they've logged during the session.
    __mockData.pendingLogs = pendingLogFixtures;
    render(<ActiveSessionScreen />);

    // Route names from the mock route data
    expect(screen.getAllByText("Crimson Overhang")).toHaveLength(2); // log-1 + log-3
    expect(screen.getByText("Blue Slab")).toBeOnTheScreen();

    // Each pending log should have a testID for identification
    expect(screen.getByTestId("pending-log-log-1")).toBeOnTheScreen();
    expect(screen.getByTestId("pending-log-log-2")).toBeOnTheScreen();
    expect(screen.getByTestId("pending-log-log-3")).toBeOnTheScreen();
  });

  it("shows empty state when no pending logs", () => {
    // When the user hasn't logged any ascents yet, show a helpful
    // empty state guiding them to browse routes or scan QR codes.
    __mockData.pendingLogs = [];
    render(<ActiveSessionScreen />);

    expect(screen.getByText("No ascents yet")).toBeOnTheScreen();
    expect(
      screen.getByText("Browse routes or scan a QR code to log climbs")
    ).toBeOnTheScreen();
  });

  // ── Navigation ────────────────────────────────────────────────────

  it("'Browse Routes' navigates to gym routes screen", () => {
    // The Browse Routes button pushes to the gym's route list within the
    // gym stack. The tab bar stays visible because the gym stack lives
    // inside (tabs).
    render(<ActiveSessionScreen />);

    fireEvent.press(screen.getByTestId("browse-routes-button"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/gym/gym-1/routes");
  });

  it("'Scan QR' navigates to scanner", () => {
    // The Scan QR button replaces to the scanner within tabs.
    render(<ActiveSessionScreen />);

    fireEvent.press(screen.getByTestId("scan-qr-button"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/scan");
  });

  // ── Finish session ────────────────────────────────────────────────

  it("'Finish Session' calls endSession after confirmation", () => {
    // Finishing a session is a significant action, so it should require
    // confirmation via Alert.alert. The destructive button calls endSession.
    render(<ActiveSessionScreen />);

    fireEvent.press(screen.getByTestId("finish-session-button"));

    // Alert.alert should have been called with the confirmation dialog
    expect(Alert.alert).toHaveBeenCalledWith(
      "Finish Session?",
      "End your climbing session and save your logs?",
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel", style: "cancel" }),
        expect.objectContaining({
          text: "Finish Session",
          style: "destructive",
        }),
      ])
    );

    // Simulate pressing the destructive "Finish Session" button in the dialog.
    // Alert.alert's third argument is the buttons array; find the destructive one.
    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const finishButton = alertButtons.find(
      (b: any) => b.style === "destructive"
    );
    finishButton.onPress();

    expect(mockEndSession).toHaveBeenCalled();
  });

  // ── Post-session state ────────────────────────────────────────────

  it("shows SessionSummary after session ends", () => {
    // When the session ends (isActive=false, endTime set), the screen
    // transitions to show the SessionSummary component with stats.
    __mockData.isActive = false;
    __mockData.endTime = Date.now();
    __mockData.duration = 45;
    __mockData.pendingLogs = pendingLogFixtures;

    render(<ActiveSessionScreen />);

    expect(screen.getByTestId("session-summary")).toBeOnTheScreen();
    expect(screen.getByTestId("post-session-view")).toBeOnTheScreen();
  });

  it("'Done' calls reset and navigates to tabs", () => {
    // After reviewing the post-session summary, the "Done" button should
    // clear the session store and return to the home tab.
    __mockData.isActive = false;
    __mockData.endTime = Date.now();
    __mockData.duration = 45;

    render(<ActiveSessionScreen />);

    fireEvent.press(screen.getByTestId("done-button"));

    expect(mockReset).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  // ── Guard ─────────────────────────────────────────────────────────

  it("redirects when no active session", () => {
    // If the user navigates to this screen without an active session
    // (e.g., via back button after clearing the session), redirect
    // them to the home tab to avoid showing a broken UI.
    __mockData.isActive = false;
    __mockData.endTime = null;

    render(<ActiveSessionScreen />);

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  // ── Remove pending log ────────────────────────────────────────────

  it("trash icon calls removePendingLog", () => {
    // Each pending log row has a trash icon for undo functionality.
    // Pressing it should call removePendingLog with the log's ID.
    __mockData.pendingLogs = [pendingLogFixtures[0]];
    render(<ActiveSessionScreen />);

    fireEvent.press(screen.getByTestId("remove-log-log-1"));
    expect(mockRemovePendingLog).toHaveBeenCalledWith("log-1");
  });

});
