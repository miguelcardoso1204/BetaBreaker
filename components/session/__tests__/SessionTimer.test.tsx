/**
 * SessionTimer Component Tests
 *
 * The SessionTimer shows live elapsed time (HH:MM:SS) during an active
 * climbing session. It reads session state from useSession() and uses
 * formatElapsedTime() to convert milliseconds into display format.
 *
 * Test strategy:
 *   - Mock useSession to control isActive/startTime without needing
 *     the full Zustand store, TanStack Query, or Supabase client.
 *   - Use jest.useFakeTimers() to control Date.now() and setInterval,
 *     allowing us to simulate time passing without real delays.
 *   - Wrap timer advances in act() since they trigger state updates.
 *
 * Key mock gotcha (from MEMORY.md):
 *   Don't use 0 as startTime — it's falsy in JS, and the component
 *   checks `if (!startTime)`. Use 1_000_000 instead.
 */

import React from "react";
import { render, screen, act } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock useSession — return controlled session state.
// Define the mock return value inside the factory to avoid hoisting issues.
const mockUseSession = jest.fn(() => ({
  isActive: false,
  startTime: null as number | null,
  // Include other fields the hook returns (not used by SessionTimer,
  // but prevents destructuring errors if the component evolves).
  endTime: null as number | null,
  gymId: null as string | null,
  pendingLogs: [] as unknown[],
  duration: 0,
  startSession: jest.fn(),
  endSession: jest.fn(),
  reset: jest.fn(),
  logAscent: { mutate: jest.fn(), isPending: false },
  deleteAscent: { mutate: jest.fn(), isPending: false },
}));

jest.mock("@/hooks/useSession", () => ({
  useSession: () => mockUseSession(),
}));

// ── Import after mocks ───────────────────────────────────────────────

import { SessionTimer } from "../SessionTimer";

// ── Tests ────────────────────────────────────────────────────────────

describe("SessionTimer", () => {
  beforeEach(() => {
    // Use fake timers so we can control Date.now() and setInterval.
    // "modern" mode provides jest.setSystemTime for Date.now control.
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore real timers to avoid interference between test files.
    jest.useRealTimers();
  });

  it("shows 00:00:00 when session is inactive", () => {
    // When no session is active, the timer should display zeroed time.
    mockUseSession.mockReturnValue({
      isActive: false,
      startTime: null,
      endTime: null,
      gymId: null,
      pendingLogs: [],
      duration: 0,
      startSession: jest.fn(),
      endSession: jest.fn(),
      reset: jest.fn(),
      logAscent: { mutate: jest.fn(), isPending: false },
      deleteAscent: { mutate: jest.fn(), isPending: false },
    });

    render(<SessionTimer testID="timer" />);

    expect(screen.getByText("00:00:00")).toBeTruthy();
  });

  it("displays elapsed time when session is active", () => {
    // Simulate a session that started 65 seconds ago (1 min 5 sec).
    // Use 1_000_000 as the base timestamp — non-zero to avoid the
    // falsy zero gotcha documented in MEMORY.md.
    const startTime = 1_000_000;
    const now = startTime + 65_000; // 65 seconds later

    jest.setSystemTime(now);

    mockUseSession.mockReturnValue({
      isActive: true,
      startTime,
      endTime: null,
      gymId: "gym-1",
      pendingLogs: [],
      duration: 0,
      startSession: jest.fn(),
      endSession: jest.fn(),
      reset: jest.fn(),
      logAscent: { mutate: jest.fn(), isPending: false },
      deleteAscent: { mutate: jest.fn(), isPending: false },
    });

    render(<SessionTimer testID="timer" />);

    // 65 seconds = 1 minute 5 seconds → "00:01:05"
    expect(screen.getByText("00:01:05")).toBeTruthy();
  });

  it("updates on interval tick", () => {
    // Start at 1_000_000, then advance the system clock by 1 second.
    const startTime = 1_000_000;
    jest.setSystemTime(startTime + 5_000); // 5 seconds elapsed initially

    mockUseSession.mockReturnValue({
      isActive: true,
      startTime,
      endTime: null,
      gymId: "gym-1",
      pendingLogs: [],
      duration: 0,
      startSession: jest.fn(),
      endSession: jest.fn(),
      reset: jest.fn(),
      logAscent: { mutate: jest.fn(), isPending: false },
      deleteAscent: { mutate: jest.fn(), isPending: false },
    });

    render(<SessionTimer testID="timer" />);

    // Initial render: 5 seconds elapsed
    expect(screen.getByText("00:00:05")).toBeTruthy();

    // Advance timers to fire the interval callback. advanceTimersByTime
    // also moves the fake clock forward, so after advancing 1000ms the
    // system time becomes startTime + 5_000 + 1_000 = startTime + 6_000.
    // The interval callback computes Date.now() - startTime = 6000ms.
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Should now show 6 seconds (initial 5s + 1s interval tick)
    expect(screen.getByText("00:00:06")).toBeTruthy();
  });

  it("cleans up interval on unmount", () => {
    const startTime = 1_000_000;
    jest.setSystemTime(startTime + 1_000);

    mockUseSession.mockReturnValue({
      isActive: true,
      startTime,
      endTime: null,
      gymId: "gym-1",
      pendingLogs: [],
      duration: 0,
      startSession: jest.fn(),
      endSession: jest.fn(),
      reset: jest.fn(),
      logAscent: { mutate: jest.fn(), isPending: false },
      deleteAscent: { mutate: jest.fn(), isPending: false },
    });

    const { unmount } = render(<SessionTimer testID="timer" />);

    // Verify initial render
    expect(screen.getByText("00:00:01")).toBeTruthy();

    // Unmount the component — this should clear the interval
    unmount();

    // Spy on console.error to detect "setState on unmounted" warnings.
    // If the interval wasn't cleared, advancing time would trigger a
    // state update on an unmounted component.
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    act(() => {
      jest.setSystemTime(startTime + 10_000);
      jest.advanceTimersByTime(5000);
    });

    // No warnings should have been logged about unmounted state updates
    const stateUpdateWarnings = consoleSpy.mock.calls.filter((call) =>
      String(call[0]).includes("unmounted")
    );
    expect(stateUpdateWarnings).toHaveLength(0);

    consoleSpy.mockRestore();
  });
});
