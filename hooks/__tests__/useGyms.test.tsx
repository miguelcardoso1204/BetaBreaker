/**
 * useGyms / useGym / useSetHomeGym Hook Tests
 *
 * These hooks wrap gymService methods with TanStack Query, adding
 * caching for gym lists and details, plus a mutation for setting
 * the user's home gym.
 *
 * The setHomeGym mutation is the first useMutation in the codebase.
 * Unlike useQuery (read), useMutation handles write operations and
 * lets us invalidate related caches after the write succeeds — so
 * the auth profile refreshes to show the new homeGymId.
 *
 * Mock strategy: We mock the SERVICE layer (gymService), not Supabase.
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock gymService ──────────────────────────────────────────────
jest.mock("@/services/gyms.service", () => ({
  gymService: {
    getGyms: jest.fn(),
    getGymById: jest.fn(),
    setHomeGym: jest.fn(),
  },
}));

import { useGyms, useGym, useSetHomeGym } from "../useGyms";

const { gymService } = jest.requireMock<{
  gymService: {
    getGyms: jest.Mock;
    getGymById: jest.Mock;
    setHomeGym: jest.Mock;
  };
}>("@/services/gyms.service");

// ── Test wrapper ─────────────────────────────────────────────────

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// ── Fixtures ─────────────────────────────────────────────────────

const mockGyms = [
  { id: "gym-1", name: "Ape Index", default_grade_system: "v-scale" },
  { id: "gym-2", name: "Summit Gym", default_grade_system: "font" },
];

const mockGymDetail = {
  id: "gym-1",
  name: "Ape Index",
  address: "123 Climb St",
  latitude: 40.7128,
  longitude: -74.006,
  social_links: { instagram: "@apeindex" },
  default_grade_system: "v-scale",
};

describe("useGyms", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Before the query resolves, isLoading should be true.
    gymService.getGyms.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useGyms(),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns gyms data after fetch", async () => {
    // The service returns { data, error } — the hook unwraps it.
    gymService.getGyms.mockResolvedValueOnce({
      data: mockGyms,
      error: null,
    });

    const { result } = renderHook(
      () => useGyms(),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockGyms);
  });
});

describe("useGym", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches a single gym by ID", async () => {
    // The detail hook fetches one gym for the gym detail screen.
    gymService.getGymById.mockResolvedValueOnce({
      data: mockGymDetail,
      error: null,
    });

    const { result } = renderHook(
      () => useGym("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockGymDetail);
    expect(gymService.getGymById).toHaveBeenCalledWith("gym-1");
  });
});

describe("useSetHomeGym", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls gymService.setHomeGym with userId and gymId", async () => {
    // The mutation hook wraps the service's setHomeGym method.
    // useMutation exposes a `mutateAsync` function that the screen
    // calls when the user taps "Set as Home Gym".
    gymService.setHomeGym.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(
      () => useSetHomeGym(),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        gymId: "gym-1",
      });
    });

    expect(gymService.setHomeGym).toHaveBeenCalledWith("user-1", "gym-1");
  });

  it("sets error state on failure", async () => {
    // When the service returns an error, the mutation's error state
    // should be set so the screen can show a failure message.
    gymService.setHomeGym.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(
      () => useSetHomeGym(),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      try {
        await result.current.mutateAsync({
          userId: "user-1",
          gymId: "gym-1",
        });
      } catch {
        // Expected — mutateAsync throws on error
      }
    });

    expect(result.current.error).toBeTruthy();
  });
});
