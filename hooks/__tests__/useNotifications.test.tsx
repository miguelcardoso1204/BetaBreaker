/**
 * useNotifications Hook Tests — Push Token Query & Mutation Logic
 *
 * These hooks wrap notificationsService with TanStack Query to provide:
 *   - `useRegisterPushToken()` — mutation to persist an Expo push token
 *   - `useUnregisterPushToken()` — mutation to remove a token on logout
 *   - `usePushTokens()` — query to fetch the user's registered tokens
 *
 * Mock strategy (matching useModeration.test.tsx):
 *   - Mock notificationsService (not Supabase) — hooks don't know about PostgREST
 *   - Mock useAuth to provide a stable user ID
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock notificationsService ───────────────────────────────────────
jest.mock("@/services/notifications.service", () => ({
  notificationsService: {
    registerPushToken: jest.fn(),
    unregisterPushToken: jest.fn(),
    getPushTokens: jest.fn(),
  },
}));

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { user: { id: "user-1" } },
    isAuthenticated: true,
  }),
}));

import {
  useRegisterPushToken,
  useUnregisterPushToken,
  usePushTokens,
} from "../useNotifications";

const { notificationsService } = jest.requireMock<{
  notificationsService: {
    registerPushToken: jest.Mock;
    unregisterPushToken: jest.Mock;
    getPushTokens: jest.Mock;
  };
}>("@/services/notifications.service");

// ── Test wrapper ────────────────────────────────────────────────────
// TanStack Query hooks need a QueryClientProvider. Fresh client per
// test prevents cache leakage between tests.

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

// ── useRegisterPushToken tests ──────────────────────────────────────

describe("useRegisterPushToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls service with userId from auth, token, and platform", async () => {
    // The mutation takes { token, platform } from the caller and injects
    // the userId from useAuth automatically — same pattern as useCreateReport.
    notificationsService.registerPushToken.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useRegisterPushToken(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        token: "ExponentPushToken[abc123]",
        platform: "ios",
      });
    });

    expect(notificationsService.registerPushToken).toHaveBeenCalledWith(
      "user-1", // userId from useAuth mock
      "ExponentPushToken[abc123]",
      "ios"
    );
  });
});

// ── useUnregisterPushToken tests ────────────────────────────────────

describe("useUnregisterPushToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls service with userId from auth and token", async () => {
    // On logout, we pass the token to remove. The hook injects userId
    // from auth context so the caller doesn't need to track it.
    notificationsService.unregisterPushToken.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useUnregisterPushToken(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        token: "ExponentPushToken[abc123]",
      });
    });

    expect(notificationsService.unregisterPushToken).toHaveBeenCalledWith(
      "user-1", // userId from useAuth mock
      "ExponentPushToken[abc123]"
    );
  });
});

// ── usePushTokens tests ─────────────────────────────────────────────

describe("usePushTokens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns tokens from service", async () => {
    // The settings screen might show which devices are registered.
    const mockTokens = [
      {
        id: "tok-1",
        user_id: "user-1",
        token: "ExponentPushToken[abc123]",
        platform: "ios",
        created_at: "2026-02-11T00:00:00Z",
      },
    ];

    notificationsService.getPushTokens.mockResolvedValueOnce({
      data: mockTokens,
      error: null,
    });

    const { result } = renderHook(() => usePushTokens(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tokens).toEqual(mockTokens);
    expect(notificationsService.getPushTokens).toHaveBeenCalledWith("user-1");
  });

  it("returns empty array when no tokens registered", async () => {
    // New users or users who denied permissions won't have tokens.
    notificationsService.getPushTokens.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => usePushTokens(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tokens).toEqual([]);
  });
});
