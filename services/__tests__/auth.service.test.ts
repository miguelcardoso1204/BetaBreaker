/**
 * Auth Service Tests
 *
 * These tests verify that authService methods correctly delegate to the
 * Supabase Auth client. We mock the entire `@/lib/supabase` module so
 * tests run without a real Supabase instance — isolating the service
 * layer from network and database concerns.
 *
 * The service is intentionally thin (just forwarding calls), but testing
 * it ensures:
 * 1. Each method calls the correct Supabase Auth method
 * 2. Arguments are passed through unchanged
 * 3. The return value shape is preserved (no accidental unwrapping)
 *
 * The useAuth hook (Step 3.3) will mock this service layer, not the
 * Supabase client — so these tests form the contract between the two.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
// We mock every supabase.auth method the service uses. The mock object
// is defined INSIDE the jest.mock factory because Jest hoists jest.mock()
// above all variable declarations. If we defined mockAuth outside the
// factory, it would be undefined when the factory runs (temporal dead zone).
//
// To access the mock functions in tests, we use jest.requireMock() to
// grab the mock module and extract its auth object.

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signInWithOAuth: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  },
}));

// Import AFTER mock is defined — Jest replaces the real module with our mock
import { authService } from "../auth.service";

// Extract the mock auth object so tests can set up return values and assertions.
// jest.requireMock returns the already-mocked module (doesn't re-run the factory).
const { supabase } = jest.requireMock<{ supabase: { auth: Record<string, jest.Mock> } }>(
  "@/lib/supabase"
);
const mockAuth = supabase.auth;

// ── Tests ───────────────────────────────────────────────────────────

describe("authService", () => {
  // Reset all mocks between tests so one test's return values don't
  // leak into the next. This is especially important because we use
  // mockResolvedValueOnce (one-shot) for most tests.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── signUp ──────────────────────────────────────────────────────

  describe("signUp", () => {
    it("calls supabase.auth.signUp and returns data + error on success", async () => {
      // Simulate a successful sign-up: Supabase returns the new user
      // and a session (access_token + refresh_token).
      const mockResponse = {
        data: {
          user: { id: "user-123", email: "test@example.com" },
          session: { access_token: "token-abc" },
        },
        error: null,
      };
      mockAuth.signUp.mockResolvedValueOnce(mockResponse);

      const result = await authService.signUp("test@example.com", "password123");

      // Verify the service passes email/password as an object (Supabase's expected format)
      expect(mockAuth.signUp).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
      // Verify the raw response is returned without transformation
      expect(result).toEqual(mockResponse);
    });

    it("returns error when email already exists", async () => {
      // Supabase returns an error object when the email is taken.
      // The service should pass this through unchanged — error handling
      // is the hook/UI layer's responsibility, not the service's.
      const mockResponse = {
        data: { user: null, session: null },
        error: { message: "User already registered" },
      };
      mockAuth.signUp.mockResolvedValueOnce(mockResponse);

      const result = await authService.signUp("taken@example.com", "password123");

      expect(result.error).toBeTruthy();
      expect(result.error!.message).toBe("User already registered");
      expect(result.data.user).toBeNull();
    });
  });

  // ── signIn ──────────────────────────────────────────────────────

  describe("signIn", () => {
    it("calls signInWithPassword and returns session on success", async () => {
      // A successful sign-in returns a session containing the JWT
      // (access_token). The hook layer will extract and store this.
      const mockResponse = {
        data: {
          user: { id: "user-123", email: "test@example.com" },
          session: { access_token: "jwt-token-xyz" },
        },
        error: null,
      };
      mockAuth.signInWithPassword.mockResolvedValueOnce(mockResponse);

      const result = await authService.signIn("test@example.com", "correct-password");

      expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "correct-password",
      });
      expect(result.data.session?.access_token).toBe("jwt-token-xyz");
    });

    it("returns error on wrong password", async () => {
      // Invalid credentials return an error with no session.
      // The service doesn't throw — it returns the error for the caller to handle.
      const mockResponse = {
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      };
      mockAuth.signInWithPassword.mockResolvedValueOnce(mockResponse);

      const result = await authService.signIn("test@example.com", "wrong-password");

      expect(result.error).toBeTruthy();
      expect(result.error!.message).toBe("Invalid login credentials");
      expect(result.data.session).toBeNull();
    });
  });

  // ── signOut ─────────────────────────────────────────────────────

  describe("signOut", () => {
    it("calls supabase.auth.signOut and returns result", async () => {
      // signOut clears the session from SecureStore (handled by the
      // Supabase client internally). The service just delegates.
      mockAuth.signOut.mockResolvedValueOnce({ error: null });

      const result = await authService.signOut();

      expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
      expect(result.error).toBeNull();
    });
  });

  // ── resetPassword ───────────────────────────────────────────────

  describe("resetPassword", () => {
    it("calls resetPasswordForEmail with the user email", async () => {
      // This sends a password-reset email via Supabase's built-in
      // email templates. In production, the email contains a magic link
      // that opens the app via deep link (configured in Phase 3 later).
      mockAuth.resetPasswordForEmail.mockResolvedValueOnce({
        data: {},
        error: null,
      });

      const result = await authService.resetPassword("forgot@example.com");

      expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith("forgot@example.com");
      expect(result.error).toBeNull();
    });
  });

  // ── getSession ──────────────────────────────────────────────────

  describe("getSession", () => {
    it("returns current session or null", async () => {
      // getSession checks SecureStore for a persisted JWT. If found
      // and not expired, it returns the session. This is used on app
      // launch to restore auth state without re-prompting login.
      const mockResponse = {
        data: {
          session: {
            access_token: "persisted-jwt",
            user: { id: "user-123" },
          },
        },
        error: null,
      };
      mockAuth.getSession.mockResolvedValueOnce(mockResponse);

      const result = await authService.getSession();

      expect(mockAuth.getSession).toHaveBeenCalledTimes(1);
      expect(result.data.session?.access_token).toBe("persisted-jwt");
    });
  });

  // ── onAuthStateChange ───────────────────────────────────────────

  describe("onAuthStateChange", () => {
    it("registers a callback and returns a subscription", () => {
      // onAuthStateChange is Supabase's event listener for auth events
      // (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.). It returns a
      // subscription object with an `unsubscribe` method — the hook
      // calls unsubscribe on cleanup to prevent memory leaks.
      //
      // Note: This is synchronous (returns immediately, not a Promise),
      // so we use mockReturnValue instead of mockResolvedValue.
      const mockUnsubscribe = jest.fn();
      mockAuth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      });

      const callback = jest.fn();
      const result = authService.onAuthStateChange(callback);

      expect(mockAuth.onAuthStateChange).toHaveBeenCalledWith(callback);
      // Verify the subscription object is returned so the caller can clean up
      expect(result.data.subscription.unsubscribe).toBe(mockUnsubscribe);
    });
  });

  // ── signInWithProvider ──────────────────────────────────────────

  describe("signInWithProvider", () => {
    it("initiates Google OAuth flow", async () => {
      // OAuth sign-in returns a URL that the app opens in a browser/webview.
      // The user authenticates with the provider, then the app receives
      // a callback with auth tokens via deep linking (configured in Phase 3).
      const mockResponse = {
        data: { provider: "google", url: "https://accounts.google.com/..." },
        error: null,
      };
      mockAuth.signInWithOAuth.mockResolvedValueOnce(mockResponse);

      const result = await authService.signInWithProvider("google");

      expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google" });
      expect(result.data.provider).toBe("google");
    });

    it("initiates Apple OAuth flow", async () => {
      // Apple Sign-In is required by Apple's App Store guidelines if
      // any social login is offered. Same flow as Google but uses
      // Apple's identity service.
      const mockResponse = {
        data: { provider: "apple", url: "https://appleid.apple.com/..." },
        error: null,
      };
      mockAuth.signInWithOAuth.mockResolvedValueOnce(mockResponse);

      const result = await authService.signInWithProvider("apple");

      expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({ provider: "apple" });
      expect(result.data.provider).toBe("apple");
    });
  });
});
