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
    getNotifications: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    getPreferences: jest.fn(),
    updatePreference: jest.fn(),
  },
}));

// ── Mock Supabase (for Realtime channel subscription) ──────────────
// The useNotificationRealtime hook calls supabase.channel() directly.
// We need to mock the entire channel lifecycle: channel → on → subscribe,
// and track the removeChannel cleanup call.
jest.mock("@/lib/supabase", () => {
  const subscribeMock = jest.fn().mockReturnValue({ unsubscribe: jest.fn() });
  const onMock = jest.fn().mockReturnValue({ subscribe: subscribeMock });
  const channelMock = jest.fn().mockReturnValue({ on: onMock });
  const removeChannelMock = jest.fn();
  return {
    supabase: {
      channel: channelMock,
      removeChannel: removeChannelMock,
    },
  };
});

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
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useNotificationPreferences,
  useUpdatePreference,
  useNotificationRealtime,
} from "../useNotifications";

const { notificationsService } = jest.requireMock<{
  notificationsService: {
    registerPushToken: jest.Mock;
    unregisterPushToken: jest.Mock;
    getPushTokens: jest.Mock;
    getNotifications: jest.Mock;
    getUnreadCount: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
    getPreferences: jest.Mock;
    updatePreference: jest.Mock;
  };
}>("@/services/notifications.service");

const { supabase } = jest.requireMock<{
  supabase: {
    channel: jest.Mock;
    removeChannel: jest.Mock;
  };
}>("@/lib/supabase");

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

// ── useNotifications tests ──────────────────────────────────────────

describe("useNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns notifications from service", async () => {
    // The notification center screen calls this to populate the list.
    const mockNotifications = [
      {
        id: "notif-1",
        type: "badge_earned",
        title: "Badge!",
        body: "You earned it",
        read: false,
        created_at: "2026-02-11T12:00:00Z",
      },
    ];

    notificationsService.getNotifications.mockResolvedValueOnce({
      data: mockNotifications,
      error: null,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toEqual(mockNotifications);
    expect(notificationsService.getNotifications).toHaveBeenCalledWith(
      "user-1"
    );
  });

  it("returns empty array when no notifications", async () => {
    notificationsService.getNotifications.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toEqual([]);
  });

  it("throws on service error", async () => {
    notificationsService.getNotifications.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});

// ── useUnreadCount tests ────────────────────────────────────────────

describe("useUnreadCount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns count from service", async () => {
    // The unread count powers the badge overlay on the bell icon.
    notificationsService.getUnreadCount.mockResolvedValueOnce({
      data: null,
      error: null,
      count: 7,
    });

    const { result } = renderHook(() => useUnreadCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.count).toBe(7);
  });

  it("returns 0 when count is null", async () => {
    // If the query returns null count (e.g., no matching rows),
    // we default to 0 so the badge doesn't show.
    notificationsService.getUnreadCount.mockResolvedValueOnce({
      data: null,
      error: null,
      count: null,
    });

    const { result } = renderHook(() => useUnreadCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.count).toBe(0);
  });
});

// ── useMarkAsRead tests ─────────────────────────────────────────────

describe("useMarkAsRead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls service with notificationId and userId", async () => {
    notificationsService.markAsRead.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useMarkAsRead(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ notificationId: "notif-1" });
    });

    expect(notificationsService.markAsRead).toHaveBeenCalledWith(
      "notif-1",
      "user-1"
    );
  });

  it("throws when service returns error", async () => {
    notificationsService.markAsRead.mockResolvedValueOnce({
      data: null,
      error: new Error("RLS denied"),
    });

    const { result } = renderHook(() => useMarkAsRead(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ notificationId: "notif-1" });
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});

// ── useMarkAllAsRead tests ──────────────────────────────────────────

describe("useMarkAllAsRead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls service with userId from auth", async () => {
    notificationsService.markAllAsRead.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useMarkAllAsRead(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    expect(notificationsService.markAllAsRead).toHaveBeenCalledWith("user-1");
  });

  it("throws when service returns error", async () => {
    notificationsService.markAllAsRead.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    });

    const { result } = renderHook(() => useMarkAllAsRead(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});

// ── useNotificationPreferences tests ────────────────────────────────

describe("useNotificationPreferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("transforms preference rows into a category→enabled map", async () => {
    // The preferences screen needs a simple lookup: is "friends" enabled?
    // The hook transforms the array of DB rows into a Record<string, boolean>.
    notificationsService.getPreferences.mockResolvedValueOnce({
      data: [
        { category: "friends", enabled: false },
        { category: "comps", enabled: true },
      ],
      error: null,
    });

    const { result } = renderHook(() => useNotificationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.preferences).toEqual({
      friends: false,
      comps: true,
    });
  });

  it("returns empty object when no preferences set", async () => {
    // New users have no preference rows — all categories default to enabled.
    notificationsService.getPreferences.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useNotificationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.preferences).toEqual({});
  });
});

// ── useUpdatePreference tests ───────────────────────────────────────

describe("useUpdatePreference", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls service with userId, category, and enabled", async () => {
    notificationsService.updatePreference.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useUpdatePreference(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ category: "routes", enabled: false });
    });

    expect(notificationsService.updatePreference).toHaveBeenCalledWith(
      "user-1",
      "routes",
      false
    );
  });

  it("throws when service returns error", async () => {
    notificationsService.updatePreference.mockResolvedValueOnce({
      data: null,
      error: new Error("Constraint violation"),
    });

    const { result } = renderHook(() => useUpdatePreference(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ category: "routes", enabled: false });
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});

// ── useNotificationRealtime tests ───────────────────────────────────

describe("useNotificationRealtime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the channel mock chain for each test
    const subscribeMock = jest.fn().mockReturnValue({ unsubscribe: jest.fn() });
    const onMock = jest.fn().mockReturnValue({ subscribe: subscribeMock });
    supabase.channel.mockReturnValue({ on: onMock });
  });

  it("subscribes to postgres_changes on mount", () => {
    // The Realtime hook opens a Supabase channel that listens for
    // INSERT events on the notifications table, filtered to the
    // current user. This lets new notifications appear instantly.
    renderHook(() => useNotificationRealtime(), {
      wrapper: createWrapper(),
    });

    expect(supabase.channel).toHaveBeenCalledWith("notifications-realtime");
    // Verify .on() was called with postgres_changes config
    const channelInstance = supabase.channel.mock.results[0].value;
    expect(channelInstance.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: "user_id=eq.user-1",
      }),
      expect.any(Function)
    );
  });

  it("calls subscribe to activate the channel", () => {
    renderHook(() => useNotificationRealtime(), {
      wrapper: createWrapper(),
    });

    const channelInstance = supabase.channel.mock.results[0].value;
    const onResult = channelInstance.on.mock.results[0].value;
    expect(onResult.subscribe).toHaveBeenCalled();
  });

  it("removes channel on unmount", () => {
    const { unmount } = renderHook(() => useNotificationRealtime(), {
      wrapper: createWrapper(),
    });

    unmount();

    // Cleanup: removeChannel prevents resource leaks on the WebSocket
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  it("does not subscribe when user is not authenticated", () => {
    // Temporarily override the useAuth mock to return no user
    const useAuthModule = jest.requireMock("@/hooks/useAuth");
    const originalUseAuth = useAuthModule.useAuth;
    useAuthModule.useAuth = () => ({
      user: null,
      session: null,
      isAuthenticated: false,
    });

    renderHook(() => useNotificationRealtime(), {
      wrapper: createWrapper(),
    });

    // No channel should be created when there's no user
    expect(supabase.channel).not.toHaveBeenCalled();

    // Restore the mock
    useAuthModule.useAuth = originalUseAuth;
  });
});
