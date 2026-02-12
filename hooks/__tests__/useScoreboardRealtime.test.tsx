/**
 * useScoreboardRealtime Hook Tests
 *
 * Tests the Realtime subscription that keeps the live scoreboard fresh.
 * When competition_scores rows change (INSERT, UPDATE, DELETE), the hook
 * invalidates the ["eventScores", eventId] query key so TanStack Query
 * refetches the data.
 *
 * Mock strategy (same pattern as useNotifications.test.tsx):
 *   - Mock Supabase channel lifecycle: channel → on → subscribe
 *   - Define mocks INSIDE jest.mock() factory (hoisting-safe)
 *   - Access mocks via jest.requireMock after import
 *   - Render hook in QueryClientProvider, spy on invalidateQueries
 */

import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock Supabase (Realtime channel chain) ───────────────────────────
// Defined inside the factory to avoid the jest-expo hoisting issue.
// The chain: supabase.channel() → .on() → .subscribe()
jest.mock("@/lib/supabase", () => {
  const mockSubscribe = jest.fn().mockReturnValue({ unsubscribe: jest.fn() });
  const mockOn = jest.fn().mockReturnValue({ subscribe: mockSubscribe });
  const mockChannel = jest.fn().mockReturnValue({ on: mockOn });
  const mockRemoveChannel = jest.fn();
  return {
    supabase: {
      channel: mockChannel,
      removeChannel: mockRemoveChannel,
    },
  };
});

import { useScoreboardRealtime } from "../useScoreboardRealtime";

// Access the mock functions created inside the factory
const { supabase } = jest.requireMock<{
  supabase: {
    channel: jest.Mock;
    removeChannel: jest.Mock;
  };
}>("@/lib/supabase");

// Drill into the chain to get the .on() mock for callback extraction
const mockOn = supabase.channel().on as jest.Mock;

// ── Test wrapper ─────────────────────────────────────────────────────
function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("useScoreboardRealtime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("subscribes to competition_scores changes for the given eventId", () => {
    const { Wrapper } = createWrapper();

    renderHook(() => useScoreboardRealtime("event-42"), {
      wrapper: Wrapper,
    });

    // Should create a channel named after the event
    expect(supabase.channel).toHaveBeenCalledWith("scoreboard-event-42");

    // Should subscribe to postgres_changes with wildcard event and
    // a filter scoped to this event's scores
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "*",
        schema: "public",
        table: "competition_scores",
        filter: "event_id=eq.event-42",
      }),
      expect.any(Function)
    );
  });

  it("does not subscribe when eventId is null", () => {
    const { Wrapper } = createWrapper();

    renderHook(() => useScoreboardRealtime(null), {
      wrapper: Wrapper,
    });

    // channel() is called once during setup (jest.requireMock chain),
    // but the hook itself should not call it
    const callCountBefore = supabase.channel.mock.calls.length;
    expect(callCountBefore).toBe(0);
  });

  it("does not subscribe when eventId is undefined", () => {
    const { Wrapper } = createWrapper();

    renderHook(() => useScoreboardRealtime(undefined), {
      wrapper: Wrapper,
    });

    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it("invalidates eventScores query when a change arrives", () => {
    const { Wrapper, client } = createWrapper();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    renderHook(() => useScoreboardRealtime("event-42"), {
      wrapper: Wrapper,
    });

    // Extract the callback registered with .on() — it's the 3rd argument
    const callback = mockOn.mock.calls[0][2];

    // Simulate a Realtime event (e.g., a new score was inserted)
    act(() => {
      callback({});
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["eventScores", "event-42"],
    });
  });

  it("removes the channel on unmount", () => {
    const { Wrapper } = createWrapper();

    const { unmount } = renderHook(
      () => useScoreboardRealtime("event-42"),
      { wrapper: Wrapper }
    );

    unmount();

    // The cleanup function should call removeChannel with the channel object
    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
