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
   * preferred_grade_system, home_gym_id, tier, onboarding_completed, etc.
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
   * the highest-privilege role.
   *
   * No `.single()` here — we expect zero or more rows. An empty array
   * means the user is a plain "climber" (the default role, not stored in DB).
   *
   * Only selects the `role` column since that's all we need for permission
   * checks. The full row also has gym_id and created_at, but those aren't
   * needed at the auth layer.
   */
  getRoles(userId: string) {
    return supabase.from("user_gym_roles").select("role").eq("user_id", userId);
  },
};
