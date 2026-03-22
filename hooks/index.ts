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
// useFavoriteGyms — fetches the user's favorited gym IDs.
// useToggleFavoriteGym — mutation to add/remove a gym from favorites.
export { useGyms, useGym, useFavoriteGyms, useToggleFavoriteGym } from "./useGyms";

// useSession — coordinates sessionStore (Zustand) + sessionsService (TanStack mutations)
// for tick-logging: timer, pending logs, optimistic ascent logging, cache invalidation.
// LogAscentInput — the input shape for the logAscent mutation (omits userId).
export { useSession } from "./useSession";
export type { LogAscentInput } from "./useSession";

// useRecentSessions — fetches recent session history for the profile screen.
export { useRecentSessions } from "./useRecentSessions";

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

// useSettingCalendar — setting session scheduling: calendar queries + mutations.
// Powers the admin calendar screen (Step 15.3) for planning setter work.
export {
  useSettingSessions,
  useSetterWorkload,
  useCreateSettingSession,
  useUpdateSettingSession,
  useDeleteSettingSession,
} from "./useSettingCalendar";

// useGradeConsensus — grade consensus queries for admin grade comparison view (Step 15.4).
export { useRoutesGradeConsensus, useGradeSubmissions } from "./useGradeConsensus";

// useSeasons — season management: list, create, close (+ archive routes), delete (Step 15.6).
export {
  useSeasons,
  useCreateSeason,
  useCloseSeason,
  useDeleteSeason,
} from "./useSeasons";

// useAuditLog — read-only audit log query for admin change history (Step 15.7).
export { useAuditLog } from "./useAuditLog";

// useRouteMedia — fetches media + user likes for a route.
// useLikeMedia — mutation to toggle like/unlike on a beta video.
export { useRouteMedia, useLikeMedia } from "./useMedia";

// useProfile — profile management: stats, edit, export, delete (Step 16.1).
export {
  useProfileStats,
  useUpdateProfile,
  useExportData,
  useDeleteAccount,
} from "./useProfile";
