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

/* ── Offline Queue ─────────────────────────────────────────────────────── */

/**
 * Action types that can be queued for offline execution.
 *
 * When the user performs a write operation while offline (no network), the
 * action is serialized and stored in a local SQLite queue. When connectivity
 * returns, the sync engine (Step 6.3) drains the queue in FIFO order,
 * replaying each action against the Supabase API.
 *
 * Currently supported offline actions:
 *   log_ascent    — user logged a climb while offline
 *   delete_ascent — user removed a logged ascent while offline
 *
 * New action types should be added here as offline support expands.
 */
export const OFFLINE_ACTION_TYPES = ['log_ascent', 'delete_ascent'] as const;

/**
 * Union type of valid offline action types, derived from the array.
 * e.g., 'log_ascent' | 'delete_ascent'
 */
export type OfflineActionType = typeof OFFLINE_ACTION_TYPES[number];

/**
 * Maximum number of retry attempts for a queued offline action before
 * the sync engine gives up and marks it as permanently failed.
 *
 * After MAX_OFFLINE_RETRIES failures (e.g., server 500s), the action stays
 * in the queue but won't be retried automatically — the user can manually
 * retry or discard it from the sync UI.
 */
export const MAX_OFFLINE_RETRIES = 3;

/**
 * SQLite database filename for the offline queue.
 *
 * expo-sqlite stores this in the app's sandboxed documents directory.
 * Centralized here so both the offlineDb module and tests reference
 * the same filename.
 */
export const OFFLINE_DB_NAME = 'betabreaker_offline.db';

/* ── Sync Engine ─────────────────────────────────────────────────────── */

/**
 * Backoff delays (in ms) for sync engine retries after failed replays.
 *
 * When the sync engine tries to replay a queued offline action and fails
 * (e.g., the server returns a 500), it doesn't retry immediately — that
 * would just hammer a potentially struggling server. Instead, it waits
 * progressively longer between attempts:
 *
 *   Attempt 0: wait 1 second   (4^0 × 1000)
 *   Attempt 1: wait 4 seconds  (4^1 × 1000)
 *   Attempt 2: wait 16 seconds (4^2 × 1000)
 *
 * After exhausting all delays, the engine stops retrying until the next
 * reconnection event. The base-4 exponential backoff grows faster than
 * base-2, which is better for mobile where "server is down" typically
 * lasts longer than "brief network blip."
 */
export const SYNC_BACKOFF_DELAYS = [1000, 4000, 16000] as const;

/* ── Route Cache ──────────────────────────────────────────────────────── */

/**
 * How long cached route data is considered "fresh" before expiring.
 *
 * When the app fetches routes from Supabase, it writes them through to a
 * local SQLite cache. If a subsequent fetch fails (no network), the hook
 * falls back to this cached data — but only if it was cached within the
 * TTL window. After 24 hours, the cached data is considered too stale to
 * show, so the hook propagates the network error instead.
 *
 * 24 hours strikes a balance: routes don't change every minute (gyms reset
 * walls every few weeks), but we don't want to show week-old route lists
 * where half the routes might have been archived or replaced.
 */
export const ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/* ── QR Code Verification ─────────────────────────────────────────── */

/**
 * EC P-256 public key (JWK format) for verifying QR code JWT signatures.
 *
 * When a climber scans a QR code at the gym, the scanned data is a JWT
 * signed with an EC P-256 private key that lives in the sign-qr Edge
 * Function (Step 7.2). This public key is the other half of that keypair —
 * it can verify the JWT's signature but can't create new signed tokens.
 *
 * WHY JWK FORMAT?
 * JSON Web Key (JWK) is the standard format for representing crypto keys
 * in JSON. The `jose` library's `importJWK()` can directly consume this
 * object to create a CryptoKey for JWT verification — no parsing needed.
 *
 * WHY EC P-256?
 * Elliptic Curve keys are much smaller than RSA keys at equivalent security
 * levels. A P-256 key gives ~128-bit security with a ~64-byte public key,
 * vs ~256 bytes for a 2048-bit RSA key. Smaller keys = smaller QR codes.
 *
 * NOTE: This keypair was generated in Step 7.2. Production uses a different
 * keypair managed via `supabase secrets set`. The matching private key for
 * local dev lives in `supabase/.env.local` (gitignored).
 */
/* ── In-App Purchase (IAP) ─────────────────────────────────────────── */

/**
 * Product IDs registered in App Store Connect and Google Play Console.
 *
 * These must exactly match the product identifiers configured in both stores.
 * The reverse-domain naming convention (com.betabreaker.pro.monthly) is the
 * standard format expected by both Apple and Google.
 *
 * Currently we offer a single subscription tier: Pro Monthly.
 * If we add yearly or other tiers later, add them here.
 */
export const IAP_PRODUCT_IDS = {
  PRO_MONTHLY: 'com.betabreaker.pro.monthly',
} as const;

/**
 * Features that are gated by subscription tier.
 *
 * The `useEntitlement(feature)` hook checks the user's tier against these
 * features to determine access. The entitlement logic lives in
 * `utils/entitlements.ts` — these constants are just the feature identifiers.
 *
 *   analytics      — access to the full analytics dashboard (FR-J series)
 *   unlimited_beta — no weekly limit on beta video uploads
 *   extra_badges   — display up to 3 badges on profile (vs 1 for free)
 */
export const ENTITLEMENT_FEATURES = ['analytics', 'unlimited_beta', 'extra_badges'] as const;

/** Union type of features gated behind a subscription tier. */
export type EntitlementFeature = typeof ENTITLEMENT_FEATURES[number];

/**
 * Subscription lifecycle event types.
 *
 * These map to the `event_type` CHECK constraint on the `subscription_events`
 * table. Each represents a distinct moment in the subscription lifecycle:
 *
 *   purchase     — initial subscription purchase
 *   renewal      — automatic renewal by the store (subscription continues)
 *   cancellation — user cancelled, but access remains until expiry date
 *   expiration   — subscription expired (access should be revoked)
 *   restore      — user restored a previous purchase on a new device
 */
export const SUBSCRIPTION_EVENT_TYPES = ['purchase', 'renewal', 'cancellation', 'expiration', 'restore'] as const;

/** Union type for subscription event types. */
export type SubscriptionEventType = typeof SUBSCRIPTION_EVENT_TYPES[number];

/**
 * App store identifiers for IAP receipt validation.
 *
 * Used to route receipt verification to the correct store API:
 *   apple  — App Store Server API (iOS)
 *   google — Google Play Developer API (Android)
 */
export const IAP_STORES = ['apple', 'google'] as const;

/** Union type for app store identifiers. */
export type IapStore = typeof IAP_STORES[number];

export const QR_PUBLIC_KEY = {
  kty: 'EC',
  crv: 'P-256',
  x: 'eJxiTPk23BHL0fZhpYFCxrqKh-f4vkDfCSJ2eqFBxMg',
  y: 'Q5H3povkDpzIwa93Be_XWFypkPRz9DlzcJWgnGVbR4Y',
} as const;
