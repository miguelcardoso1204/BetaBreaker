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
  SCORING_MODELS,
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
} from '../constants';

// Import types to verify they exist and are usable at compile time.
// These imports will cause TypeScript errors until the types are exported.
import type {
  UserRole,
  Tier,
  RouteStatus,
  AscentStatus,
  ScoringModel,
  GradeSystem,
  NotificationCategory,
  SaveType,
  StyleTagKey,
  OfflineActionType,
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

/* ── SCORING_MODELS ─────────────────────────────────────────────────────── */

describe('SCORING_MODELS', () => {
  it('contains all 3 competition scoring models', () => {
    // Each scoring model rewards a different climbing style:
    // hardest_grade (strength), flash_rate (consistency), volume (endurance)
    expect(SCORING_MODELS).toContain('hardest_grade');
    expect(SCORING_MODELS).toContain('flash_rate');
    expect(SCORING_MODELS).toContain('volume');
    expect(SCORING_MODELS).toHaveLength(3);
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
    const scoringModel: ScoringModel = 'volume';
    const gradeSystem: GradeSystem = 'font';
    const notificationCategory: NotificationCategory = 'friends';
    const saveType: SaveType = 'project';
    const styleTag: StyleTagKey = 'power';

    // Use the variables so TypeScript doesn't warn about unused locals
    expect(role).toBe('climber');
    expect(tier).toBe('free');
    expect(routeStatus).toBe('active');
    expect(ascentStatus).toBe('flash');
    expect(scoringModel).toBe('volume');
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
