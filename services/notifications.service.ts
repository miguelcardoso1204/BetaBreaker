/**
 * Notifications Service — Thin Wrapper for Push Token Management
 *
 * This service manages the push_tokens table, which stores Expo push tokens
 * for each user's device(s). The push notification flow is:
 *
 *   1. App launches → requests notification permissions
 *   2. If granted → gets Expo push token from Expo's push service
 *   3. Token is persisted here → registerPushToken()
 *   4. Backend Edge Function reads push_tokens to dispatch notifications
 *   5. On logout → unregisterPushToken() removes the device token
 *
 * DATA MODEL:
 *   push_tokens: { id, user_id, token, platform, created_at }
 *   UNIQUE(user_id, token) — re-registration on app launch is a harmless no-op
 *
 * RLS POLICIES:
 *   - INSERT: authenticated users can register their own tokens (user_id = auth.uid())
 *   - SELECT: users can see their own tokens only
 *   - DELETE: users can remove their own tokens (logout/device removal)
 *   - No UPDATE — if a token changes, delete the old one and insert the new one
 *
 * IMPORTANT: registerPushToken does NOT use RETURNING (.select().single())
 * to stay consistent with the RLS + INSERT RETURNING pattern used across
 * all services (see MEMORY.md).
 */

import { supabase } from "@/lib/supabase";

export const notificationsService = {
  /**
   * Register an Expo push token for the given user and device platform.
   *
   * Called on every app launch after permissions are granted. The UNIQUE
   * constraint on (user_id, token) means re-registration is harmless —
   * Postgres returns a conflict error that the caller catches and ignores.
   *
   * Does NOT chain .select() to avoid the RLS RETURNING gotcha.
   *
   * @param userId - The authenticated user's ID
   * @param token - Expo push token (e.g., "ExponentPushToken[xxx]")
   * @param platform - Device platform: "ios" or "android"
   */
  registerPushToken(userId: string, token: string, platform: string) {
    return supabase.from("push_tokens").insert({
      user_id: userId,
      token,
      platform,
    });
  },

  /**
   * Remove a push token for the given user.
   *
   * Called on logout so the backend stops sending notifications to this
   * device. Filters by both user_id and token — a user may have multiple
   * devices registered, and we only want to remove the current one.
   *
   * @param userId - The authenticated user's ID
   * @param token - The Expo push token to remove
   */
  unregisterPushToken(userId: string, token: string) {
    return supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("token", token);
  },

  /**
   * Fetch all push tokens for a user.
   *
   * Useful for a settings/debug screen to show which devices are registered
   * for push notifications. RLS restricts results to the authenticated
   * user's own tokens.
   *
   * @param userId - The user whose tokens to fetch
   */
  getPushTokens(userId: string) {
    return supabase.from("push_tokens").select("*").eq("user_id", userId);
  },
};
