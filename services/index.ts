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

// Profile service — fetches user profiles and gym roles from Postgres.
// Used by the useAuth hook to load profile data after session is established.
export { profileService } from "./profile.service";

// Routes service — fetches climbing routes with filtering, sorting, and detail views.
// Also provides admin CRUD methods (create, update, delete) and setter assignment.
export { routeService } from "./routes.service";
export type {
  RouteFilters,
  CreateRouteData,
  UpdateRouteData,
  GymSetter,
} from "./routes.service";

// gymService — fetches gym directory, gym details, and sets home gym.
export { gymService } from "./gyms.service";

// Sessions service — persists ascent logs and aggregates session summaries.
// Used by useSession hook (Step 5.3) to flush pending logs and fetch history.
export { sessionsService } from "./sessions.service";
export type {
  AscentLog,
  Ascent,
  SessionSummary,
  SessionHistoryEntry,
} from "./sessions.service";

// Gamification service — reads badges, user badges, streaks, and leaderboard data.
// All gamification tables are populated by DB triggers; this service is read-only.
export { gamificationService } from "./gamification.service";

// Dashboard service — admin dashboard metrics: route counts, ascents, recent activity.
// Used by useAdminDashboard hook for the gym admin overview screen.
export { dashboardService } from "./dashboard.service";
export type { RecentActivityItem } from "./dashboard.service";

// Calendar service — setting session CRUD + setter workload RPC.
// Used by useSettingCalendar hooks for the admin calendar screen (Step 15.3).
export { calendarService } from "./calendar.service";
export type { CreateSessionData, UpdateSessionData } from "./calendar.service";

// Consensus service — grade consensus RPCs for admin grade comparison view (Step 15.4).
export { consensusService } from "./consensus.service";

// Seasons service — season CRUD + route archival for admin season management (Step 15.6).
export { seasonsService } from "./seasons.service";
export type { CreateSeasonData } from "./seasons.service";

// Audit service — read-only audit log queries for admin change history (Step 15.7).
export { auditService } from "./audit.service";
