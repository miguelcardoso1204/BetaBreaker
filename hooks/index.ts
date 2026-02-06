/**
 * Custom React Hooks — TanStack Query Wrappers
 *
 * Each hook in this directory wraps a service function with TanStack Query's
 * useQuery or useMutation. This gives every data-fetching call automatic
 * caching, loading/error states, background refetch, and cache invalidation.
 *
 * Pattern:
 *   useRoutes()  → calls routeService.getAll() via useQuery
 *   useLogAscent() → calls ascentService.create() via useMutation
 *
 * Hooks are the primary API that screens import — screens never call
 * services directly. This keeps network logic out of UI components.
 */

// useAuth — manages auth state (session, profile, roles) via onAuthStateChange.
// UserProfile — camelCase interface for the user's profile data.
// UseAuthReturn — full return type of the useAuth hook.
export { useAuth } from "./useAuth";
export type { UserProfile, UseAuthReturn } from "./useAuth";

// useRoutes — fetches filtered route lists via TanStack Query.
// useRouteDetail — fetches a single route with setter info.
export { useRoutes, useRouteDetail } from "./useRoutes";
