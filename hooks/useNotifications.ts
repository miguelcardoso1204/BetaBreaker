/**
 * Notification Hooks — TanStack Query Wrappers for Notifications
 *
 * Two groups of hooks:
 *
 * PUSH TOKEN MANAGEMENT (Step 10.1):
 *   - `useRegisterPushToken()` — mutation to persist an Expo push token
 *   - `useUnregisterPushToken()` — mutation to remove a token on logout
 *   - `usePushTokens()` — query to fetch the user's registered tokens
 *
 * IN-APP NOTIFICATION CENTER (Step 10.3):
 *   - `useNotifications()` — fetches notification list for the center
 *   - `useUnreadCount()` — count-only query for the badge overlay
 *   - `useMarkAsRead()` — marks a single notification as read
 *   - `useMarkAllAsRead()` — marks all unread notifications as read
 *   - `useNotificationPreferences()` — fetches per-category toggle state
 *   - `useUpdatePreference()` — upserts a category preference
 *   - `useNotificationRealtime()` — Supabase Realtime subscription for
 *     live notification updates (first Realtime implementation in codebase)
 *
 * WHY INJECT userId FROM useAuth?
 * Same pattern as useModeration.ts — the service layer needs the authenticated
 * user's ID, and the hooks pull it from auth context automatically so callers
 * don't have to pass it manually.
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsService } from "@/services/notifications.service";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

/**
 * Mutation to register an Expo push token.
 *
 * Accepts `{ token, platform }` and automatically supplies the userId from
 * the auth context. Invalidates the pushTokens query on completion so any
 * cached token lists stay fresh.
 */
export function useRegisterPushToken() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      token,
      platform,
    }: {
      token: string;
      platform: string;
    }) => {
      if (!user?.id) throw new Error("Must be logged in to register token");
      const result = await notificationsService.registerPushToken(
        user.id,
        token,
        platform
      );
      if (result.error) throw result.error;
    },
    // Refetch the tokens list so any cached views stay consistent
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pushTokens"] });
    },
  });
}

/**
 * Mutation to unregister an Expo push token.
 *
 * Accepts `{ token }` and automatically supplies the userId from auth.
 * Called on logout so the backend stops sending push notifications to
 * this device. Invalidates ["pushTokens"] on completion.
 */
export function useUnregisterPushToken() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ token }: { token: string }) => {
      if (!user?.id) throw new Error("Must be logged in to unregister token");
      const result = await notificationsService.unregisterPushToken(
        user.id,
        token
      );
      if (result.error) throw result.error;
    },
    // Refetch the tokens list after removal
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pushTokens"] });
    },
  });
}

/**
 * Fetch the current user's registered push tokens.
 *
 * Returns:
 *   - `tokens`: array of push_tokens rows
 *   - Standard TanStack Query fields (isLoading, error, etc.)
 *
 * Query key: ["pushTokens"] — invalidated by register/unregister mutations.
 * Useful for a settings screen to show which devices are registered.
 */
export function usePushTokens() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["pushTokens"],
    queryFn: async () => {
      if (!user?.id) return [];
      const result = await notificationsService.getPushTokens(user.id);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    // Only fetch when user is authenticated
    enabled: !!user?.id,
  });

  return {
    tokens: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── In-App Notification Hooks ─────────────────────────────────────

/**
 * Fetch the current user's notification list.
 *
 * Returns the 50 most recent notifications, newest first. Used by
 * the notification center screen (app/notifications/index.tsx).
 *
 * Query key: ["notifications", userId]
 */
export function useNotifications() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const result = await notificationsService.getNotifications(user.id);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!user?.id,
  });

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Get the unread notification count for the badge overlay.
 *
 * Uses Supabase's head-only count query (no row data transferred).
 * Returns `count: number` — used by NotificationBell on the home screen.
 *
 * Query key: ["unreadCount", userId]
 */
export function useUnreadCount() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["unreadCount", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const result = await notificationsService.getUnreadCount(user.id);
      if (result.error) throw result.error;
      // count comes from the response header, not data
      return result.count ?? 0;
    },
    enabled: !!user?.id,
  });

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Mark a single notification as read.
 *
 * Called when the user taps a notification in the list. Invalidates
 * both the notification list and unread count caches.
 */
export function useMarkAsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationId }: { notificationId: string }) => {
      if (!user?.id) throw new Error("Must be logged in");
      const result = await notificationsService.markAsRead(
        notificationId,
        user.id
      );
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
    },
  });
}

/**
 * Mark all unread notifications as read.
 *
 * Powers the "Mark all read" button in the notification center header.
 * Invalidates both caches so the UI updates immediately.
 */
export function useMarkAllAsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Must be logged in");
      const result = await notificationsService.markAllAsRead(user.id);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
    },
  });
}

/**
 * Fetch per-category notification preferences.
 *
 * Transforms the array of preference rows into a `Record<string, boolean>`
 * map for easy lookup: `preferences["friends"]` → true/false.
 * Missing categories default to enabled (opt-out model).
 *
 * Query key: ["notificationPreferences", userId]
 */
export function useNotificationPreferences() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["notificationPreferences", user?.id],
    queryFn: async () => {
      if (!user?.id) return {};
      const result = await notificationsService.getPreferences(user.id);
      if (result.error) throw result.error;
      // Transform rows into a category→enabled map for quick lookup
      const map: Record<string, boolean> = {};
      for (const row of result.data ?? []) {
        map[row.category] = row.enabled;
      }
      return map;
    },
    enabled: !!user?.id,
  });

  return {
    preferences: query.data ?? {},
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Upsert a notification preference toggle.
 *
 * Called when the user flips a Switch in the preferences screen.
 * Invalidates the preferences cache so the UI reflects the change.
 */
export function useUpdatePreference() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      category,
      enabled,
    }: {
      category: string;
      enabled: boolean;
    }) => {
      if (!user?.id) throw new Error("Must be logged in");
      const result = await notificationsService.updatePreference(
        user.id,
        category,
        enabled
      );
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationPreferences"] });
    },
  });
}

/**
 * Subscribe to Supabase Realtime for live notification updates.
 *
 * This is the FIRST Realtime implementation in the codebase. It opens
 * a persistent WebSocket connection to Supabase that receives INSERT
 * events on the `notifications` table, filtered to the current user.
 *
 * When a new notification arrives:
 *   1. The Realtime channel fires the callback
 *   2. We invalidate ["notifications"] and ["unreadCount"] caches
 *   3. TanStack Query refetches, and the UI updates automatically
 *
 * The channel is cleaned up on unmount to prevent WebSocket leaks.
 *
 * WHY postgres_changes AND NOT broadcast?
 * postgres_changes is the right primitive here — it piggybacks on
 * Postgres's logical replication, so it fires whenever a row is
 * inserted by ANY source (Edge Function, trigger, admin panel).
 * Broadcast would require the sender to also publish a message.
 */
export function useNotificationRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    // Create a dedicated channel for this user's notifications
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // A new notification was inserted — invalidate caches so
          // TanStack Query refetches the list and unread count
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
        }
      )
      .subscribe();

    // Cleanup: remove the channel when the component unmounts or
    // the user changes, preventing WebSocket resource leaks
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
