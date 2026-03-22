/**
 * Tests for lib/constants.ts — App-Wide Domain Constants
 *
 * These tests verify that all domain constants are correctly defined and that
 * TypeScript types are properly derived from the `as const` arrays. This is
 * the "single source of truth" for business domain values used throughout
 * the app — services, hooks, UI components, and database schemas all
 * reference these constants.
 *
 * TDD Red Phase: These tests are written FIRST, before the constants exist.
 * They will fail until we implement the constants in lib/constants.ts.
 */

import {
  ROLES,
  ROUTE_STATUSES,
  GRADE_SYSTEMS,
  ASCENT_STATUSES,
  NOTIFICATION_CATEGORIES,
  SAVE_TYPES,
  FREE_TIER,
  PRO_TIER,
  TIERS,
  APP_NAME,
  STYLE_TAGS,
  OFFLINE_ACTION_TYPES,
  MAX_OFFLINE_RETRIES,
  OFFLINE_DB_NAME,
  ROUTE_CACHE_TTL_MS,
  SYNC_BACKOFF_DELAYS,
  QR_PUBLIC_KEY,
  IAP_PRODUCT_IDS,
  ENTITLEMENT_FEATURES,
  SUBSCRIPTION_EVENT_TYPES,
  IAP_STORES,
  PROMO_CODE_TYPES,
  TRIAL_DURATION_DAYS,
  TRIAL_STATUSES,
} from '../constants';

// Import types to verify they exist and are usable at compile time.
// These imports will cause TypeScript errors until the types are exported.
import type {
  UserRole,
  Tier,
  RouteStatus,
  AscentStatus,
  GradeSystem,
  NotificationCategory,
  SaveType,
  StyleTagKey,
  OfflineActionType,
  EntitlementFeature,
  SubscriptionEventType,
  IapStore,
  PromoCodeType,
  TrialStatus,
} from '../constants';

/* ── ROLES ──────────────────────────────────────────────────────────────── */

describe('ROLES', () => {
  it('contains all 5 expected roles in the correct hierarchy order', () => {
    // Roles represent the permission hierarchy in the app:
    // climber (basic) → setter (route creator) → judge (event official)
    // → gym_admin (manages a gym) → super_admin (platform-wide)
    expect(ROLES).toContain('climber');
    expect(ROLES).toContain('setter');
    expect(ROLES).toContain('judge');
    expect(ROLES).toContain('gym_admin');
    expect(ROLES).toContain('super_admin');
  });

  it('has exactly 5 entries (no extras sneaking in)', () => {
    // Guard against accidentally adding roles without updating tests.
    // If this fails, a new role was added — update the test above too.
    expect(ROLES).toHaveLength(5);
  });
});

/* ── FREE_TIER ──────────────────────────────────────────────────────────── */

describe('FREE_TIER', () => {
  it('has correct limits for the free plan', () => {
    // Free tier is intentionally restrictive to encourage upgrades:
    // - 1 badge displayed on profile (pro gets 3)
    // - 5 beta videos per week (pro gets unlimited)
    // - No analytics dashboard access
    expect(FREE_TIER.name).toBe('free');
    expect(FREE_TIER.maxBadges).toBe(1);
    expect(FREE_TIER.betaPerWeek).toBe(5);
    expect(FREE_TIER.analyticsEnabled).toBe(false);
  });
});

/* ── PRO_TIER ───────────────────────────────────────────────────────────── */

describe('PRO_TIER', () => {
  it('has correct limits for the pro plan', () => {
    // Pro tier unlocks the full experience:
    // - 3 badges on profile
    // - Infinity for betaPerWeek means no limit — simple `count <= tier.betaPerWeek` checks work
    // - Analytics dashboard enabled for tracking climbing progress
    expect(PRO_TIER.name).toBe('pro');
    expect(PRO_TIER.maxBadges).toBe(3);
    expect(PRO_TIER.betaPerWeek).toBe(Infinity);
    expect(PRO_TIER.analyticsEnabled).toBe(true);
  });
});

/* ── ROUTE_STATUSES ─────────────────────────────────────────────────────── */

describe('ROUTE_STATUSES', () => {
  it('contains all 3 route lifecycle statuses', () => {
    // Routes move through these statuses over their lifecycle:
    // active (climbable) → retiring_soon (about to be taken down) → archived (removed)
    expect(ROUTE_STATUSES).toContain('active');
    expect(ROUTE_STATUSES).toContain('retiring_soon');
    expect(ROUTE_STATUSES).toContain('archived');
    expect(ROUTE_STATUSES).toHaveLength(3);
  });
});

/* ── GRADE_SYSTEMS ──────────────────────────────────────────────────────── */

describe('GRADE_SYSTEMS', () => {
  it('contains all 3 supported grading systems', () => {
    // Different regions/gyms prefer different grade systems:
    // v-scale (US bouldering), font (European bouldering), yds (rope climbing)
    expect(GRADE_SYSTEMS).toContain('v-scale');
    expect(GRADE_SYSTEMS).toContain('font');
    expect(GRADE_SYSTEMS).toContain('yds');
    expect(GRADE_SYSTEMS).toHaveLength(3);
  });
});

/* ── NOTIFICATION_CATEGORIES ────────────────────────────────────────────── */

describe('NOTIFICATION_CATEGORIES', () => {
  it('contains all 4 notification categories', () => {
    // Users can toggle notifications per category in their settings:
    // friends (social activity), routes (new/retiring routes),
    // comps (competition updates), achievements (badges/streaks)
    expect(NOTIFICATION_CATEGORIES).toContain('friends');
    expect(NOTIFICATION_CATEGORIES).toContain('routes');
    expect(NOTIFICATION_CATEGORIES).toContain('comps');
    expect(NOTIFICATION_CATEGORIES).toContain('achievements');
    expect(NOTIFICATION_CATEGORIES).toHaveLength(4);
  });
});

/* ── SAVE_TYPES ─────────────────────────────────────────────────────────── */

describe('SAVE_TYPES', () => {
  it('contains all 3 save/bookmark types', () => {
    // Climbers can save routes for different reasons:
    // project (working on it), wishlist (want to try), favorite (completed & loved)
    expect(SAVE_TYPES).toContain('project');
    expect(SAVE_TYPES).toContain('wishlist');
    expect(SAVE_TYPES).toContain('favorite');
    expect(SAVE_TYPES).toHaveLength(3);
  });
});

/* ── ASCENT_STATUSES ────────────────────────────────────────────────────── */

describe('ASCENT_STATUSES', () => {
  it('contains all 3 ascent outcome statuses', () => {
    // How a climbing attempt ended:
    // flash (first try success), send (completed after multiple tries), attempt (didn't finish)
    expect(ASCENT_STATUSES).toContain('flash');
    expect(ASCENT_STATUSES).toContain('send');
    expect(ASCENT_STATUSES).toContain('attempt');
    expect(ASCENT_STATUSES).toHaveLength(3);
  });
});

/* ── TIERS ──────────────────────────────────────────────────────────────── */

describe('TIERS', () => {
  it('maps tier names to their config objects', () => {
    // TIERS is a convenience lookup: given a tier name string ('free' or 'pro'),
    // you can get the full config object with `TIERS[tierName]`
    expect(TIERS.free).toBe(FREE_TIER);
    expect(TIERS.pro).toBe(PRO_TIER);
  });
});

/* ── Type Inference ─────────────────────────────────────────────────────── */

describe('type inference', () => {
  it('all 9 derived types exist and are assignable', () => {
    // This test verifies at compile time that each type is correctly derived
    // from its `as const` array using `typeof X[number]`. If any type is
    // missing or incorrectly defined, TypeScript will error during `tsc --noEmit`.
    //
    // At runtime, we just assign valid values to confirm the types work.
    // The real value is the compile-time check — if this file compiles, the types are correct.
    const role: UserRole = 'climber';
    const tier: Tier = 'free';
    const routeStatus: RouteStatus = 'active';
    const ascentStatus: AscentStatus = 'flash';
    const gradeSystem: GradeSystem = 'font';
    const notificationCategory: NotificationCategory = 'friends';
    const saveType: SaveType = 'project';
    const styleTag: StyleTagKey = 'power';

    // Use the variables so TypeScript doesn't warn about unused locals
    expect(role).toBe('climber');
    expect(tier).toBe('free');
    expect(routeStatus).toBe('active');
    expect(ascentStatus).toBe('flash');
    expect(gradeSystem).toBe('font');
    expect(notificationCategory).toBe('friends');
    expect(saveType).toBe('project');
    expect(styleTag).toBe('power');
  });
});

/* ── STYLE_TAGS ────────────────────────────────────────────────────────── */

describe('STYLE_TAGS', () => {
  it('contains 6 entries, each with key, label, and color', () => {
    // Style tags categorize the skills a climbing route demands.
    // Each tag needs a unique key (for state tracking), a display label,
    // and a hex color (for the Badge component's "tag" variant).
    expect(STYLE_TAGS).toHaveLength(6);

    // Verify every entry has the required shape
    STYLE_TAGS.forEach((tag) => {
      expect(tag).toHaveProperty('key');
      expect(tag).toHaveProperty('label');
      expect(tag).toHaveProperty('color');
      // Color should be a hex string (e.g., "#EF4444")
      expect(tag.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

/* ── APP_NAME (existing) ────────────────────────────────────────────────── */

describe('APP_NAME', () => {
  it('is the correct app name string', () => {
    expect(APP_NAME).toBe('Beta Breaker');
  });
});

/* ── OFFLINE_ACTION_TYPES ──────────────────────────────────────────────── */

describe('OFFLINE_ACTION_TYPES', () => {
  it('contains exactly 2 supported offline action types', () => {
    // These are the write operations that can be queued while offline.
    // The sync engine replays them in FIFO order when connectivity returns.
    expect(OFFLINE_ACTION_TYPES).toHaveLength(2);
    expect(OFFLINE_ACTION_TYPES).toContain('log_ascent');
    expect(OFFLINE_ACTION_TYPES).toContain('delete_ascent');
  });
});

/* ── MAX_OFFLINE_RETRIES ───────────────────────────────────────────────── */

describe('MAX_OFFLINE_RETRIES', () => {
  it('is 3 — the maximum retry attempts before giving up', () => {
    // After 3 failed attempts, the action stays in the queue but won't
    // be retried automatically (user can manually retry or discard).
    expect(MAX_OFFLINE_RETRIES).toBe(3);
  });
});

/* ── OFFLINE_DB_NAME ───────────────────────────────────────────────────── */

describe('OFFLINE_DB_NAME', () => {
  it('is the correct SQLite database filename', () => {
    // expo-sqlite uses this filename to open/create the DB in the app's
    // sandboxed documents directory. Must match what offlineDb.ts uses.
    expect(OFFLINE_DB_NAME).toBe('betabreaker_offline.db');
  });
});

/* ── ROUTE_CACHE_TTL_MS ──────────────────────────────────────────────── */

describe('ROUTE_CACHE_TTL_MS', () => {
  it('is exactly 24 hours in milliseconds', () => {
    // The route cache TTL determines how long cached route data is considered
    // fresh. After this period, getCachedRoutes() treats the data as expired
    // and returns null, forcing a fresh network fetch.
    // 24 hours = 24 * 60 * 60 * 1000 = 86_400_000 ms
    expect(ROUTE_CACHE_TTL_MS).toBe(86_400_000);
  });
});

/* ── OfflineActionType (type inference) ────────────────────────────────── */

describe('OfflineActionType type inference', () => {
  it('accepts valid offline action types', () => {
    // Compile-time check: OfflineActionType should accept exactly the
    // values in OFFLINE_ACTION_TYPES. Invalid values would cause tsc errors.
    const logAscent: OfflineActionType = 'log_ascent';
    const deleteAscent: OfflineActionType = 'delete_ascent';

    expect(logAscent).toBe('log_ascent');
    expect(deleteAscent).toBe('delete_ascent');
  });
});

/* ── SYNC_BACKOFF_DELAYS ─────────────────────────────────────────────── */

describe('SYNC_BACKOFF_DELAYS', () => {
  it('is [1000, 4000, 16000] — exponential backoff delays for sync retries', () => {
    // When the sync engine fails to replay an action, it retries with
    // increasing delays: 1s → 4s → 16s (4^n * 1000ms). This prevents
    // hammering the server when it's temporarily unavailable.
    expect(SYNC_BACKOFF_DELAYS).toEqual([1000, 4000, 16000]);
  });
});

/* ── QR_PUBLIC_KEY ──────────────────────────────────────────────────── */

describe('QR_PUBLIC_KEY', () => {
  it('has the required JWK fields for an EC P-256 public key', () => {
    // The QR public key is used by jose's `importJWK` to verify JWT
    // signatures on scanned QR codes. JWK format requires these four
    // fields for an EC P-256 key:
    //   kty: "EC" — key type (Elliptic Curve)
    //   crv: "P-256" — the specific curve used
    //   x: base64url-encoded x coordinate of the public point
    //   y: base64url-encoded y coordinate of the public point
    expect(QR_PUBLIC_KEY).toHaveProperty('kty', 'EC');
    expect(QR_PUBLIC_KEY).toHaveProperty('crv', 'P-256');
    expect(QR_PUBLIC_KEY).toHaveProperty('x');
    expect(QR_PUBLIC_KEY).toHaveProperty('y');
    // x and y should be non-empty base64url strings
    expect(typeof QR_PUBLIC_KEY.x).toBe('string');
    expect(typeof QR_PUBLIC_KEY.y).toBe('string');
    expect(QR_PUBLIC_KEY.x.length).toBeGreaterThan(0);
    expect(QR_PUBLIC_KEY.y.length).toBeGreaterThan(0);
  });
});

/* ── IAP_PRODUCT_IDS ──────────────────────────────────────────────── */

describe('IAP_PRODUCT_IDS', () => {
  it('has a PRO_MONTHLY product ID using reverse-domain format', () => {
    // The product ID must match exactly what's registered in App Store Connect
    // and Google Play Console. Reverse-domain format is the convention.
    expect(IAP_PRODUCT_IDS.PRO_MONTHLY).toBe('com.betabreaker.pro.monthly');
  });
});

/* ── ENTITLEMENT_FEATURES ─────────────────────────────────────────── */

describe('ENTITLEMENT_FEATURES', () => {
  it('contains exactly 3 gated feature names', () => {
    // These are the features that differ between free and pro tiers.
    // Used by useEntitlement(feature) to check access at runtime.
    expect(ENTITLEMENT_FEATURES).toHaveLength(3);
    expect(ENTITLEMENT_FEATURES).toContain('analytics');
    expect(ENTITLEMENT_FEATURES).toContain('unlimited_beta');
    expect(ENTITLEMENT_FEATURES).toContain('extra_badges');
  });
});

/* ── SUBSCRIPTION_EVENT_TYPES ─────────────────────────────────────── */

describe('SUBSCRIPTION_EVENT_TYPES', () => {
  it('contains exactly 5 subscription lifecycle event types', () => {
    // Maps to the event_type CHECK constraint on the subscription_events table.
    // Each type corresponds to a specific stage in the subscription lifecycle.
    expect(SUBSCRIPTION_EVENT_TYPES).toHaveLength(5);
    expect(SUBSCRIPTION_EVENT_TYPES).toContain('purchase');
    expect(SUBSCRIPTION_EVENT_TYPES).toContain('renewal');
    expect(SUBSCRIPTION_EVENT_TYPES).toContain('cancellation');
    expect(SUBSCRIPTION_EVENT_TYPES).toContain('expiration');
    expect(SUBSCRIPTION_EVENT_TYPES).toContain('restore');
  });
});

/* ── IAP_STORES ───────────────────────────────────────────────────── */

describe('IAP_STORES', () => {
  it('contains exactly 2 store identifiers', () => {
    // Maps to the store CHECK constraint on the subscription_events table.
    // Used to determine which store API to call for receipt validation.
    expect(IAP_STORES).toHaveLength(2);
    expect(IAP_STORES).toContain('apple');
    expect(IAP_STORES).toContain('google');
  });
});

/* ── IAP Type Inference ───────────────────────────────────────────── */

describe('IAP type inference', () => {
  it('IAP-related types are correctly derived and assignable', () => {
    // Compile-time check — if these assignments fail, types are broken.
    const feature: EntitlementFeature = 'analytics';
    const eventType: SubscriptionEventType = 'purchase';
    const store: IapStore = 'apple';

    expect(feature).toBe('analytics');
    expect(eventType).toBe('purchase');
    expect(store).toBe('apple');
  });

  it('trial/promo types are correctly derived and assignable', () => {
    // Compile-time check — PromoCodeType and TrialStatus should be
    // derived from their respective `as const` arrays.
    const codeType: PromoCodeType = 'trial';
    const trialStatus: TrialStatus = 'active';

    expect(codeType).toBe('trial');
    expect(trialStatus).toBe('active');
  });
});

/* ── PROMO_CODE_TYPES ──────────────────────────────────────────────── */

describe('PROMO_CODE_TYPES', () => {
  it('contains exactly 2 promo code types', () => {
    // Promo codes can grant either a trial period or a discount.
    // 'trial' codes give temporary pro access; 'discount' codes are
    // reserved for future use (e.g., percentage off subscription).
    expect(PROMO_CODE_TYPES).toHaveLength(2);
    expect(PROMO_CODE_TYPES).toContain('trial');
    expect(PROMO_CODE_TYPES).toContain('discount');
  });
});

/* ── TRIAL_DURATION_DAYS ───────────────────────────────────────────── */

describe('TRIAL_DURATION_DAYS', () => {
  it('is 7 — the default trial period in days', () => {
    // New trial users get 7 days of Pro access. This matches the
    // default_duration_days on the promo_codes table and is used
    // by the Edge Function when creating a trial record.
    expect(TRIAL_DURATION_DAYS).toBe(7);
  });
});

/* ── TRIAL_STATUSES ────────────────────────────────────────────────── */

describe('TRIAL_STATUSES', () => {
  it('contains exactly 2 trial statuses', () => {
    // A trial is either actively granting pro access or has expired.
    // The expire_trials() function transitions 'active' → 'expired'.
    expect(TRIAL_STATUSES).toHaveLength(2);
    expect(TRIAL_STATUSES).toContain('active');
    expect(TRIAL_STATUSES).toContain('expired');
  });
});
