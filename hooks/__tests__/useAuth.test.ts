/**
 * useAuth Hook Tests
 *
 * These tests verify the useAuth hook — the primary API screens use for
 * authentication. The hook orchestrates:
 * 1. Session restoration on mount (via authService.getSession)
 * 2. Real-time auth state tracking (via authService.onAuthStateChange)
 * 3. Profile + role loading when a session exists
 * 4. Sign-in, sign-up, sign-out actions
 *
 * Mock strategy: We mock the SERVICE layer (authService, profileService),
 * NOT the Supabase client. This means these tests don't care about Supabase's
 * internal API — they only care that the hook calls the right service methods
 * and updates React state correctly.
 *
 * The key trick is capturing the `onAuthStateChange` callback. When the hook
 * mounts, it registers a listener with authService.onAuthStateChange. We
 * store that callback in `capturedAuthCallback` so tests can simulate auth
 * events (SIGNED_IN, SIGNED_OUT) by calling it directly.
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";

// ── Capture the onAuthStateChange callback ─────────────────────────
// When useAuth mounts, it calls authService.onAuthStateChange(callback).
// We store that callback here so tests can fire auth events manually.
// This variable MUST be declared before jest.mock() because the mock
// factory captures it by reference (closures work, unlike const declarations).
let capturedAuthCallback: ((event: string, session: unknown) => void) | null =
  null;

// ── Mock authService ───────────────────────────────────────────────
// Mock the entire service module. The onAuthStateChange mock captures
// whatever callback the hook passes, so tests can trigger auth events.
jest.mock("@/services/auth.service", () => ({
  authService: {
    getSession: jest.fn(),
    onAuthStateChange: jest.fn((cb: (event: string, session: unknown) => void) => {
      // Store the callback so tests can call it to simulate auth events
      capturedAuthCallback = cb;
      // Return a subscription object with an unsubscribe method (for cleanup)
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
  },
}));

// ── Mock profileService ────────────────────────────────────────────
// Profile and roles are fetched after a session is established.
jest.mock("@/services/profile.service", () => ({
  profileService: {
    getById: jest.fn(),
    getRoles: jest.fn(),
  },
}));

// Import AFTER mocks are defined — Jest replaces real modules with mocks.
import { useAuth } from "../useAuth";

// Extract mocks so we can configure return values per-test.
const { authService } = jest.requireMock<{
  authService: {
    getSession: jest.Mock;
    onAuthStateChange: jest.Mock;
    signIn: jest.Mock;
    signUp: jest.Mock;
    signOut: jest.Mock;
  };
}>("@/services/auth.service");

const { profileService } = jest.requireMock<{
  profileService: {
    getById: jest.Mock;
    getRoles: jest.Mock;
  };
}>("@/services/profile.service");

// ── Shared fixtures ────────────────────────────────────────────────
// Reusable test data that mirrors real Supabase shapes.

/** A minimal Supabase session object — contains user ID and tokens. */
const mockSession = {
  access_token: "jwt-token-xyz",
  refresh_token: "refresh-abc",
  user: { id: "user-123", email: "test@example.com" },
};

/** A raw profile row from Postgres (snake_case column names). */
const mockProfileRow = {
  id: "user-123",
  display_name: "TestClimber",
  avatar_url: "https://example.com/avatar.png",
  preferred_grade_system: "v-scale",
  home_gym_id: "gym-456",
  onboarding_completed: false,
  tier: "free",
  pinned_badge_ids: [],
  created_at: "2026-01-01T00:00:00Z",
};

/** The same profile after the hook transforms it to camelCase. */
const expectedCamelProfile = {
  id: "user-123",
  displayName: "TestClimber",
  avatarUrl: "https://example.com/avatar.png",
  preferredGradeSystem: "v-scale",
  homeGymId: "gym-456",
  onboardingCompleted: false,
  tier: "free",
  pinnedBadgeIds: [],
  createdAt: "2026-01-01T00:00:00Z",
};

// ── Tests ──────────────────────────────────────────────────────────

describe("useAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedAuthCallback = null;
  });

  // ── Test 1: Initial loading state ────────────────────────────────

  it("starts in loading state before getSession resolves", () => {
    // getSession returns a Promise that NEVER resolves — this lets us
    // observe the hook in its initial loading state before any async work
    // completes. Without this, the hook would resolve immediately and
    // we'd miss the loading state.
    authService.getSession.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAuth());

    // Before getSession resolves, the hook should be loading with no user
    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  // ── Test 2: No session → unauthenticated ─────────────────────────

  it("sets unauthenticated state when no session exists", async () => {
    // Simulate a fresh app launch with no persisted session.
    // getSession returns { data: { session: null } } — the standard
    // Supabase response when no tokens are in SecureStore.
    authService.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    // Wait for the async getSession to resolve and state to update
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    // Default role when no session — every unauthenticated user is a "climber"
    expect(result.current.role).toBe("climber");
  });

  // ── Test 3: Valid session → authenticated with profile ────────────

  it("loads profile and sets authenticated state when session exists", async () => {
    // Simulate app launch with a valid persisted session.
    authService.getSession.mockResolvedValueOnce({
      data: { session: mockSession },
      error: null,
    });
    // After getting a session, the hook fetches the user's profile and roles.
    profileService.getById.mockResolvedValueOnce({
      data: mockProfileRow,
      error: null,
    });
    profileService.getRoles.mockResolvedValueOnce({
      data: [{ role: "setter" }],
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The hook should transform the DB row to camelCase
    expect(result.current.user).toEqual(expectedCamelProfile);
    expect(result.current.session).toBe(mockSession);
    expect(result.current.isAuthenticated).toBe(true);
    // User has "setter" role from their gym roles
    expect(result.current.role).toBe("setter");
  });

  // ── Test 4: signIn triggers auth state change → authenticated ─────

  it("updates state when signIn triggers onAuthStateChange", async () => {
    // Start unauthenticated — no persisted session.
    authService.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    // signIn returns success — but we don't update state from signIn's
    // return value! Instead, onAuthStateChange fires, and THAT triggers
    // the state update. This prevents double-updates.
    authService.signIn.mockResolvedValueOnce({
      data: { user: mockSession.user, session: mockSession },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    // Wait for initial load to complete (unauthenticated)
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isAuthenticated).toBe(false);

    // Call signIn — this returns { data, error } to the caller
    let signInResult: { error: unknown } | undefined;
    await act(async () => {
      signInResult = await result.current.signIn("test@example.com", "password123");
    });

    expect(authService.signIn).toHaveBeenCalledWith("test@example.com", "password123");
    expect(signInResult!.error).toBeNull();

    // Now simulate the onAuthStateChange callback firing (as Supabase would).
    // Set up profile/role mocks for the callback's profile fetch.
    profileService.getById.mockResolvedValueOnce({
      data: mockProfileRow,
      error: null,
    });
    profileService.getRoles.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    // Fire the auth state change — this is how Supabase notifies the app
    await act(async () => {
      capturedAuthCallback!("SIGNED_IN", mockSession);
    });

    // State should now reflect the authenticated user
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
    expect(result.current.user).toEqual(expectedCamelProfile);
    // No gym roles → defaults to "climber"
    expect(result.current.role).toBe("climber");
  });

  // ── Test 5: signOut clears state ──────────────────────────────────

  it("clears state when signOut triggers onAuthStateChange", async () => {
    // Start authenticated — session exists on launch.
    authService.getSession.mockResolvedValueOnce({
      data: { session: mockSession },
      error: null,
    });
    profileService.getById.mockResolvedValueOnce({
      data: mockProfileRow,
      error: null,
    });
    profileService.getRoles.mockResolvedValueOnce({
      data: [{ role: "setter" }],
      error: null,
    });
    authService.signOut.mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useAuth());

    // Wait for authenticated state
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    // Call signOut — like signIn, the actual state clear happens via the callback
    await act(async () => {
      await result.current.signOut();
    });

    expect(authService.signOut).toHaveBeenCalledTimes(1);

    // Simulate the SIGNED_OUT event from Supabase
    await act(async () => {
      capturedAuthCallback!("SIGNED_OUT", null);
    });

    // State should be fully cleared
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.role).toBe("climber");
  });

  // ── Test 6: refreshProfile re-fetches and updates user state ────────

  it("refreshProfile updates the user profile without re-authenticating", async () => {
    // After an IAP purchase, the verify-iap Edge Function updates
    // profiles.tier in the database. The client needs to re-fetch the
    // profile to pick up the new tier WITHOUT going through the full
    // sign-in flow. refreshProfile() does exactly this.
    authService.getSession.mockResolvedValueOnce({
      data: { session: mockSession },
      error: null,
    });
    profileService.getById.mockResolvedValueOnce({
      data: mockProfileRow,
      error: null,
    });
    profileService.getRoles.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify initial tier is 'free'
    expect(result.current.user?.tier).toBe("free");

    // Simulate: Edge Function updated tier to 'pro' in the database.
    // Now refreshProfile should re-fetch and pick up the change.
    const updatedProfileRow = { ...mockProfileRow, tier: "pro" };
    profileService.getById.mockResolvedValueOnce({
      data: updatedProfileRow,
      error: null,
    });

    await act(async () => {
      await result.current.refreshProfile();
    });

    // The user's tier should now reflect the DB update
    expect(result.current.user?.tier).toBe("pro");
    // Session should be unchanged (no re-authentication)
    expect(result.current.session).toBe(mockSession);
  });

  // ── Test 7: Role derivation picks highest privilege ────────────────

  it("picks the highest-privilege role from multiple gym roles", async () => {
    // User has roles at two gyms: "setter" and "gym_admin". The hook
    // should pick "gym_admin" because it has a higher index in the ROLES
    // array (lib/constants.ts): ['climber', 'setter', 'judge', 'gym_admin', 'super_admin']
    authService.getSession.mockResolvedValueOnce({
      data: { session: mockSession },
      error: null,
    });
    profileService.getById.mockResolvedValueOnce({
      data: mockProfileRow,
      error: null,
    });
    profileService.getRoles.mockResolvedValueOnce({
      data: [{ role: "setter" }, { role: "gym_admin" }],
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // gym_admin (index 3) > setter (index 1), so gym_admin wins
    expect(result.current.role).toBe("gym_admin");
  });
});
