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

// useGyms — fetches gym directory via TanStack Query.
// useGym — fetches a single gym's details.
// useSetHomeGym — mutation to update the user's home gym.
export { useGyms, useGym, useSetHomeGym } from "./useGyms";

// useSession — coordinates sessionStore (Zustand) + sessionsService (TanStack mutations)
// for tick-logging: timer, pending logs, optimistic ascent logging, cache invalidation.
// LogAscentInput — the input shape for the logAscent mutation (omits userId).
export { useSession } from "./useSession";
export type { LogAscentInput } from "./useSession";

// useBadges — fetches all badge definitions for the badge gallery.
// useUserBadges — fetches badges earned by a specific user (profile/trophy case).
// useUserStreak — fetches a user's weekly climbing streak.
export { useBadges, useUserBadges, useUserStreak } from "./useBadges";

// useLeaderboard — fetches ranked leaderboard entries for a gym + time period.
export { useLeaderboard } from "./useLeaderboard";

// useAdminDashboard — admin dashboard data: route counts, ascents, recent activity.
export { useAdminDashboard } from "./useAdminDashboard";

// useAdminRoutes — admin route management: CRUD, setter assignment, QR generation.
export {
  useAdminRoutes,
  useGymSetters,
  useCreateRoute,
  useUpdateRoute,
  useDeleteRoute,
  useGenerateQr,
} from "./useAdminRoutes";
