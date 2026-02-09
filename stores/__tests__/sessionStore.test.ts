/**
 * Session Store Tests
 *
 * Tests the Zustand store that holds active climbing session state:
 * session lifecycle (start/end), pending ascent logs (add/remove),
 * duration computation, and full reset.
 *
 * Because Zustand stores are plain JavaScript (no React providers),
 * we can test them by calling actions directly and reading state
 * with getState() — no rendering or act() needed.
 *
 * Time is mocked via jest.spyOn(Date, 'now') so duration calculations
 * are deterministic regardless of actual wall-clock time.
 */

import { useSessionStore } from "../sessionStore";
import type { PendingLog } from "../sessionStore";

// ── Helpers ──────────────────────────────────────────────────────

/** Reset the store to its initial idle state before each test. */
const resetStore = () => {
  useSessionStore.setState({
    isActive: false,
    startTime: null,
    endTime: null,
    gymId: null,
    pendingLogs: [],
    duration: 0,
  });
};

/** Create a PendingLog with sensible defaults for testing. */
const makePendingLog = (overrides: Partial<PendingLog> = {}): PendingLog => ({
  id: "log-1",
  routeId: "route-abc",
  status: "send",
  attempts: 2,
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────

describe("sessionStore", () => {
  beforeEach(() => {
    resetStore();
    // Restore any mocked Date.now() between tests so mocks don't leak.
    jest.restoreAllMocks();
  });

  it("starts a session with isActive true, a numeric startTime, and the gymId", () => {
    // Mock Date.now() to return a fixed timestamp so we can assert exact values.
    const fixedTime = 1700000000000; // arbitrary ms timestamp
    jest.spyOn(Date, "now").mockReturnValue(fixedTime);

    useSessionStore.getState().startSession("gym-123");

    const state = useSessionStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.startTime).toBe(fixedTime);
    expect(state.gymId).toBe("gym-123");
    // Starting a session should clear any leftover state from a previous session.
    expect(state.endTime).toBeNull();
    expect(state.pendingLogs).toEqual([]);
    expect(state.duration).toBe(0);
  });

  it("ends a session with isActive false, a numeric endTime, and duration > 0", () => {
    const startMs = 1700000000000;
    // Simulate 90 minutes of climbing (90 * 60000 = 5,400,000 ms).
    const endMs = startMs + 90 * 60000;

    // Start session at startMs, then advance time to endMs before ending.
    jest.spyOn(Date, "now").mockReturnValue(startMs);
    useSessionStore.getState().startSession("gym-456");

    jest.spyOn(Date, "now").mockReturnValue(endMs);
    useSessionStore.getState().endSession();

    const state = useSessionStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.endTime).toBe(endMs);
    // 90 minutes exactly — Math.round(5400000 / 60000) = 90
    expect(state.duration).toBe(90);
    // gymId and startTime should still be preserved for the session record.
    expect(state.gymId).toBe("gym-456");
    expect(state.startTime).toBe(startMs);
  });

  it("adds a pending log to the queue", () => {
    useSessionStore.getState().startSession("gym-789");

    const log = makePendingLog({ id: "log-A", routeId: "route-1", status: "flash", attempts: 1 });
    useSessionStore.getState().addPendingLog(log);

    const { pendingLogs } = useSessionStore.getState();
    expect(pendingLogs).toHaveLength(1);
    expect(pendingLogs[0]).toEqual(log);

    // Add a second log — verify both are present and in order.
    const log2 = makePendingLog({ id: "log-B", routeId: "route-2", status: "attempt", attempts: 3 });
    useSessionStore.getState().addPendingLog(log2);

    const updated = useSessionStore.getState().pendingLogs;
    expect(updated).toHaveLength(2);
    expect(updated[0].id).toBe("log-A");
    expect(updated[1].id).toBe("log-B");
  });

  it("removes a pending log by ID while keeping others", () => {
    useSessionStore.getState().startSession("gym-789");

    // Add three logs
    const logA = makePendingLog({ id: "log-A" });
    const logB = makePendingLog({ id: "log-B" });
    const logC = makePendingLog({ id: "log-C" });
    useSessionStore.getState().addPendingLog(logA);
    useSessionStore.getState().addPendingLog(logB);
    useSessionStore.getState().addPendingLog(logC);

    // Remove the middle one
    useSessionStore.getState().removePendingLog("log-B");

    const { pendingLogs } = useSessionStore.getState();
    expect(pendingLogs).toHaveLength(2);
    expect(pendingLogs.map((l) => l.id)).toEqual(["log-A", "log-C"]);
  });

  it("computes duration correctly from mocked timestamps", () => {
    const startMs = 1700000000000;
    // 42.5 minutes → 42 * 60000 + 30000 = 2,550,000 ms → rounds to 43 minutes
    const endMs = startMs + 42.5 * 60000;

    jest.spyOn(Date, "now").mockReturnValue(startMs);
    useSessionStore.getState().startSession("gym-duration-test");

    jest.spyOn(Date, "now").mockReturnValue(endMs);
    useSessionStore.getState().endSession();

    // Math.round(2550000 / 60000) = Math.round(42.5) = 43 (rounds up at .5)
    // Note: In JavaScript, Math.round(42.5) = 43 (rounds to nearest even in
    // some languages, but JS always rounds .5 up).
    expect(useSessionStore.getState().duration).toBe(43);
  });

  it("resets all state back to initial values", () => {
    // Set up a fully populated session so we can verify everything resets.
    jest.spyOn(Date, "now").mockReturnValue(1700000000000);
    useSessionStore.getState().startSession("gym-reset");
    useSessionStore.getState().addPendingLog(makePendingLog());

    jest.spyOn(Date, "now").mockReturnValue(1700000060000);
    useSessionStore.getState().endSession();

    // Sanity: store is populated before reset
    expect(useSessionStore.getState().gymId).toBe("gym-reset");
    expect(useSessionStore.getState().pendingLogs).toHaveLength(1);
    expect(useSessionStore.getState().duration).toBe(1);

    // Reset and verify every field is back to its initial value
    useSessionStore.getState().reset();

    const state = useSessionStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.startTime).toBeNull();
    expect(state.endTime).toBeNull();
    expect(state.gymId).toBeNull();
    expect(state.pendingLogs).toEqual([]);
    expect(state.duration).toBe(0);
  });
});
