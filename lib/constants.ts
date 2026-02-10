/**
 * App-Wide Domain Constants — lib/constants.ts
 *
 * This file is the single source of truth for business domain values used
 * across the entire Beta Breaker app: services, hooks, UI components, and
 * eventually database schemas. Centralizing them here avoids "magic strings"
 * scattered throughout the codebase.
 *
 * Pattern: `as const` arrays + derived types
 * ──────────────────────────────────────────
 * Each set of domain values is defined as a readonly tuple using `as const`.
 * TypeScript types are then derived using `typeof X[number]`, which extracts
 * a union of the array's literal values:
 *
 *   const COLORS = ['red', 'blue'] as const;
 *   type Color = typeof COLORS[number];  // 'red' | 'blue'
 *
 * This approach is simpler than TypeScript enums and works well with:
 *   - Array.includes() for membership checks at runtime
 *   - z.enum() for Zod validation schemas
 *   - Postgres CHECK constraints (values use snake_case to match DB enums)
 *
 * Note on intentional duplication with utils/validation.ts:
 * Some constants (GRADE_SYSTEMS, SCORING_MODELS, ASCENT_STATUSES) also appear
 * in validation.ts. That's by design — validation.ts is self-contained to
 * avoid circular imports, while this file serves as the canonical reference
 * for the rest of the app (services, hooks, UI).
 */

/* ── App Identity ───────────────────────────────────────────────────────── */

export const APP_NAME = "Beta Breaker";

/* ── User Roles ─────────────────────────────────────────────────────────── */

/**
 * Permission roles in ascending order of privilege.
 *
 * Roles are per-gym (except climber which is global and super_admin which
 * is platform-wide). A user can have different roles at different gyms,
 * stored in the `user_gym_roles` table enforced by RLS.
 *
 *   climber     — default role, can log ascents and view routes
 *   setter      — can create and manage routes at their gym
 *   judge       — can officiate competitions at their gym
 *   gym_admin   — full control over a single gym's settings and data
 *   super_admin — platform-wide access (Beta Breaker team only)
 */
export const ROLES = ['climber', 'setter', 'judge', 'gym_admin', 'super_admin'] as const;

/** Union type of all valid user roles, derived from the ROLES array. */
export type UserRole = typeof ROLES[number];

/* ── Route Statuses ─────────────────────────────────────────────────────── */

/**
 * Lifecycle statuses for climbing routes.
 *
 * Routes move through these stages as gyms rotate their walls:
 *   active        — currently set and climbable
 *   retiring_soon — still climbable but scheduled for removal (alerts users)
 *   archived      — taken down, preserved for historical ascent records
 */
export const ROUTE_STATUSES = ['active', 'retiring_soon', 'archived'] as const;

/** Union type for route lifecycle status. */
export type RouteStatus = typeof ROUTE_STATUSES[number];

/* ── Grade Systems ──────────────────────────────────────────────────────── */

/**
 * Supported grade display systems for climbing difficulty.
 *
 * Grades are stored internally as canonical integers (0–30) and converted
 * to display strings based on the user's preferred system:
 *   v-scale — US bouldering (V0, V1, ... V17)
 *   font    — European/Fontainebleau bouldering (4a, 6b+, 8c, etc.)
 *   yds     — Yosemite Decimal System for rope climbing (5.6, 5.10a, 5.15d)
 */
export const GRADE_SYSTEMS = ['v-scale', 'font', 'yds'] as const;

/** Union type for grade display systems. */
export type GradeSystem = typeof GRADE_SYSTEMS[number];

/* ── Scoring Models ─────────────────────────────────────────────────────── */

/**
 * Competition scoring models that determine how events rank participants.
 *
 * Each model rewards a different climbing strength:
 *   hardest_grade — highest single-route grade completed wins
 *   flash_rate    — rewards first-try completions (consistency)
 *   volume        — total number of routes completed (endurance)
 */
export const SCORING_MODELS = ['hardest_grade', 'flash_rate', 'volume'] as const;

/** Union type for competition scoring strategies. */
export type ScoringModel = typeof SCORING_MODELS[number];

/* ── Ascent Statuses ────────────────────────────────────────────────────── */

/**
 * Outcome of a climbing attempt on a route.
 *
 *   flash   — completed on the very first try (no prior beta or attempts)
 *   send    — completed after multiple attempts or sessions
 *   attempt — tried but did not complete the route
 */
export const ASCENT_STATUSES = ['flash', 'send', 'attempt'] as const;

/** Union type for how a climbing attempt ended. */
export type AscentStatus = typeof ASCENT_STATUSES[number];

/* ── Notification Categories ────────────────────────────────────────────── */

/**
 * Categories for push notification preferences.
 *
 * Users can toggle each category independently in their settings:
 *   friends      — social activity (follows, likes, comments)
 *   routes       — new routes set, routes retiring soon
 *   comps        — competition announcements, results, invitations
 *   achievements — badges earned, streak milestones reached
 */
export const NOTIFICATION_CATEGORIES = ['friends', 'routes', 'comps', 'achievements'] as const;

/** Union type for notification preference categories. */
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

/* ── Save Types ─────────────────────────────────────────────────────────── */

/**
 * Ways a climber can bookmark/save a route.
 *
 *   project  — actively working on this route (want to track progress)
 *   wishlist — haven't tried yet but want to
 *   favorite — completed and loved it (personal highlight reel)
 */
export const SAVE_TYPES = ['project', 'wishlist', 'favorite'] as const;

/** Union type for route save/bookmark categories. */
export type SaveType = typeof SAVE_TYPES[number];

/* ── Subscription Tiers ─────────────────────────────────────────────────── */

/**
 * Free tier configuration — the default experience for all users.
 *
 * Limits are intentionally modest to encourage upgrades while still
 * providing a fully functional climbing log experience.
 *   maxBadges: 1        — only 1 badge displayed on profile
 *   betaPerWeek: 5      — up to 5 beta video uploads per week
 *   analyticsEnabled: false — no access to the analytics dashboard
 */
export const FREE_TIER = {
  name: 'free',
  maxBadges: 1,
  betaPerWeek: 5,
  analyticsEnabled: false,
} as const;

/**
 * Pro tier configuration — the premium experience.
 *
 * Unlocks everything with generous limits:
 *   maxBadges: 3               — showcase 3 badges on profile
 *   betaPerWeek: Infinity      — unlimited beta video uploads
 *   analyticsEnabled: true     — full analytics dashboard access
 *
 * Using Infinity for betaPerWeek lets tier checks use simple comparisons:
 *   if (uploadCount <= userTier.betaPerWeek) { allow(); }
 * This works because any finite number is always <= Infinity.
 */
export const PRO_TIER = {
  name: 'pro',
  maxBadges: 3,
  betaPerWeek: Infinity,
  analyticsEnabled: true,
} as const;

/**
 * Convenience lookup object mapping tier names to their config objects.
 *
 * Usage: `const config = TIERS[user.tier];` gives you the full tier config
 * without needing a switch statement or if/else chain.
 */
export const TIERS = {
  free: FREE_TIER,
  pro: PRO_TIER,
} as const;

/**
 * Union type for subscription tier names.
 * Derived from the keys of the TIERS object: 'free' | 'pro'
 */
export type Tier = keyof typeof TIERS;

/* ── Style Tags ────────────────────────────────────────────────────── */

/**
 * Climbing style tags used on the Full Ascent Form to categorize what
 * skills/strengths a route demands. Climbers can multi-select these
 * when logging an ascent to build a rich profile of route characteristics.
 *
 * Each tag has:
 *   - `key`:   snake_case identifier (matches future DB column values)
 *   - `label`: human-readable display text for the UI
 *   - `color`: hex color for the Badge component's `variant="tag"` prop
 *
 * These are currently UI-only — selected tags are tracked in component
 * state but not persisted to the database. A future phase (analytics)
 * will add a `style_tags` column to `route_ascents` and store them.
 */
export const STYLE_TAGS = [
  { key: 'power', label: 'Power', color: '#EF4444' },
  { key: 'finger_strength', label: 'Finger Strength', color: '#F59E0B' },
  { key: 'footwork', label: 'Footwork', color: '#22C55E' },
  { key: 'dynamic', label: 'Dynamic Movement', color: '#3B82F6' },
  { key: 'core', label: 'Core Strength', color: '#7C3AED' },
  { key: 'technique', label: 'Technique', color: '#14B8A6' },
] as const;

/**
 * Union type of valid style tag keys, derived from the STYLE_TAGS array.
 * e.g., 'power' | 'finger_strength' | 'footwork' | 'dynamic' | 'core' | 'technique'
 */
export type StyleTagKey = typeof STYLE_TAGS[number]['key'];
