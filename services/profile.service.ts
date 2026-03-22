/**
 * Profile Service — Thin Wrapper Around Supabase Profile Queries
 *
 * This service fetches user profile data and gym roles from Supabase.
 * It follows the same pattern as authService: thin wrappers that build
 * PostgREST queries and return the raw `{ data, error }` response.
 *
 * Why a separate service instead of putting this in authService?
 * - authService wraps `supabase.auth.*` (Supabase Auth API)
 * - profileService wraps `supabase.from(...)` (PostgREST / database queries)
 * - Different concerns: one manages authentication tokens, the other reads DB rows
 *
 * The useAuth hook calls both services: authService for session management,
 * profileService for fetching the user's profile and role after sign-in.
 */

import { supabase } from "@/lib/supabase";

export const profileService = {
  /**
   * Fetch a user's profile by their auth ID.
   *
   * Uses `.single()` because profiles have a 1:1 relationship with auth.users
   * — the `handle_new_user` trigger creates exactly one profile per user.
   * If the profile doesn't exist (shouldn't happen in normal flow), Supabase
   * returns `{ data: null, error: { code: 'PGRST116' } }`.
   *
   * The `*` select returns all profile columns: display_name, avatar_url,
   * preferred_grade_system, tier, onboarding_completed, etc.
   * The hook layer transforms these from snake_case to camelCase.
   */
  getById(userId: string) {
    return supabase.from("profiles").select("*").eq("id", userId).single();
  },

  /**
   * Fetch all gym roles assigned to a user.
   *
   * A user can have roles at multiple gyms (e.g., "setter" at Gym A and
   * "gym_admin" at Gym B). This returns all of them so the hook can pick
   * the highest-privilege role and derive the admin's gym context.
   *
   * No `.single()` here — we expect zero or more rows. An empty array
   * means the user is a plain "climber" (the default role, not stored in DB).
   *
   * Selects both `role` and `gym_id`: role for permission checks, gym_id
   * so admin screens can scope queries to the gym the user administrates.
   */
  getRoles(userId: string) {
    return supabase.from("user_gym_roles").select("role, gym_id").eq("user_id", userId);
  },

  /**
   * Update a user's profile with partial fields.
   *
   * RLS policy `profiles_update_own` ensures users can only update their
   * own row (WHERE id = auth.uid()). Accepts any subset of updatable
   * columns — display_name, avatar_url, preferred_grade_system, etc.
   *
   * Chain: from('profiles') → update(fields) → eq('id', userId)
   *
   * @param userId — the auth user's UUID
   * @param fields — partial object of profile columns to update
   */
  updateProfile(userId: string, fields: Record<string, unknown>) {
    return supabase.from("profiles").update(fields).eq("id", userId);
  },

  /**
   * Fetch aggregated profile stats: total sends and max grade.
   *
   * Calls the `get_profile_stats` RPC which does the aggregation in
   * Postgres — more efficient than downloading all ascent rows to
   * count/max client-side.
   *
   * Returns { total_sends: bigint, max_grade: number | null }.
   * max_grade is null when the user has no sends/flashes.
   */
  getProfileStats(userId: string) {
    return supabase.rpc("get_profile_stats", { p_user_id: userId });
  },

  /**
   * Export all user data as a single JSONB blob.
   *
   * Calls the SECURITY DEFINER `export_user_data` RPC which aggregates
   * profile, ascents, badges, and streak data scoped to auth.uid().
   * Returns everything the user has stored — useful for GDPR compliance.
   */
  exportData() {
    return supabase.rpc("export_user_data");
  },

  /**
   * Permanently delete the user's account.
   *
   * Calls the SECURITY DEFINER `delete_own_account` RPC which deletes
   * the auth.users row. CASCADE propagates to profiles, ascents, badges,
   * streaks, and all other dependent data.
   *
   * This is irreversible — the caller should confirm with the user first.
   */
  deleteAccount() {
    return supabase.rpc("delete_own_account");
  },
};
