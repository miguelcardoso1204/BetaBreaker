/**
 * Zod Validation Schemas — Test Suite
 *
 * Tests for runtime validation schemas that protect the app's data boundaries.
 *
 * Why runtime validation?
 * TypeScript types are erased at compile time — they can't catch bad data
 * coming from user input, API responses, or form submissions at runtime.
 * Zod schemas give us runtime type checking that mirrors our TypeScript types,
 * so we catch invalid data before it reaches Supabase or corrupts app state.
 *
 * Each schema validates a specific user action (logging an ascent, registering,
 * creating a route, etc.) and exports an inferred TypeScript type so we get
 * both compile-time AND runtime safety from a single source of truth.
 *
 * TDD approach: These tests are written FIRST (Red phase). All should fail
 * until we implement utils/validation.ts (Green phase).
 */

import {
  ascentLogSchema,
  registrationSchema,
  loginSchema,
  routeCreateSchema,
  profileUpdateSchema,
  eventCreateSchema,
  feedbackSchema,
} from '../validation';

import type {
  AscentLogInput,
  RegistrationInput,
  LoginInput,
  RouteCreateInput,
  ProfileUpdateInput,
  EventCreateInput,
  FeedbackInput,
} from '../validation';

/**
 * A valid v4 UUID for use in tests. Zod's z.uuid() validates the format,
 * so we need a properly formatted UUID rather than a random string.
 */
const TEST_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

/* ── ascentLogSchema ──────────────────────────────────────────────────── */

describe('ascentLogSchema', () => {
  /**
   * The happy path: a climber logs a send with 3 attempts.
   * routeId must be a UUID (references the routes table),
   * status must be one of our predefined ascent types,
   * and attempts must be a positive integer.
   */
  it('accepts valid input with routeId, status, and attempts', () => {
    const result = ascentLogSchema.safeParse({
      routeId: TEST_UUID,
      status: 'send',
      attempts: 3,
    });
    expect(result.success).toBe(true);
  });

  /**
   * Notes are optional — climbers can add text like "used kneebar on crux"
   * to remember beta (techniques) for future attempts.
   */
  it('accepts valid input with optional notes', () => {
    const result = ascentLogSchema.safeParse({
      routeId: TEST_UUID,
      status: 'flash',
      attempts: 1,
      notes: 'Flashed on first try!',
    });
    expect(result.success).toBe(true);
  });

  /**
   * Status must be one of 'flash', 'send', or 'attempt'.
   * These map to climbing terminology:
   *   - flash: completed on first attempt with no prior beta
   *   - send: completed (may have taken multiple sessions)
   *   - attempt: tried but didn't complete the route
   */
  it('rejects invalid status value', () => {
    const result = ascentLogSchema.safeParse({
      routeId: TEST_UUID,
      status: 'banana',
      attempts: 1,
    });
    expect(result.success).toBe(false);
  });

  /**
   * routeId is required — every ascent must reference a specific route.
   * Without it, we can't link the log to any route in the database.
   */
  it('rejects missing routeId', () => {
    const result = ascentLogSchema.safeParse({
      status: 'send',
      attempts: 1,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Attempts must be at least 1 — you can't log zero attempts.
   * Even an "attempt" status means the climber tried at least once.
   */
  it('rejects attempts of 0', () => {
    const result = ascentLogSchema.safeParse({
      routeId: TEST_UUID,
      status: 'send',
      attempts: 0,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Attempts must be a whole number — you can't have 2.5 attempts.
   * z.int() enforces integer values at the Zod level.
   */
  it('rejects non-integer attempts', () => {
    const result = ascentLogSchema.safeParse({
      routeId: TEST_UUID,
      status: 'send',
      attempts: 2.5,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Notes are capped at 500 characters to prevent abuse and keep the
   * database column size reasonable. Long route beta should go in a
   * dedicated beta-sharing feature instead.
   */
  it('rejects notes exceeding 500 characters', () => {
    const result = ascentLogSchema.safeParse({
      routeId: TEST_UUID,
      status: 'send',
      attempts: 1,
      notes: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  /**
   * Boundary test: exactly 500 characters should be accepted.
   * This catches off-by-one errors in the max length check.
   */
  it('accepts notes at exactly 500 characters', () => {
    const result = ascentLogSchema.safeParse({
      routeId: TEST_UUID,
      status: 'send',
      attempts: 1,
      notes: 'x'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  /**
   * routeId must be a valid UUID format, not just any string.
   * This prevents bad foreign key references before they hit the DB.
   */
  it('rejects invalid UUID for routeId', () => {
    const result = ascentLogSchema.safeParse({
      routeId: 'not-a-uuid',
      status: 'send',
      attempts: 1,
    });
    expect(result.success).toBe(false);
  });
});

/* ── registrationSchema ───────────────────────────────────────────────── */

describe('registrationSchema', () => {
  /**
   * Happy path: valid email and a strong enough password (≥8 chars).
   * Email format is validated by z.email() which checks for proper
   * structure (local@domain.tld).
   */
  it('accepts valid email and password', () => {
    const result = registrationSchema.safeParse({
      email: 'climber@example.com',
      password: 'securepass123',
    });
    expect(result.success).toBe(true);
  });

  /**
   * displayName is optional during registration — users can set it later
   * in their profile. When provided, it shows on leaderboards and social features.
   */
  it('accepts valid input with optional displayName', () => {
    const result = registrationSchema.safeParse({
      email: 'climber@example.com',
      password: 'securepass123',
      displayName: 'CruxCrusher',
    });
    expect(result.success).toBe(true);
  });

  /**
   * z.email() rejects strings that don't match email format.
   * This catches typos before we send a verification email to a bad address.
   */
  it('rejects invalid email format', () => {
    const result = registrationSchema.safeParse({
      email: 'notanemail',
      password: 'securepass123',
    });
    expect(result.success).toBe(false);
  });

  /**
   * Password minimum length of 8 characters is a common security baseline.
   * Supabase Auth also enforces this server-side, but client-side validation
   * gives faster feedback to the user.
   */
  it('rejects password shorter than 8 characters', () => {
    const result = registrationSchema.safeParse({
      email: 'climber@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  /**
   * Boundary test: exactly 8 characters should be accepted.
   */
  it('accepts password at exactly 8 characters', () => {
    const result = registrationSchema.safeParse({
      email: 'climber@example.com',
      password: '12345678',
    });
    expect(result.success).toBe(true);
  });

  /**
   * Display names over 50 characters would break UI layouts
   * (leaderboard rows, profile headers, etc.).
   */
  it('rejects displayName exceeding 50 characters', () => {
    const result = registrationSchema.safeParse({
      email: 'climber@example.com',
      password: 'securepass123',
      displayName: 'x'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  /**
   * An empty display name is invalid — if provided, it must be at least
   * 1 character. Users who don't want a name should omit the field entirely.
   */
  it('rejects empty displayName', () => {
    const result = registrationSchema.safeParse({
      email: 'climber@example.com',
      password: 'securepass123',
      displayName: '',
    });
    expect(result.success).toBe(false);
  });
});

/* ── loginSchema ──────────────────────────────────────────────────────── */

describe('loginSchema', () => {
  /**
   * Login only needs valid email format and a non-empty password.
   * We don't enforce password strength rules here — those are for registration.
   * The actual password check happens in Supabase Auth.
   */
  it('accepts valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'climber@example.com',
      password: 'anypassword',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'notanemail',
      password: 'anypassword',
    });
    expect(result.success).toBe(false);
  });

  /**
   * Password must be non-empty for login. An empty string would be a
   * pointless API call that Supabase would reject anyway.
   */
  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'climber@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

/* ── routeCreateSchema ────────────────────────────────────────────────── */

describe('routeCreateSchema', () => {
  /**
   * Route creation requires: name, canonicalGrade (0–30 integer),
   * gymId (UUID of the gym), and setterId (UUID of the route setter).
   * This is an admin/setter action — regular climbers can't create routes.
   */
  it('accepts valid required fields', () => {
    const result = routeCreateSchema.safeParse({
      name: 'Crimpy Overhang',
      canonicalGrade: 15,
      gymId: TEST_UUID,
      setterId: TEST_UUID,
    });
    expect(result.success).toBe(true);
  });

  /**
   * Optional fields: color (hold color marking) and wallSection
   * (e.g., "Cave", "Slab wall") help climbers find routes in the gym.
   */
  it('accepts valid input with optional color and wallSection', () => {
    const result = routeCreateSchema.safeParse({
      name: 'Crimpy Overhang',
      canonicalGrade: 15,
      gymId: TEST_UUID,
      setterId: TEST_UUID,
      color: 'blue',
      wallSection: 'Cave',
    });
    expect(result.success).toBe(true);
  });

  /**
   * All required fields must be present — omitting any should fail.
   */
  it('rejects when required fields are missing', () => {
    const result = routeCreateSchema.safeParse({
      name: 'Crimpy Overhang',
      // missing canonicalGrade, gymId, setterId
    });
    expect(result.success).toBe(false);
  });

  /**
   * Canonical grade must be >= 0. Negative grades don't exist in climbing.
   */
  it('rejects canonicalGrade below 0', () => {
    const result = routeCreateSchema.safeParse({
      name: 'Crimpy Overhang',
      canonicalGrade: -1,
      gymId: TEST_UUID,
      setterId: TEST_UUID,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Canonical grade must be <= 30. Our grade table only covers 0–30.
   */
  it('rejects canonicalGrade above 30', () => {
    const result = routeCreateSchema.safeParse({
      name: 'Crimpy Overhang',
      canonicalGrade: 31,
      gymId: TEST_UUID,
      setterId: TEST_UUID,
    });
    expect(result.success).toBe(false);
  });

  /**
   * canonicalGrade must be an integer — no fractional grades.
   * This matches the GRADE_TABLE structure in utils/grades.ts.
   */
  it('rejects non-integer canonicalGrade', () => {
    const result = routeCreateSchema.safeParse({
      name: 'Crimpy Overhang',
      canonicalGrade: 10.5,
      gymId: TEST_UUID,
      setterId: TEST_UUID,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Route names over 100 characters would break list UI layouts.
   */
  it('rejects name exceeding 100 characters', () => {
    const result = routeCreateSchema.safeParse({
      name: 'x'.repeat(101),
      canonicalGrade: 15,
      gymId: TEST_UUID,
      setterId: TEST_UUID,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Route name must be non-empty — every route needs a name for identification.
   */
  it('rejects empty name', () => {
    const result = routeCreateSchema.safeParse({
      name: '',
      canonicalGrade: 15,
      gymId: TEST_UUID,
      setterId: TEST_UUID,
    });
    expect(result.success).toBe(false);
  });
});

/* ── profileUpdateSchema ──────────────────────────────────────────────── */

describe('profileUpdateSchema', () => {
  /**
   * Profile updates use PATCH semantics — all fields are optional.
   * An empty object is valid (no-op update). This is achieved by applying
   * .partial() to the full profile shape.
   */
  it('accepts empty object (all fields optional)', () => {
    const result = profileUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid displayName', () => {
    const result = profileUpdateSchema.safeParse({
      displayName: 'CruxCrusher',
    });
    expect(result.success).toBe(true);
  });

  /**
   * avatarUrl must be a valid URL — it points to the user's profile
   * picture stored in Supabase Storage or an external provider.
   */
  it('accepts valid avatarUrl', () => {
    const result = profileUpdateSchema.safeParse({
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(result.success).toBe(true);
  });

  /**
   * preferredGradeSystem determines how grades display in the UI.
   * Must be one of our three supported systems from utils/grades.ts.
   */
  it('accepts valid preferredGradeSystem', () => {
    const result = profileUpdateSchema.safeParse({
      preferredGradeSystem: 'font',
    });
    expect(result.success).toBe(true);
  });

  /**
   * Invalid grade system strings should be rejected. "french" is not
   * a recognized system — the closest valid value is "font".
   */
  it('rejects invalid preferredGradeSystem', () => {
    const result = profileUpdateSchema.safeParse({
      preferredGradeSystem: 'french',
    });
    expect(result.success).toBe(false);
  });

  /**
   * avatarUrl must be a properly formatted URL, not arbitrary text.
   */
  it('rejects invalid avatarUrl', () => {
    const result = profileUpdateSchema.safeParse({
      avatarUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  /**
   * Display names over 50 characters are rejected, same as registration.
   */
  it('rejects displayName exceeding 50 characters', () => {
    const result = profileUpdateSchema.safeParse({
      displayName: 'x'.repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

/* ── eventCreateSchema ────────────────────────────────────────────────── */

describe('eventCreateSchema', () => {
  /**
   * Events (competitions, challenges) need a name, scoring model,
   * and a gym they're hosted at. Dates are optional — an event can
   * be created before scheduling it.
   */
  it('accepts valid required fields only', () => {
    const result = eventCreateSchema.safeParse({
      name: 'Summer Comp 2026',
      scoringModel: 'hardest_grade',
      gymId: TEST_UUID,
    });
    expect(result.success).toBe(true);
  });

  /**
   * When both dates are provided, they must be valid ISO 8601 datetime strings.
   * The endDate must be >= startDate (enforced by a .refine() cross-field check).
   */
  it('accepts valid input with start and end dates', () => {
    const result = eventCreateSchema.safeParse({
      name: 'Summer Comp 2026',
      scoringModel: 'flash_rate',
      gymId: TEST_UUID,
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-15T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  /**
   * Scoring model must be one of our predefined models.
   * Each model calculates competition scores differently:
   *   - hardest_grade: score based on the hardest route completed
   *   - flash_rate: rewards first-try completions
   *   - volume: counts total number of routes completed
   */
  it('rejects invalid scoringModel', () => {
    const result = eventCreateSchema.safeParse({
      name: 'Summer Comp 2026',
      scoringModel: 'custom_model',
      gymId: TEST_UUID,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Event name is required — competitions need a title.
   */
  it('rejects missing name', () => {
    const result = eventCreateSchema.safeParse({
      scoringModel: 'hardest_grade',
      gymId: TEST_UUID,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Event names over 200 characters would break UI layouts and are
   * unlikely to be legitimate.
   */
  it('rejects name exceeding 200 characters', () => {
    const result = eventCreateSchema.safeParse({
      name: 'x'.repeat(201),
      scoringModel: 'hardest_grade',
      gymId: TEST_UUID,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Cross-field validation: endDate before startDate is illogical.
   * This is enforced with Zod's .refine() method, which runs after
   * individual field validation passes.
   */
  it('rejects endDate before startDate', () => {
    const result = eventCreateSchema.safeParse({
      name: 'Summer Comp 2026',
      scoringModel: 'hardest_grade',
      gymId: TEST_UUID,
      startDate: '2026-06-15T00:00:00.000Z',
      endDate: '2026-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  /**
   * Having only a start date is valid — the event runs indefinitely
   * or the end date will be set later.
   */
  it('accepts only startDate without endDate', () => {
    const result = eventCreateSchema.safeParse({
      name: 'Summer Comp 2026',
      scoringModel: 'hardest_grade',
      gymId: TEST_UUID,
      startDate: '2026-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  /**
   * Having only an end date is valid — useful for "deadline" style events
   * where there's no formal start.
   */
  it('accepts only endDate without startDate', () => {
    const result = eventCreateSchema.safeParse({
      name: 'Summer Comp 2026',
      scoringModel: 'hardest_grade',
      gymId: TEST_UUID,
      endDate: '2026-06-15T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

/* ── feedbackSchema ───────────────────────────────────────────────────── */

describe('feedbackSchema', () => {
  /**
   * Feedback requires only a body (text content). Users can submit
   * general gym feedback without referencing a specific route.
   */
  it('accepts valid body only', () => {
    const result = feedbackSchema.safeParse({
      body: 'Great route setting this week!',
    });
    expect(result.success).toBe(true);
  });

  /**
   * Route-specific feedback includes a routeId and an optional numeric
   * rating (1–5 stars). This helps setters understand which routes
   * climbers enjoy.
   */
  it('accepts valid input with routeId and rating', () => {
    const result = feedbackSchema.safeParse({
      body: 'Fun movements but the start is awkward.',
      routeId: TEST_UUID,
      rating: 4,
    });
    expect(result.success).toBe(true);
  });

  /**
   * Body is required — feedback without content is meaningless.
   */
  it('rejects missing body', () => {
    const result = feedbackSchema.safeParse({
      routeId: TEST_UUID,
      rating: 3,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Feedback body is capped at 1000 characters. Longer feedback
   * should be split into multiple submissions or use a different
   * communication channel.
   */
  it('rejects body exceeding 1000 characters', () => {
    const result = feedbackSchema.safeParse({
      body: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  /**
   * Rating must be at least 1 — the scale is 1–5, not 0–5.
   */
  it('rejects rating of 0', () => {
    const result = feedbackSchema.safeParse({
      body: 'Some feedback',
      rating: 0,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Rating must be at most 5 — no "11 out of 10" allowed.
   */
  it('rejects rating of 6', () => {
    const result = feedbackSchema.safeParse({
      body: 'Some feedback',
      rating: 6,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Rating must be a whole number — half-star ratings aren't supported.
   */
  it('rejects non-integer rating', () => {
    const result = feedbackSchema.safeParse({
      body: 'Some feedback',
      rating: 3.5,
    });
    expect(result.success).toBe(false);
  });

  /**
   * Boundary test: exactly 1000 characters should be accepted.
   */
  it('accepts body at exactly 1000 characters', () => {
    const result = feedbackSchema.safeParse({
      body: 'x'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });
});

/* ── Type inference ───────────────────────────────────────────────────── */

describe('type inference', () => {
  /**
   * Compile-time check: verify that all 7 inferred types exist and are
   * assignable. If any type export is missing or misnamed, this test file
   * won't compile at all (caught by `npx tsc --noEmit`).
   *
   * At runtime, we just confirm the type aliases produce valid objects.
   * The real value is at compile time — TypeScript's type checker verifies
   * structural compatibility of each assignment below.
   */
  it('all 7 inferred types are assignable', () => {
    // These assignments verify that the inferred types are structurally
    // compatible with the expected shapes. If the schema changes in a
    // way that breaks the type, TypeScript will catch it at compile time.
    const ascent: AscentLogInput = {
      routeId: TEST_UUID,
      status: 'send',
      attempts: 1,
    };

    const registration: RegistrationInput = {
      email: 'test@example.com',
      password: 'securepass',
    };

    const login: LoginInput = {
      email: 'test@example.com',
      password: 'pass',
    };

    const route: RouteCreateInput = {
      name: 'Test Route',
      canonicalGrade: 10,
      gymId: TEST_UUID,
      setterId: TEST_UUID,
    };

    const profile: ProfileUpdateInput = {};

    const event: EventCreateInput = {
      name: 'Test Event',
      scoringModel: 'hardest_grade',
      gymId: TEST_UUID,
    };

    const feedback: FeedbackInput = {
      body: 'Great route!',
    };

    // Runtime check: all variables are defined objects
    expect(ascent).toBeDefined();
    expect(registration).toBeDefined();
    expect(login).toBeDefined();
    expect(route).toBeDefined();
    expect(profile).toBeDefined();
    expect(event).toBeDefined();
    expect(feedback).toBeDefined();
  });
});
