/**
 * Tests for lib/supabase.ts — Supabase Client Initialization
 *
 * These tests verify that the Supabase client is correctly initialized with:
 * 1. A valid SupabaseClient instance (has the expected API surface)
 * 2. Secure token storage via ExpoSecureStoreAdapter on native platforms
 * 3. Environment-variable-driven configuration (not hardcoded URLs/keys)
 *
 * Why test client initialization?
 * The Supabase client is the single entry point for ALL backend access — auth,
 * database queries, storage, and edge functions. If it's misconfigured (wrong
 * URL, missing auth options, insecure token storage), everything downstream
 * breaks. These tests catch configuration regressions early.
 */

// Mock expo-secure-store before importing the module under test.
// The real module requires native bindings (iOS Keychain / Android Keystore)
// that don't exist in a Jest/jsdom environment. We provide stubs so the
// ExpoSecureStoreAdapter can be constructed without crashing.
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// We need to capture the arguments passed to createClient so we can verify
// env var usage and auth config. Jest hoists `jest.mock()` above all imports
// and variable declarations, so we can't reference a `const` defined here
// inside the factory. Instead, we store captured args on a global array that
// the factory creates, then read it from tests.
//
// Why not just mock createClient entirely? We want the REAL client returned
// so we can test instanceof and API surface. This wrapper records the call
// args and then delegates to the real implementation.
const capturedCalls: unknown[][] = [];
jest.mock("@supabase/supabase-js", () => {
  const actual = jest.requireActual("@supabase/supabase-js");
  return {
    ...actual,
    createClient: (...args: unknown[]) => {
      capturedCalls.push(args);
      return actual.createClient(...args);
    },
  };
});

// Import AFTER mocks are set up so lib/supabase.ts runs with our mocked dependencies.
import { supabase } from "../supabase";
import { SupabaseClient } from "@supabase/supabase-js";

/* ── Client Initialization ────────────────────────────────────────────── */

describe("Supabase client", () => {
  it("is a valid SupabaseClient instance with the expected API surface", () => {
    // The `supabase` export should be a fully initialized SupabaseClient.
    // We check both the instance type AND the key properties/methods that
    // the rest of the app depends on. If any of these are missing, services
    // and hooks that call supabase.from(), supabase.auth, etc. will break.
    expect(supabase).toBeInstanceOf(SupabaseClient);

    // .from() — used by every service to query tables (e.g., supabase.from('routes').select())
    expect(typeof supabase.from).toBe("function");

    // .auth — used by the auth service for signIn, signUp, signOut, onAuthStateChange
    expect(supabase.auth).toBeDefined();

    // .storage — used for beta video uploads and profile photos
    expect(supabase.storage).toBeDefined();

    // .functions — used to invoke Edge Functions (QR signing, push dispatch)
    expect(supabase.functions).toBeDefined();
  });

  it("uses ExpoSecureStoreAdapter for auth token storage on native", () => {
    // On native platforms (iOS/Android), auth tokens (JWTs) must be stored
    // in the OS keychain, not plaintext AsyncStorage. The jest-expo preset
    // sets Platform.OS to 'ios', so the native code path should be exercised.
    //
    // We verify by inspecting the `auth.storage` option passed to createClient.
    // The adapter should have getItem/setItem/removeItem methods that delegate
    // to expo-secure-store's async methods.
    expect(capturedCalls).toHaveLength(1);

    const options = capturedCalls[0][2] as Record<string, unknown>; // third arg is the options object
    const auth = options?.auth as Record<string, unknown>;
    const storage = auth?.storage as Record<string, unknown>;

    // The storage adapter should exist (not undefined — that would mean web fallback)
    expect(storage).toBeDefined();

    // Verify the adapter has the SupportedStorage interface that Supabase expects.
    // These are the methods our ExpoSecureStoreAdapter implements, bridging
    // expo-secure-store's API (getItemAsync, etc.) to Supabase's expected API.
    expect(typeof storage.getItem).toBe("function");
    expect(typeof storage.setItem).toBe("function");
    expect(typeof storage.removeItem).toBe("function");
  });

  it("reads Supabase URL and anon key from environment variables", () => {
    // The client should be configured from EXPO_PUBLIC_* env vars, not hardcoded
    // values. This is critical because the same codebase targets local dev
    // (127.0.0.1:54321), staging, and production — each with different URLs/keys.
    //
    // We verify by checking the URL and key passed to createClient match what's
    // in process.env (or the localhost fallbacks if env vars aren't set).
    expect(capturedCalls).toHaveLength(1);

    const [url, key] = capturedCalls[0];

    // The URL should match the env var, or the localhost fallback if not set.
    // In the test environment, EXPO_PUBLIC_SUPABASE_URL may or may not be set —
    // either way, the value passed to createClient should match what the module resolves.
    const expectedUrl =
      process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
    expect(url).toBe(expectedUrl);

    // Same for the anon key — should come from env or use the local dev default.
    // The fallback key is the deterministic Supabase local dev anon key.
    const expectedKey =
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
    expect(key).toBe(expectedKey);
  });
});
