/**
 * useGyms / useGym / useFavoriteGyms / useToggleFavoriteGym Hook Tests
 *
 * These hooks wrap gymService methods with TanStack Query, adding
 * caching for gym lists and details, plus queries and mutations for
 * managing the user's favorite gyms.
 *
 * The favorites system uses a join table (favorite_gyms) instead of
 * a single gym on the profile. Users can favorite multiple gyms.
 * useToggleFavoriteGym handles both add and remove via the isFavorited flag.
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
    getFavoriteGyms: jest.fn(),
    addFavoriteGym: jest.fn(),
    removeFavoriteGym: jest.fn(),
  },
}));

import { useGyms, useGym, useFavoriteGyms, useToggleFavoriteGym } from "../useGyms";

const { gymService } = jest.requireMock<{
  gymService: {
    getGyms: jest.Mock;
    getGymById: jest.Mock;
    getFavoriteGyms: jest.Mock;
    addFavoriteGym: jest.Mock;
    removeFavoriteGym: jest.Mock;
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

describe("useFavoriteGyms", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches favorite gyms for a user and returns ids Set + gym objects", async () => {
    // The hook queries the favorite_gyms join table and returns both a
    // Set of gym IDs (for fast lookup) and the full gym objects.
    gymService.getFavoriteGyms.mockResolvedValueOnce({
      data: [
        { gym_id: "gym-1", gyms: { id: "gym-1", name: "Ape Index" } },
        { gym_id: "gym-2", gyms: { id: "gym-2", name: "Summit Gym" } },
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useFavoriteGyms("user-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.ids).toEqual(new Set(["gym-1", "gym-2"]));
    expect(result.current.data?.gyms).toHaveLength(2);
    expect(gymService.getFavoriteGyms).toHaveBeenCalledWith("user-1");
  });

  it("is disabled when userId is undefined", () => {
    // When the user isn't logged in, the query shouldn't fire.
    const { result } = renderHook(
      () => useFavoriteGyms(undefined),
      { wrapper: createWrapper() }
    );

    expect(gymService.getFavoriteGyms).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});

describe("useToggleFavoriteGym", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls addFavoriteGym when isFavorited is false", async () => {
    // When the gym is not yet favorited, the toggle should add it.
    gymService.addFavoriteGym.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(
      () => useToggleFavoriteGym(),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        gymId: "gym-1",
        isFavorited: false,
      });
    });

    expect(gymService.addFavoriteGym).toHaveBeenCalledWith("user-1", "gym-1");
    expect(gymService.removeFavoriteGym).not.toHaveBeenCalled();
  });

  it("calls removeFavoriteGym when isFavorited is true", async () => {
    // When the gym is currently favorited, the toggle should remove it.
    gymService.removeFavoriteGym.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(
      () => useToggleFavoriteGym(),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        gymId: "gym-1",
        isFavorited: true,
      });
    });

    expect(gymService.removeFavoriteGym).toHaveBeenCalledWith("user-1", "gym-1");
    expect(gymService.addFavoriteGym).not.toHaveBeenCalled();
  });

  it("sets error state on failure", async () => {
    // When the service returns an error, the mutation's error state
    // should be set so the screen can show a failure message.
    gymService.addFavoriteGym.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(
      () => useToggleFavoriteGym(),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      try {
        await result.current.mutateAsync({
          userId: "user-1",
          gymId: "gym-1",
          isFavorited: false,
        });
      } catch {
        // Expected — mutateAsync throws on error
      }
    });

    expect(result.current.error).toBeTruthy();
  });
});
