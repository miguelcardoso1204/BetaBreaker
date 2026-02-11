/**
 * Admin Moderation Screen Tests
 *
 * Tests the admin moderation queue that displays pending content reports.
 * Admins see a list of flagged content with "Dismiss" and "Reviewed"
 * action buttons to resolve each report.
 *
 * Mock strategy:
 *   - useModeration hooks: control reports data and capture mutation calls
 *   - No need to mock expo-router since this screen doesn't navigate
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock useModeration hooks ─────────────────────────────────────────
const mockResolveReport = jest.fn();

jest.mock("@/hooks/useModeration", () => {
  // Use a mutable object so tests can change data before rendering
  const mockReportsData = {
    reports: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useReports: () => mockReportsData,
    useResolveReport: () => ({
      mutate: mockResolveReport,
    }),
    __mockReportsData: mockReportsData,
  };
});

import ModerationScreen from "../moderation";

const { __mockReportsData } = jest.requireMock<{
  __mockReportsData: {
    reports: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useModeration");

// ── Fixtures ─────────────────────────────────────────────────────────

const mockReport = {
  id: "report-1",
  reporter_id: "user-2",
  target_type: "feedback",
  target_id: "target-1",
  reason: "Spam",
  status: "pending",
  created_at: "2026-02-11T10:30:00Z",
  reporter: { display_name: "Alex Reporter", avatar_url: null },
};

// ── Helper ───────────────────────────────────────────────────────────

function resetMockData() {
  __mockReportsData.reports = [];
  __mockReportsData.isLoading = false;
  __mockReportsData.error = null;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("ModerationScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  it("shows loading state", () => {
    __mockReportsData.isLoading = true;

    render(<ModerationScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("renders pending reports", () => {
    // The moderation queue should display each report with the
    // reporter's name, target type, and reason.
    __mockReportsData.reports = [mockReport];

    render(<ModerationScreen />);

    expect(screen.getByText("Alex Reporter")).toBeOnTheScreen();
    expect(screen.getByText(/Beta Tip/)).toBeOnTheScreen();
    expect(screen.getByText(/Spam/)).toBeOnTheScreen();
  });

  it("shows empty state when no reports", () => {
    __mockReportsData.reports = [];

    render(<ModerationScreen />);

    expect(screen.getByText("No pending reports")).toBeOnTheScreen();
  });

  it("Dismiss button calls resolveReport with 'dismissed'", () => {
    // Tapping "Dismiss" should mark the report as a false alarm.
    __mockReportsData.reports = [mockReport];

    render(<ModerationScreen />);

    fireEvent.press(screen.getByText("Dismiss"));

    expect(mockResolveReport).toHaveBeenCalledWith({
      reportId: "report-1",
      status: "dismissed",
    });
  });

  it("Reviewed button calls resolveReport with 'reviewed'", () => {
    // Tapping "Reviewed" should mark the report as actioned.
    __mockReportsData.reports = [mockReport];

    render(<ModerationScreen />);

    fireEvent.press(screen.getByText("Reviewed"));

    expect(mockResolveReport).toHaveBeenCalledWith({
      reportId: "report-1",
      status: "reviewed",
    });
  });
});
