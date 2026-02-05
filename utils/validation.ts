/**
 * Zod Validation Schemas — utils/validation.ts
 *
 * Runtime validation for user input across the app. These schemas act as
 * the "gatekeepers" between raw user/form data and the rest of the app.
 *
 * Why Zod?
 * TypeScript types disappear at runtime (they're only used by the compiler).
 * When a user submits a form or we receive data from an API, we need to
 * verify the shape and content of that data AT RUNTIME — not just at
 * compile time. Zod gives us:
 *
 *   1. Runtime validation — `.safeParse()` checks data against the schema
 *      and returns `{ success: true, data }` or `{ success: false, error }`
 *
 *   2. TypeScript type inference — `z.infer<typeof schema>` generates a
 *      TypeScript type from the schema, so we define the shape ONCE and
 *      get both runtime + compile-time safety
 *
 *   3. Composability — schemas can be combined with `.partial()`, `.refine()`,
 *      `.extend()`, etc. to build complex validations from simple pieces
 *
 * Zod v4 API (4.3.6):
 * This project uses Zod v4's top-level constructors like `z.uuid()`,
 * `z.email()`, `z.url()`, `z.int()`, and `z.iso.datetime()`. These
 * replace the older chain-style methods (e.g., `z.string().uuid()`)
 * and are the recommended approach in Zod 4.x.
 *
 * All schemas are pure data validation — no side effects, no network calls,
 * no database access. This makes them safe to import anywhere and easy to test.
 */

import { z } from 'zod';

/* ── Enum Constants ───────────────────────────────────────────────────── */

/**
 * Valid ascent statuses in climbing terminology:
 *   - 'flash': Completed the route on the very first attempt, no prior info
 *   - 'send':  Completed the route (may have taken multiple attempts/sessions)
 *   - 'attempt': Tried the route but did not complete it
 *
 * Defined as `as const` so TypeScript narrows the type from string[] to
 * a readonly tuple of literal strings, enabling proper enum validation.
 */
const ASCENT_STATUSES = ['flash', 'send', 'attempt'] as const;

/**
 * Supported grade display systems — matches GradeSystem type in utils/grades.ts.
 * Defined locally to avoid importing from another module, which would create
 * a dependency chain and potential circular imports as the codebase grows.
 */
const GRADE_SYSTEMS = ['v-scale', 'font', 'yds'] as const;

/**
 * Competition scoring models that determine how events rank participants:
 *   - 'hardest_grade': Score based on the hardest route completed
 *   - 'flash_rate':    Rewards first-try completions (flash attempts)
 *   - 'volume':        Counts total number of routes completed
 */
const SCORING_MODELS = ['hardest_grade', 'flash_rate', 'volume'] as const;

/* ── Schemas ──────────────────────────────────────────────────────────── */

/**
 * Validates ascent log submissions — when a climber records an attempt
 * or completion of a route.
 *
 * - routeId: UUID referencing the specific route in the database
 * - status: What happened (flash / send / attempt)
 * - attempts: How many tries it took (minimum 1 — even a failed attempt counts)
 * - notes: Optional free-text for remembering beta (climbing techniques)
 *
 * z.uuid() validates the UUID v4 format at runtime — catching bad references
 * before they become foreign key violations in Postgres.
 * z.int() ensures only whole numbers (no 2.5 attempts).
 */
export const ascentLogSchema = z.object({
  routeId: z.uuid(),
  status: z.enum(ASCENT_STATUSES),
  attempts: z.int().min(1),
  notes: z.string().max(500).optional(),
});

/**
 * Validates new user registration.
 *
 * - email: Must be a valid email format (checked by z.email())
 * - password: Minimum 8 characters — a common security baseline that
 *   Supabase Auth also enforces server-side
 * - displayName: Optional at registration; shown on leaderboards/social.
 *   When provided, must be 1–50 characters (empty string is not allowed
 *   because that would look broken in the UI).
 */
export const registrationSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(50).optional(),
});

/**
 * Validates login credentials.
 *
 * Unlike registration, login only checks that the email looks valid and
 * the password is non-empty (min(1)). We don't enforce password strength
 * rules at login — the user already registered with a valid password,
 * and the actual credential check happens in Supabase Auth.
 */
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * Validates route creation by setters/admins.
 *
 * - name: 1–100 chars, identifies the route for climbers
 * - canonicalGrade: Integer 0–30 matching our GRADE_TABLE in utils/grades.ts.
 *   z.int() rejects floats; .min(0).max(30) enforces the valid range
 * - gymId: UUID of the gym this route belongs to
 * - setterId: UUID of the setter who created the route
 * - color: Optional hold color (e.g., "blue", "green") for identification
 * - wallSection: Optional gym area (e.g., "Cave", "Slab") for navigation
 */
export const routeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  canonicalGrade: z.int().min(0).max(30),
  gymId: z.uuid(),
  setterId: z.uuid(),
  color: z.string().optional(),
  wallSection: z.string().optional(),
});

/**
 * Validates profile update requests using PATCH semantics.
 *
 * .partial() makes every field optional — the user can update any
 * combination of fields without sending the others. An empty object {}
 * is valid (no-op update, useful for "save" buttons that may have no changes).
 *
 * We define the full shape first, then call .partial() on it. This way
 * each field still has its individual validation rules (max length, format)
 * but none of them are required.
 */
export const profileUpdateSchema = z.object({
  displayName: z.string().min(1).max(50),
  avatarUrl: z.url(),
  homeGymId: z.uuid(),
  preferredGradeSystem: z.enum(GRADE_SYSTEMS),
}).partial();

/**
 * Validates event (competition/challenge) creation.
 *
 * The base schema validates individual fields. We then add a cross-field
 * validation using .refine() to ensure endDate >= startDate when both
 * are provided. Having only one date is valid (open-ended events).
 *
 * z.iso.datetime() validates full ISO 8601 datetime strings like
 * "2026-06-01T00:00:00.000Z". Date-only strings like "2026-06-01"
 * are rejected because we need timezone-aware timestamps for
 * accurate event scheduling across time zones.
 *
 * Why infer the type from eventCreateBaseSchema instead of eventCreateSchema?
 * .refine() wraps the schema in a ZodEffects type, which changes the
 * inferred type's shape. Using the base (pre-refine) schema for type
 * inference gives us a clean, unwrapped TypeScript type while still
 * getting runtime cross-field validation from the refined version.
 */
const eventCreateBaseSchema = z.object({
  name: z.string().min(1).max(200),
  scoringModel: z.enum(SCORING_MODELS),
  gymId: z.uuid(),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
});

export const eventCreateSchema = eventCreateBaseSchema.refine(
  (data) => {
    // Only validate date ordering when BOTH dates are present.
    // If either is missing, skip the check — single-date events are valid.
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'endDate must be on or after startDate',
  }
);

/**
 * Validates feedback submissions from climbers.
 *
 * - body: Required text (1–1000 chars). The main feedback content.
 * - routeId: Optional UUID linking feedback to a specific route.
 *   When omitted, the feedback is general gym feedback.
 * - rating: Optional 1–5 star rating. z.int() rejects half-stars.
 *   Only meaningful for route-specific feedback.
 */
export const feedbackSchema = z.object({
  body: z.string().min(1).max(1000),
  routeId: z.uuid().optional(),
  rating: z.int().min(1).max(5).optional(),
});

/* ── Inferred Types ───────────────────────────────────────────────────── */

/**
 * TypeScript types inferred from each schema using z.infer<>.
 *
 * These types are the "single source of truth" — change the schema,
 * and the type updates automatically. No need to maintain separate
 * interface definitions that could drift out of sync.
 *
 * Usage example:
 *   const data: AscentLogInput = { routeId: '...', status: 'send', attempts: 3 };
 *   const result = ascentLogSchema.safeParse(data);
 *   // result.success === true, result.data is typed as AscentLogInput
 */
export type AscentLogInput = z.infer<typeof ascentLogSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RouteCreateInput = z.infer<typeof routeCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
// Infer from the BASE schema (pre-refine) for a clean TypeScript type
export type EventCreateInput = z.infer<typeof eventCreateBaseSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
