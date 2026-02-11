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

  // ── In-App Notification Methods ──────────────────────────────────

  /**
   * Fetch the user's notifications for the notification center.
   *
   * Returns the 50 most recent notifications, newest first. This maps
   * directly to the scrollable list in the notification center screen.
   * RLS restricts to the authenticated user's own rows.
   *
   * @param userId - The authenticated user's ID
   */
  getNotifications(userId: string) {
    return supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
  },

  /**
   * Get the count of unread notifications (for the badge overlay).
   *
   * Uses Supabase's `head: true` option so Postgres returns ONLY the
   * count header — no row data is transferred. This is the most
   * efficient way to power a "3 unread" badge without fetching rows.
   *
   * The count is in `result.count`, not `result.data`.
   *
   * @param userId - The authenticated user's ID
   */
  getUnreadCount(userId: string) {
    return supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);
  },

  /**
   * Mark a single notification as read.
   *
   * Called when the user taps a notification in the list. Filters by
   * both `id` and `user_id` for defense-in-depth — RLS enforces
   * ownership, but the explicit filter makes intent clear.
   *
   * @param notificationId - The notification to mark
   * @param userId - The authenticated user's ID (ownership check)
   */
  markAsRead(notificationId: string, userId: string) {
    return supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("user_id", userId);
  },

  /**
   * Mark all unread notifications as read for a user.
   *
   * Powers the "Mark all read" button in the notification center header.
   * Only targets `read = false` rows to avoid unnecessary writes.
   *
   * @param userId - The authenticated user's ID
   */
  markAllAsRead(userId: string) {
    return supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
  },

  /**
   * Fetch the user's notification preferences.
   *
   * Returns all rows from `notification_preferences` for this user.
   * The app uses an opt-out model: missing categories are treated as
   * enabled. Only explicit opt-outs create rows.
   *
   * @param userId - The authenticated user's ID
   */
  getPreferences(userId: string) {
    return supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId);
  },

  /**
   * Upsert a notification preference for a specific category.
   *
   * Uses Postgres UPSERT with the UNIQUE(user_id, category) constraint
   * so the first toggle creates the row and subsequent toggles update it.
   * This makes the toggle operation idempotent.
   *
   * @param userId - The authenticated user's ID
   * @param category - The notification category (friends, routes, comps, achievements)
   * @param enabled - Whether this category is enabled
   */
  updatePreference(userId: string, category: string, enabled: boolean) {
    return supabase
      .from("notification_preferences")
      .upsert(
        { user_id: userId, category, enabled },
        { onConflict: "user_id,category" }
      );
  },
};
