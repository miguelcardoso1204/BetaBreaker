/**
 * useProfile Hook Tests — Stats, Update, Export, Delete
 *
 * These hooks wrap profileService methods with TanStack Query, adding
 * caching for stats and mutations for profile edits, data export, and
 * account deletion.
 *
 * Mock strategy: We mock the SERVICE layer (profileService), not Supabase.
 * This tests that the hooks correctly:
 * - Pass arguments to service methods
 * - Unwrap { data, error } and throw on errors
 * - Call side-effect callbacks (refreshProfile, signOut) after mutations
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock profileService ─────────────────────────────────────────────
jest.mock("@/services/profile.service", () => ({
  profileService: {
    getProfileStats: jest.fn(),
    updateProfile: jest.fn(),
    exportData: jest.fn(),
    deleteAccount: jest.fn(),
  },
}));

import {
  useProfileStats,
  useUpdateProfile,
  useExportData,
  useDeleteAccount,
} from "../useProfile";

const { profileService } = jest.requireMock<{
  profileService: {
    getProfileStats: jest.Mock;
    updateProfile: jest.Mock;
    exportData: jest.Mock;
    deleteAccount: jest.Mock;
  };
}>("@/services/profile.service");

// ── Test wrapper — provides TanStack QueryClient ─────────────────────
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

// ── useProfileStats ──────────────────────────────────────────────────

describe("useProfileStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns stats data after successful fetch", async () => {
    // The RPC returns a TABLE result — Supabase wraps it as an array.
    // For a single-row TABLE function, data is the first element.
    const mockStats = [{ total_sends: 42, max_grade: 20 }];
    profileService.getProfileStats.mockResolvedValueOnce({
      data: mockStats,
      error: null,
    });

    const { result } = renderHook(() => useProfileStats("user-123"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockStats);
    expect(profileService.getProfileStats).toHaveBeenCalledWith("user-123");
  });

  it("does not fetch when userId is null (disabled)", () => {
    // When the user isn't authenticated, userId is null. The hook should
    // not fire a query — enabled: !!userId prevents wasted network calls.
    const { result } = renderHook(() => useProfileStats(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe("idle");
    expect(profileService.getProfileStats).not.toHaveBeenCalled();
  });

  it("sets error state when RPC fails", async () => {
    // If the service returns an error, the hook should throw it so
    // TanStack Query's error state is populated for the UI.
    profileService.getProfileStats.mockResolvedValueOnce({
      data: null,
      error: { message: "connection failed" },
    });

    const { result } = renderHook(() => useProfileStats("user-123"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeTruthy();
  });
});

// ── useUpdateProfile ─────────────────────────────────────────────────

describe("useUpdateProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls profileService.updateProfile and refreshes profile on success", async () => {
    profileService.updateProfile.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const mockRefresh = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateProfile(mockRefresh), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-123",
        fields: { display_name: "NewName" },
      });
    });

    expect(profileService.updateProfile).toHaveBeenCalledWith("user-123", {
      display_name: "NewName",
    });
    // refreshProfile should be called after success to sync useAuth state
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("sets error state when update fails", async () => {
    profileService.updateProfile.mockResolvedValueOnce({
      data: null,
      error: { message: "RLS violation" },
    });
    const mockRefresh = jest.fn();

    const { result } = renderHook(() => useUpdateProfile(mockRefresh), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          userId: "user-123",
          fields: { display_name: "Hacked" },
        });
      } catch {
        // Expected — mutateAsync throws on error
      }
    });

    expect(result.current.error).toBeTruthy();
    // refreshProfile should NOT be called on failure
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

// ── useExportData ────────────────────────────────────────────────────

describe("useExportData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns JSONB data blob on success", async () => {
    const mockExport = {
      profile: { id: "user-123" },
      ascents: [{ id: "a1" }],
      badges: [],
      streaks: null,
    };
    profileService.exportData.mockResolvedValueOnce({
      data: mockExport,
      error: null,
    });

    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    let exportedData: any;
    await act(async () => {
      exportedData = await result.current.mutateAsync();
    });

    expect(profileService.exportData).toHaveBeenCalledTimes(1);
    expect(exportedData).toEqual(mockExport);
  });
});

// ── useDeleteAccount ─────────────────────────────────────────────────

describe("useDeleteAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls deleteAccount RPC and signs out on success", async () => {
    profileService.deleteAccount.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const mockSignOut = jest.fn().mockResolvedValue({ error: null });

    const { result } = renderHook(() => useDeleteAccount(mockSignOut), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(profileService.deleteAccount).toHaveBeenCalledTimes(1);
    // signOut should be called after successful deletion to clear local session
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("sets error state when deletion fails (does not sign out)", async () => {
    profileService.deleteAccount.mockResolvedValueOnce({
      data: null,
      error: { message: "cascade failed" },
    });
    const mockSignOut = jest.fn();

    const { result } = renderHook(() => useDeleteAccount(mockSignOut), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        // Expected — mutateAsync throws on error
      }
    });

    expect(result.current.error).toBeTruthy();
    // signOut should NOT be called when deletion fails — the account still exists
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
