/**
 * Admin Seasons Screen Tests (Step 15.6)
 *
 * Tests the season management screen that displays:
 *   - Loading / error / empty states
 *   - Season list with name, date range, status badge
 *   - Status filter tabs (All / Active / Closed)
 *   - Create season form (toggle, fields, submit)
 *   - "Close Season" button on active seasons (with confirmation)
 *   - Delete button on closed seasons
 *
 * Mock strategy (matching maintenance.test.tsx):
 *   - useSeasons: mutable __mockData pattern
 *   - useCreateSeason / useCloseSeason / useDeleteSeason: jest.fn() mutateAsync
 *   - useAuth: stable admin user with adminGymId
 *   - lucide-react-native: Text stubs
 */

import React from "react";
import { Alert } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1" },
    adminGymId: "gym-1",
    role: "gym_admin",
  }),
}));

// ── Mock useSeasons hooks ───────────────────────────────────────────
// Mutable __mockData objects let each test control what the hook returns.
const mockCreateMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockCloseMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockDeleteMutateAsync = jest.fn().mockResolvedValue(undefined);

jest.mock("@/hooks/useSeasons", () => {
  const mockSeasonsData = {
    seasons: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useSeasons: () => mockSeasonsData,
    useCreateSeason: () => ({
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    }),
    useCloseSeason: () => ({
      mutateAsync: mockCloseMutateAsync,
      isPending: false,
    }),
    useDeleteSeason: () => ({
      mutateAsync: mockDeleteMutateAsync,
      isPending: false,
    }),
    __mockSeasonsData: mockSeasonsData,
  };
});

// ── Mock lucide icons ───────────────────────────────────────────────
jest.mock("lucide-react-native", () => ({
  Trash2: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>Trash</Text>;
  },
  Plus: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>Plus</Text>;
  },
  X: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>X</Text>;
  },
}));

// ── Spy on Alert.alert ──────────────────────────────────────────────
// The screen uses Alert.alert for close-season confirmation. We spy on it
// to verify it's called and to simulate the user pressing "Close".
jest.spyOn(Alert, "alert");

import SeasonsScreen from "../seasons";

// Pull mutable mock data reference after import
const { __mockSeasonsData } = jest.requireMock<{
  __mockSeasonsData: {
    seasons: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useSeasons");

// ── Fixtures ────────────────────────────────────────────────────────

const mockSeasons = [
  {
    id: "s1",
    gym_id: "gym-1",
    name: "Spring 2026",
    start_date: "2026-03-01",
    end_date: "2026-06-01",
    status: "active",
    created_at: "2026-02-15T10:00:00Z",
  },
  {
    id: "s2",
    gym_id: "gym-1",
    name: "Winter 2025",
    start_date: "2025-12-01",
    end_date: "2026-03-01",
    status: "closed",
    created_at: "2025-11-15T10:00:00Z",
  },
];

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockSeasonsData.seasons = [];
  __mockSeasonsData.isLoading = false;
  __mockSeasonsData.error = null;
  mockCreateMutateAsync.mockClear();
  mockCloseMutateAsync.mockClear();
  mockDeleteMutateAsync.mockClear();
  (Alert.alert as jest.Mock).mockClear();
}

// ── Tests ───────────────────────────────────────────────────────────

describe("SeasonsScreen", () => {
  beforeEach(resetMockData);

  it("renders loading state", () => {
    __mockSeasonsData.isLoading = true;
    render(<SeasonsScreen />);
    expect(screen.getByTestId("loading-indicator")).toBeTruthy();
  });

  it("renders error state", () => {
    __mockSeasonsData.error = new Error("Permission denied");
    render(<SeasonsScreen />);
    expect(screen.getByText(/Permission denied/)).toBeTruthy();
  });

  it("renders empty state when no seasons", () => {
    __mockSeasonsData.seasons = [];
    render(<SeasonsScreen />);
    expect(screen.getByText(/No seasons/i)).toBeTruthy();
  });

  it("renders season list with name, date range, and status badge", () => {
    __mockSeasonsData.seasons = mockSeasons;
    render(<SeasonsScreen />);

    // First season — name and full date range string
    expect(screen.getByText("Spring 2026")).toBeTruthy();
    expect(screen.getByText("2026-03-01 → 2026-06-01")).toBeTruthy();

    // Second season
    expect(screen.getByText("Winter 2025")).toBeTruthy();
    expect(screen.getByText("2025-12-01 → 2026-03-01")).toBeTruthy();

    // Status badges — active and closed
    expect(screen.getByText("active")).toBeTruthy();
    expect(screen.getByText("closed")).toBeTruthy();
  });

  // ── Filter tabs ──────────────────────────────────────────────────

  it("filters seasons by status when tabs are pressed", () => {
    __mockSeasonsData.seasons = mockSeasons;
    render(<SeasonsScreen />);

    // "All" tab is active by default — both seasons visible
    expect(screen.getByText("Spring 2026")).toBeTruthy();
    expect(screen.getByText("Winter 2025")).toBeTruthy();

    // Tap "Active" tab — only active season visible
    fireEvent.press(screen.getByText("Active"));
    expect(screen.getByText("Spring 2026")).toBeTruthy();
    expect(screen.queryByText("Winter 2025")).toBeNull();

    // Tap "Closed" tab — only closed season visible
    fireEvent.press(screen.getByText("Closed"));
    expect(screen.queryByText("Spring 2026")).toBeNull();
    expect(screen.getByText("Winter 2025")).toBeTruthy();
  });

  // ── Create form ──────────────────────────────────────────────────

  it("toggles create form and submits a new season", () => {
    __mockSeasonsData.seasons = [];
    render(<SeasonsScreen />);

    // Form should be hidden initially
    expect(screen.queryByPlaceholderText("Season name")).toBeNull();

    // Tap "+ New Season" to show the form
    fireEvent.press(screen.getByText("+ New Season"));
    expect(screen.getByPlaceholderText("Season name")).toBeTruthy();

    // Fill in the form fields
    fireEvent.changeText(screen.getByPlaceholderText("Season name"), "Summer 2026");
    fireEvent.changeText(screen.getByPlaceholderText("Start date (YYYY-MM-DD)"), "2026-06-01");
    fireEvent.changeText(screen.getByPlaceholderText("End date (YYYY-MM-DD)"), "2026-09-01");

    // Submit
    fireEvent.press(screen.getByText("Save"));

    expect(mockCreateMutateAsync).toHaveBeenCalledWith({
      gym_id: "gym-1",
      name: "Summer 2026",
      start_date: "2026-06-01",
      end_date: "2026-09-01",
    });
  });

  // ── Close season ─────────────────────────────────────────────────

  it("shows confirmation alert when Close Season is pressed", () => {
    __mockSeasonsData.seasons = [mockSeasons[0]]; // active season
    render(<SeasonsScreen />);

    fireEvent.press(screen.getByText("Close Season"));

    // Alert.alert should have been called with a confirmation dialog
    expect(Alert.alert).toHaveBeenCalledWith(
      "Close Season",
      expect.stringContaining("archive all active routes"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Close" }),
      ])
    );
  });

  it("calls closeSeason when confirmation is accepted", () => {
    __mockSeasonsData.seasons = [mockSeasons[0]]; // active season
    render(<SeasonsScreen />);

    fireEvent.press(screen.getByText("Close Season"));

    // Simulate pressing "Close" in the Alert dialog
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const closeButton = alertCall[2].find((btn: any) => btn.text === "Close");
    closeButton.onPress();

    expect(mockCloseMutateAsync).toHaveBeenCalledWith({
      seasonId: "s1",
      gymId: "gym-1",
    });
  });

  // ── Delete season ────────────────────────────────────────────────

  it("calls deleteSeason when delete button is pressed on closed season", () => {
    __mockSeasonsData.seasons = [mockSeasons[1]]; // closed season
    render(<SeasonsScreen />);

    const deleteButton = screen.getByTestId("delete-season-s2");
    fireEvent.press(deleteButton);

    expect(mockDeleteMutateAsync).toHaveBeenCalledWith({ seasonId: "s2" });
  });

  it("renders the screen header", () => {
    render(<SeasonsScreen />);
    expect(screen.getByText("Season Management")).toBeTruthy();
  });
});
