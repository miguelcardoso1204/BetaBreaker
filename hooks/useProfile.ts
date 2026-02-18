/**
 * Profile Hooks — TanStack Query Wrappers for Profile Management
 *
 * These hooks power the profile screen's edit, stats, export, and delete
 * features. They follow the same pattern as useGyms/useBadges: service
 * calls wrapped in useQuery (reads) or useMutation (writes).
 *
 * QUERY KEYS:
 *   ["profile", "stats", userId] — aggregated send count + max grade
 *
 * MUTATIONS:
 *   useUpdateProfile   — partial profile update (name, avatar, grade system)
 *   useExportData      — JSONB blob of all user data
 *   useDeleteAccount   — permanent account deletion with CASCADE
 *
 * Why separate from useAuth?
 * useAuth manages session lifecycle (sign-in/out, token refresh) and is
 * event-driven. These hooks manage profile CRUD and analytics which are
 * request/response — the natural fit for TanStack Query.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { profileService } from "@/services/profile.service";

/**
 * Fetch profile stats: total sends and max grade.
 *
 * Uses the get_profile_stats RPC which does the aggregation in Postgres.
 * Enabled only when userId is provided — prevents queries when the user
 * is not yet authenticated.
 *
 * @param userId — the user's UUID, or undefined/null when not authenticated
 */
export function useProfileStats(userId: string | undefined | null) {
  return useQuery({
    queryKey: ["profile", "stats", userId],
    queryFn: async () => {
      // The RPC returns a single row as an array element. Supabase
      // auto-unwraps TABLE-returning functions, so data is an array.
      const result = await profileService.getProfileStats(userId!);
      if (result.error) throw result.error;
      return result.data;
    },
    // Don't fire the query until we have a userId
    enabled: !!userId,
  });
}

/**
 * Mutation to update profile fields (name, avatar, grade system, etc.).
 *
 * After a successful update, calls the provided refreshProfile callback
 * to re-fetch the user's profile in useAuth. This keeps the auth state
 * in sync with the DB without a full re-authentication.
 *
 * @param refreshProfile — callback from useAuth().refreshProfile
 */
export function useUpdateProfile(refreshProfile: () => Promise<void>) {
  return useMutation({
    mutationFn: async ({
      userId,
      fields,
    }: {
      userId: string;
      fields: Record<string, unknown>;
    }) => {
      const result = await profileService.updateProfile(userId, fields);
      if (result.error) throw result.error;
      return result.data;
    },
    // After the profile update succeeds, refresh useAuth's cached profile
    // so the UI immediately reflects the changes (e.g., new display name).
    onSuccess: async () => {
      await refreshProfile();
    },
  });
}

/**
 * Mutation to export all user data as JSONB.
 *
 * Returns the data blob — the screen can then present it to the user
 * (e.g., via Share API or clipboard). No cache invalidation needed
 * since this is a read-only operation.
 */
export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const result = await profileService.exportData();
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Mutation to permanently delete the user's account.
 *
 * After successful deletion, calls the provided signOut callback to
 * clear the local session. The auth.users CASCADE handles DB cleanup;
 * signOut handles client-side cleanup (session tokens, cached state).
 *
 * @param signOut — callback from useAuth().signOut
 */
export function useDeleteAccount(signOut: () => Promise<{ error: unknown }>) {
  return useMutation({
    mutationFn: async () => {
      const result = await profileService.deleteAccount();
      if (result.error) throw result.error;
      return result.data;
    },
    // After the account is deleted from the DB, sign out locally to
    // clear session tokens and redirect to the auth screen.
    onSuccess: async () => {
      await signOut();
    },
  });
}
