/**
 * Service Layer — Thin Supabase Query Wrappers
 *
 * Each service file in this directory is a thin wrapper around Supabase's
 * PostgREST query builder. Services handle the "how" of data access:
 *
 *   routeService.getAll(gymId)
 *     → supabase.from('routes').select('*').eq('gym_id', gymId)
 *
 * Services contain NO business logic — they just translate function calls
 * into Supabase queries. Business logic (validation, scoring, streak
 * calculation) lives in utils/. Authorization lives in Postgres RLS
 * policies, not here.
 *
 * Why a service layer instead of calling Supabase directly in hooks?
 * - Testability: services can be mocked in hook unit tests
 * - Single responsibility: hooks manage cache, services manage queries
 * - Reusability: the same service can be called from hooks or offline sync
 */

// Auth service — wraps supabase.auth.* methods for sign-up, sign-in, sign-out, etc.
// OAuthProvider type restricts OAuth to our configured providers (Google, Apple).
export { authService } from "./auth.service";
export type { OAuthProvider, AuthChangeEvent, Session } from "./auth.service";
