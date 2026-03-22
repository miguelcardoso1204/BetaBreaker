/**
 * useAuth Hook — The Primary Authentication API for Screens
 *
 * This hook is the single source of truth for auth state in the React tree.
 * Screens import `useAuth()` to get:
 * - `user`            — the current user's profile (camelCase), or null
 * - `session`         — the Supabase session (JWT tokens), or null
 * - `isAuthenticated` — computed from session (avoids state sync bugs)
 * - `isLoading`       — true while restoring session on app launch
 * - `role`            — highest-privilege role across all gyms
 * - `signIn`, `signUp`, `signOut` — actions that delegate to authService
 *
 * Architecture:
 *   Screen → useAuth() → authService (auth ops) + profileService (profile/roles)
 *
 * Key design decision: onAuthStateChange is the SINGLE source of state updates.
 * When the user calls `signIn()`, we do NOT update state from signIn's return
 * value. Instead, Supabase fires an `onAuthStateChange` event, and our listener
 * handles the state transition. This prevents double-updates and ensures
 * consistency — every auth state change (sign-in, sign-out, token refresh,
 * session restore) flows through the same code path.
 *
 * Why not TanStack Query? Auth is push-based (event-driven via
 * `onAuthStateChange`), not pull-based (request/response). TanStack Query
 * is designed for server state that's fetched on demand. Auth state is
 * managed by Supabase's internal token lifecycle, so we use plain useState
 * + useEffect to track it.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { authService } from "@/services/auth.service";
import { profileService } from "@/services/profile.service";
import { ROLES } from "@/lib/constants";
import type { UserRole } from "@/lib/constants";
import type { Session } from "@/services/auth.service";

// ── Types ──────────────────────────────────────────────────────────

/**
 * UserProfile — the public profile shape exposed to UI components.
 *
 * This interface uses camelCase (JS convention) instead of the snake_case
 * column names from Postgres. The transformation happens in this hook,
 * so UI components never need to deal with snake_case.
 *
 * Why transform here instead of in the service?
 * Services return raw Supabase responses (snake_case) — they're thin wrappers.
 * The hook is the boundary between "database world" and "React world", so
 * it's the natural place for this transformation.
 */
export interface UserProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferredGradeSystem: string;
  onboardingCompleted: boolean;
  tier: string;
  /** Badge UUIDs the user has pinned to their profile (max depends on tier). */
  pinnedBadgeIds: string[];
  createdAt: string;
}

/** The shape returned by useAuth() — everything screens need for auth. */
export interface UseAuthReturn {
  user: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  /** Computed from session — true when a valid session exists. */
  isAuthenticated: boolean;
  /** Highest-privilege role across all gyms. Defaults to 'climber'. */
  role: UserRole;
  /**
   * The gym ID where the user has their highest admin-level role.
   * Derived from user_gym_roles — used by admin screens to scope queries
   * to the gym the user administrates. Null for plain climbers.
   */
  adminGymId: string | null;
  /** Sign in with email + password. Returns { data, error } from Supabase. */
  signIn: (email: string, password: string) => Promise<{ error: unknown }>;
  /** Create a new account. Returns { data, error } from Supabase. */
  signUp: (email: string, password: string) => Promise<{ error: unknown }>;
  /** Sign out the current user. Returns { error } from Supabase. */
  signOut: () => Promise<{ error: unknown }>;
  /**
   * Re-fetch the user's profile from the database and update local state.
   *
   * Called after an IAP purchase/restore when the verify-iap Edge Function
   * has updated `profiles.tier` in the DB. This picks up the new tier
   * without requiring re-authentication (the session stays the same).
   */
  refreshProfile: () => Promise<void>;
}

// ── Helper: snake_case → camelCase profile transform ───────────────

/**
 * Transforms a raw Postgres profile row (snake_case) into the camelCase
 * UserProfile interface that UI components expect.
 *
 * This is intentionally a manual mapping (not a generic snakeToCamel util)
 * because:
 * 1. It's type-safe — TypeScript checks every field assignment
 * 2. It's explicit — easy to see exactly which DB columns map to which props
 * 3. It only runs when auth state changes (not on every render)
 */
function toUserProfile(row: {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_grade_system: string;
  onboarding_completed: boolean;
  tier: string;
  pinned_badge_ids: string[];
  created_at: string;
}): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    preferredGradeSystem: row.preferred_grade_system,
    onboardingCompleted: row.onboarding_completed,
    tier: row.tier,
    pinnedBadgeIds: row.pinned_badge_ids,
    createdAt: row.created_at,
  };
}

// ── Helper: Derive highest-privilege role ──────────────────────────

/**
 * Given an array of role rows from user_gym_roles, returns the highest
 * privilege role and the gym_id where that role applies.
 *
 * Privilege order is defined by index in the ROLES constant:
 * ['climber', 'setter', 'judge', 'gym_admin', 'super_admin'].
 *
 * If the user has no gym roles (empty array), they default to 'climber'
 * with no admin gym. This is the implicit role for all authenticated
 * users — it's not stored in user_gym_roles because it would be redundant.
 *
 * The returned adminGymId is used by admin screens to scope queries to
 * the gym the user administrates, replacing the old home_gym_id pattern.
 */
function deriveHighestRole(roleRows: { role: string; gym_id: string }[]): {
  role: UserRole;
  adminGymId: string | null;
} {
  if (roleRows.length === 0) return { role: "climber", adminGymId: null };

  // Find the role with the highest index in the ROLES array.
  // Higher index = more privilege. Unknown roles are treated as index -1
  // (effectively ignored) to be safe against data inconsistencies.
  let highestIndex = -1;
  let highestRole: UserRole = "climber";
  let adminGymId: string | null = null;

  for (const row of roleRows) {
    const index = ROLES.indexOf(row.role as UserRole);
    if (index > highestIndex) {
      highestIndex = index;
      highestRole = row.role as UserRole;
      adminGymId = row.gym_id;
    }
  }

  return { role: highestRole, adminGymId };
}

// ── Hook ───────────────────────────────────────────────────────────

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>("climber");
  const [adminGymId, setAdminGymId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ref to track whether the component is still mounted. This prevents
  // "setState on unmounted component" warnings when async operations
  // (getSession, profile fetch) complete after the hook unmounts.
  const mountedRef = useRef(true);

  /**
   * handleSession — the central state updater called by BOTH:
   * 1. Initial getSession() on mount
   * 2. onAuthStateChange callback
   *
   * If session is null → clear everything (user signed out or no session).
   * If session exists → fetch profile + roles, then update state.
   */
  const handleSession = useCallback(async (newSession: Session | null) => {
    if (!newSession) {
      // No session — clear all auth state and stop loading.
      if (mountedRef.current) {
        setUser(null);
        setSession(null);
        setRole("climber");
        setAdminGymId(null);
        setIsLoading(false);
      }
      return;
    }

    // Session exists — fetch the user's profile and gym roles in parallel.
    // Promise.all is safe here because both queries are independent and
    // failing one shouldn't block the other from being attempted.
    const [profileResult, rolesResult] = await Promise.all([
      profileService.getById(newSession.user.id),
      profileService.getRoles(newSession.user.id),
    ]);

    // Only update state if the component is still mounted
    if (!mountedRef.current) return;

    // Transform the raw profile row to camelCase and derive the role
    const userProfile = profileResult.data
      ? toUserProfile(profileResult.data)
      : null;
    const derived = deriveHighestRole(rolesResult.data ?? []);

    setUser(userProfile);
    setSession(newSession);
    setRole(derived.role);
    setAdminGymId(derived.adminGymId);
    setIsLoading(false);
  }, []);

  // ── Effect: Restore session + subscribe to auth changes ──────────

  useEffect(() => {
    // Reset mounted ref on mount (in case of StrictMode double-invoke)
    mountedRef.current = true;

    // 1. Check for a persisted session (restores login across app restarts).
    //    This is async — while it resolves, isLoading stays true.
    authService.getSession().then(({ data }) => {
      handleSession(data.session);
    });

    // 2. Subscribe to auth state changes. This fires for ALL auth events:
    //    SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED.
    //    The callback delegates to handleSession, which updates React state.
    const { data: { subscription } } = authService.onAuthStateChange(
      (_event, newSession) => {
        handleSession(newSession as Session | null);
      }
    );

    // 3. Cleanup: unsubscribe on unmount to prevent memory leaks and
    //    mark as unmounted to prevent state updates after cleanup.
    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [handleSession]);

  // ── Actions ──────────────────────────────────────────────────────
  // These are thin wrappers that delegate to authService and return
  // the result. They do NOT update React state — onAuthStateChange
  // handles that. The caller (screen) can inspect the error to show
  // a toast or inline validation message.

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authService.signIn(email, password);
    return { data: result.data, error: result.error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await authService.signUp(email, password);
    return { data: result.data, error: result.error };
  }, []);

  const signOut = useCallback(async () => {
    const result = await authService.signOut();
    return { error: result.error };
  }, []);

  /**
   * Re-fetch the user's profile from the database and update local state.
   *
   * This is needed after an IAP purchase: the verify-iap Edge Function
   * updates `profiles.tier` in the DB, but useAuth's local state still
   * has the old tier. Calling refreshProfile() re-reads the profile row
   * and updates the `user` state with the fresh data.
   *
   * Unlike handleSession, this doesn't touch the session or roles —
   * those don't change during a purchase. Only the profile data (tier,
   * pinned badges, etc.) is refreshed.
   */
  const refreshProfile = useCallback(async () => {
    if (!session) return;

    const profileResult = await profileService.getById(session.user.id);

    if (!mountedRef.current) return;

    if (profileResult.data) {
      setUser(toUserProfile(profileResult.data));
    }
  }, [session]);

  // ── Return value ─────────────────────────────────────────────────
  // `isAuthenticated` is computed from session, not stored as separate state.
  // This guarantees it's always in sync — if session is non-null, the user
  // is authenticated. No chance of session and isAuthenticated disagreeing.
  return {
    user,
    session,
    isLoading,
    isAuthenticated: session !== null,
    role,
    adminGymId,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };
}
