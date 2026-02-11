/**
 * Notification Hooks — TanStack Query Wrappers for Push Token Management
 *
 * These hooks wrap notificationsService with TanStack Query to provide:
 *   - `useRegisterPushToken()` — mutation to persist an Expo push token
 *   - `useUnregisterPushToken()` — mutation to remove a token on logout
 *   - `usePushTokens()` — query to fetch the user's registered tokens
 *
 * HOOK BREAKDOWN:
 *   - useRegisterPushToken: called by usePushTokenRegistration on app launch.
 *     Invalidates ["pushTokens"] on success so usePushTokens stays fresh.
 *   - useUnregisterPushToken: called on logout to stop sending push
 *     notifications to this device. Invalidates ["pushTokens"].
 *   - usePushTokens: keyed on ["pushTokens"]. Returns the user's registered
 *     device tokens — useful for settings/debug screens.
 *
 * WHY INJECT userId FROM useAuth?
 * Same pattern as useModeration.ts — the service layer needs the authenticated
 * user's ID, and the hooks pull it from auth context automatically so callers
 * don't have to pass it manually.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsService } from "@/services/notifications.service";
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
