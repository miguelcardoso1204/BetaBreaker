/**
 * usePushTokenRegistration Hook Tests
 *
 * Tests the side-effect hook that runs on app launch to:
 *   1. Check if the user is authenticated
 *   2. Request notification permissions from the OS
 *   3. Get an Expo push token from Expo's push service
 *   4. Persist the token in the push_tokens table via the service layer
 *
 * This is a "fire-and-forget" initialization hook — it doesn't use
 * TanStack Query because it's a one-shot side effect, not fetched data.
 * Errors are caught silently (graceful degradation — push notifications
 * are a nice-to-have, not a critical feature).
 *
 * Mock strategy:
 *   - expo-notifications: mock requestPermissionsAsync + getExpoPushTokenAsync
 *   - expo-constants: mock Constants.expoConfig.extra.eas.projectId
 *   - useAuth: provide authenticated/unauthenticated states
 *   - notificationsService: verify registerPushToken is called correctly
 *
 * IMPORTANT: jest.mock() factories are hoisted above all const/let by Babel.
 * Variables defined outside the factory would be in the temporal dead zone.
 * We define mocks INSIDE the factories and access them via jest.requireMock()
 * (same pattern as auth.service.test.ts — see MEMORY.md).
 */

import { renderHook, waitFor } from "@testing-library/react-native";

// ── Mock expo-notifications ─────────────────────────────────────────
// Define mock functions inside the factory to avoid hoisting issues.
jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

// ── Mock expo-constants ─────────────────────────────────────────────
// __esModule: true tells Babel's _interopRequireDefault that this mock
// already has a proper default export — without it, Babel wraps the mock
// in another { default: ... } layer, making Constants.expoConfig undefined.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: "test-project-id",
        },
      },
    },
  },
}));

// ── Mock notificationsService ───────────────────────────────────────
jest.mock("@/services/notifications.service", () => ({
  notificationsService: {
    registerPushToken: jest.fn(),
  },
}));

// ── Mock useAuth — controllable per test ────────────────────────────
// We need a mutable reference so tests can change auth state.
// The factory captures the `mockAuthState` variable by reference (not value),
// so reassigning it before render works correctly.
let mockAuthState: {
  user: { id: string } | null;
  isAuthenticated: boolean;
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

// ── Access mock functions via requireMock ────────────────────────────
// After jest.mock() factories run, we can safely access the mock fns
// through requireMock. This is the hoisting-safe pattern.

import { usePushTokenRegistration } from "../usePushTokenRegistration";

const Notifications = jest.requireMock<{
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
}>("expo-notifications");

const { notificationsService } = jest.requireMock<{
  notificationsService: { registerPushToken: jest.Mock };
}>("@/services/notifications.service");

describe("usePushTokenRegistration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated user
    mockAuthState = {
      user: { id: "user-1" },
      isAuthenticated: true,
    };
  });

  it("requests permissions when authenticated", async () => {
    // On app launch with an authenticated user, the hook should
    // immediately request notification permissions from the OS.
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({
      status: "granted",
    });
    Notifications.getExpoPushTokenAsync.mockResolvedValueOnce({
      data: "ExponentPushToken[abc123]",
    });
    notificationsService.registerPushToken.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });
  });

  it("registers token after permission granted", async () => {
    // When the user grants notification permissions, we get an Expo push
    // token and persist it in the database with the device platform.
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({
      status: "granted",
    });
    Notifications.getExpoPushTokenAsync.mockResolvedValueOnce({
      data: "ExponentPushToken[abc123]",
    });
    notificationsService.registerPushToken.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(notificationsService.registerPushToken).toHaveBeenCalledWith(
        "user-1",
        "ExponentPushToken[abc123]",
        "ios" // Platform.OS in jest-expo unit env
      );
    });

    // Should have requested the token with the project ID from Constants
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: "test-project-id",
    });
  });

  it("does not register when permission denied", async () => {
    // If the user denies notifications, we gracefully degrade —
    // no token registration, no error thrown. Push is optional.
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({
      status: "denied",
    });

    renderHook(() => usePushTokenRegistration());

    await waitFor(() => {
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });

    // getExpoPushTokenAsync should NOT have been called
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(notificationsService.registerPushToken).not.toHaveBeenCalled();
  });

  it("does nothing when not authenticated", async () => {
    // Before the user logs in, we skip the entire flow — no point
    // requesting permissions or tokens for an anonymous session.
    mockAuthState = {
      user: null,
      isAuthenticated: false,
    };

    renderHook(() => usePushTokenRegistration());

    // Give the effect time to run (or not run)
    await waitFor(() => {
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(notificationsService.registerPushToken).not.toHaveBeenCalled();
  });
});
