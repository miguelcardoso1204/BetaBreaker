/**
 * Auth Service — Thin Wrapper Around Supabase Auth
 *
 * This module provides a clean interface for authentication operations.
 * Each method delegates directly to `supabase.auth.*` — no business logic,
 * no error transformation, no state management.
 *
 * Why wrap Supabase Auth instead of calling it directly?
 *
 * 1. **Testability:** The `useAuth` hook (Step 3.3) mocks `authService`,
 *    not the Supabase client. This means hook tests don't need to know
 *    Supabase's internal API shape — they just mock `authService.signIn()`.
 *
 * 2. **Single Responsibility:** Services handle "how" (which Supabase method
 *    to call, what args to pass). Hooks handle "when" (React lifecycle,
 *    cache invalidation, state updates).
 *
 * 3. **Reusability:** The offline sync engine (Phase 6) can call the same
 *    service methods without importing React hooks.
 *
 * All methods return Supabase's raw `{ data, error }` shape. The caller
 * (usually a hook) decides how to handle errors — show a toast, redirect
 * to login, retry, etc.
 */

import { supabase } from "@/lib/supabase";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/**
 * Supported OAuth providers for BetaBreaker.
 *
 * Narrowed from Supabase's full provider list to only the ones we configure:
 * - Google: Primary social login (Android + iOS)
 * - Apple: Required by App Store guidelines when any social login is offered
 *
 * Adding a new provider (e.g., GitHub) means adding it here, configuring it
 * in the Supabase dashboard, and adding a button in the login UI.
 */
export type OAuthProvider = "google" | "apple";

/**
 * Re-export Supabase auth types that hook consumers will need.
 * This avoids hooks importing directly from @supabase/supabase-js,
 * keeping the dependency boundary clean (hooks → services → supabase).
 */
export type { AuthChangeEvent, Session };

export const authService = {
  /**
   * Create a new account with email and password.
   *
   * Supabase handles: hashing the password (bcrypt), generating a UUID,
   * creating the auth.users row, and sending a confirmation email (if
   * configured). Our `handle_new_user` trigger then auto-creates the
   * public.profiles row.
   *
   * Returns `{ data: { user, session }, error }`. If email confirmation
   * is required, `session` will be null until the user clicks the link.
   */
  signUp(email: string, password: string) {
    return supabase.auth.signUp({ email, password });
  },

  /**
   * Sign in with email and password.
   *
   * Uses `signInWithPassword` (not `signIn`) — Supabase v2 split these
   * to distinguish password auth from magic-link/OTP auth. This method
   * only works for email+password accounts.
   *
   * Returns `{ data: { user, session }, error }`. On success, the session
   * contains the JWT (access_token) that all subsequent API calls use.
   */
  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  /**
   * Initiate OAuth sign-in with an external provider.
   *
   * This starts the PKCE flow (configured in lib/supabase.ts):
   * 1. Supabase generates an authorization URL for the provider
   * 2. The app opens this URL in a browser/webview
   * 3. User authenticates with Google/Apple
   * 4. Provider redirects back to the app via deep link
   * 5. Supabase exchanges the code for tokens
   *
   * The `provider` parameter is typed as `OAuthProvider` (not Supabase's
   * broader `Provider` type) to enforce that only configured providers
   * can be passed. Passing an unconfigured provider would fail silently.
   */
  signInWithProvider(provider: OAuthProvider) {
    return supabase.auth.signInWithOAuth({ provider });
  },

  /**
   * Sign out the current user.
   *
   * Supabase handles: invalidating the refresh token server-side and
   * clearing tokens from SecureStore (via the storage adapter in
   * lib/supabase.ts). After this, all API calls will be unauthenticated
   * until the user signs in again.
   */
  signOut() {
    return supabase.auth.signOut();
  },

  /**
   * Send a password reset email.
   *
   * Supabase sends an email with a magic link to the provided address.
   * When the user clicks the link, it opens the app via deep link with
   * a token that allows setting a new password. The deep link handling
   * is configured in Phase 3 (auth screens).
   *
   * Note: This succeeds even if the email doesn't exist (by design) —
   * returning an error would let attackers enumerate registered emails.
   */
  resetPassword(email: string) {
    return supabase.auth.resetPasswordForEmail(email);
  },

  /**
   * Get the current session from local storage.
   *
   * Checks SecureStore for a persisted session (access_token + refresh_token).
   * If found and the access_token is still valid, returns the session.
   * If the access_token is expired but the refresh_token is valid, Supabase
   * auto-refreshes (because we set `autoRefreshToken: true` in the client).
   *
   * Used on app launch to restore auth state without re-prompting login.
   */
  getSession() {
    return supabase.auth.getSession();
  },

  /**
   * Subscribe to auth state changes.
   *
   * Supabase emits events when auth state changes:
   * - SIGNED_IN: User just signed in (email, OAuth, or session restore)
   * - SIGNED_OUT: User signed out or session expired
   * - TOKEN_REFRESHED: JWT was silently refreshed
   * - USER_UPDATED: User profile was updated
   *
   * Returns `{ data: { subscription } }` — the subscription has an
   * `unsubscribe()` method that MUST be called on cleanup (e.g., in a
   * useEffect return function) to prevent memory leaks.
   *
   * This is synchronous — it registers the callback and returns immediately
   * (no network request). The callback fires asynchronously when events occur.
   */
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
