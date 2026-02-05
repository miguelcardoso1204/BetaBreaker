/**
 * Supabase Client Configuration
 *
 * This module creates a typed Supabase client for use throughout the app.
 * It handles two key concerns:
 *
 * 1. **Type Safety:** The client is parameterized with auto-generated `Database`
 *    types so that every `.from('table')` call knows the exact column types.
 *    This catches schema mismatches at compile time instead of runtime.
 *
 * 2. **Secure Token Storage:** On native (iOS/Android), auth tokens (JWTs) are
 *    stored in the OS keychain via `expo-secure-store` instead of AsyncStorage.
 *    This is important because JWTs grant access to the user's data — storing
 *    them in plaintext would let any app with device access read them.
 *    On web, we fall back to `localStorage` since expo-secure-store isn't available.
 */

import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Database } from "@/lib/types/database.types";

/**
 * ExpoSecureStoreAdapter
 *
 * Supabase Auth expects a `SupportedStorage` interface with `getItem`,
 * `setItem`, and `removeItem` methods. expo-secure-store uses different
 * method names (`getItemAsync`, `setItemAsync`, `deleteItemAsync`), so
 * this adapter bridges the two APIs.
 *
 * Why SecureStore over AsyncStorage?
 * - SecureStore uses iOS Keychain / Android Keystore (hardware-backed encryption)
 * - AsyncStorage is just a plaintext SQLite database on disk
 * - Auth tokens should always be stored securely to prevent token theft
 *
 * Note: expo-secure-store has a 2048-byte limit per value. JWTs are typically
 * ~800 bytes, so this is fine. If JWT payloads grow (e.g., many custom claims),
 * we may need a chunking strategy in the future.
 */
const ExpoSecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    return SecureStore.deleteItemAsync(key);
  },
};

/**
 * Environment variables for Supabase connection.
 *
 * Expo SDK 54 auto-loads `EXPO_PUBLIC_*` variables from `.env.local` at build
 * time via `process.env`. The `EXPO_PUBLIC_` prefix is required — Expo strips
 * any env vars without it to prevent accidentally bundling secrets.
 *
 * The fallback values point to the default local Supabase instance started by
 * `supabase start`. These are deterministic and safe to hardcode — they only
 * work against localhost. In production, the real values come from `.env.local`
 * or EAS build secrets.
 */
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/**
 * The Supabase client instance — the single entry point for all backend access.
 *
 * Key configuration choices:
 *
 * - `storage`: Uses SecureStore on native for encrypted token storage.
 *   On web, omitted so Supabase falls back to `localStorage` (the browser default).
 *
 * - `autoRefreshToken: true`: Supabase will silently refresh the JWT before it
 *   expires. Without this, users would get logged out every hour (the default
 *   JWT expiry in our config.toml).
 *
 * - `persistSession: true`: The session (access + refresh tokens) is saved to
 *   storage so users stay logged in across app restarts. Without this, every
 *   app launch would require re-authentication.
 *
 * - `detectSessionInUrl: false`: In a browser, Supabase Auth looks for tokens
 *   in the URL hash after OAuth redirects. In React Native there's no URL bar,
 *   so we disable this to avoid unnecessary URL parsing. We'll handle deep
 *   link callbacks explicitly in Phase 3.
 *
 * - `flowType: 'pkce'`: PKCE (Proof Key for Code Exchange) is the recommended
 *   OAuth flow for mobile apps. Unlike the "implicit" flow, PKCE doesn't expose
 *   tokens in URLs and is resistant to authorization code interception attacks.
 *   Required for secure OAuth with providers like Google/Apple on mobile.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Use secure native storage on iOS/Android, default localStorage on web
    ...(Platform.OS !== "web" ? { storage: ExpoSecureStoreAdapter } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
