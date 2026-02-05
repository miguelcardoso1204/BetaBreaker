# Beta Breaker — TDD Development Plan

**Product:** Beta Breaker (iOS/Android)  
**Version:** 1.0 (MVP)  
**Methodology:** Test-Driven Development (Red → Green → Refactor)  
**Last updated:** 2026-02-05

---

## How to Use This Plan

Each task follows the TDD cycle:

1. **Red** — Write a failing test that defines the expected behavior.
2. **Green** — Write the minimum code to make the test pass.
3. **Refactor** — Clean up without changing behavior; re-run tests to confirm.

Tasks are grouped into **Phases** (sequential) and **Steps** within each phase (also sequential). Each step lists:

- **What to test** — the test cases to write first
- **What to implement** — the production code to satisfy the tests
- **Acceptance criteria** — how you know the step is done
- **Relevant requirements** — traceability back to the PRD
- **Depends on** — prerequisite steps that must be complete

> **Convention:** Utility/business-logic code is unit-tested with Jest. React Native components and hooks are tested with React Native Testing Library. Integration tests use Supabase local (via `supabase start`). E2E tests (later phases) use Maestro or Detox.

---

## Phase Overview

| # | Phase | Est. Effort | Depends On | Key Requirements |
|---|---|---|---|---|
| 0 | Project Scaffolding & CI | 2–3 days | — | NFR-7, NFR-14 |
| 1 | Data Foundation (Utilities) | 3–4 days | Phase 0 | FR-P1, FR-E4, FR-F2, FR-G1, FR-D1, FR-L1, FR-L3, FR-C7 |
| 2 | Database Schema & RLS | 5–7 days | Phase 0 | FR-A1, FR-B1, FR-C1, FR-D1, FR-L1, NFR-4, FR-F1, FR-G1–G5, FR-K1, FR-H1–H5, FR-J1–J2, FR-C4 |
| 3 | Authentication & Session Mgmt | 4–5 days | Phases 1, 2 | FR-A1, FR-A4, FR-L1 |
| 4 | Gym & Route Data Layer | 4–5 days | Phase 3 | FR-B1, FR-B4, FR-C1, FR-C3, FR-C7 |
| 5 | Tick-Logging & Sessions | 4–5 days | Phase 4 | FR-D1, FR-D2, FR-D4, FR-E5 |
| 6 | Offline Support | 3–4 days | Phase 5 | FR-D3, NFR-3, NFR-9 |
| 7 | QR/NFC Scanning | 2–3 days | Phases 4, 5 | FR-B3, FR-C5, FR-P3 |
| 8 | Gamification | 3–4 days | Phases 2, 5 | FR-F1, FR-F2, FR-F3, FR-F4, FR-A2 |
| 9 | Social & Leaderboards | 5–6 days | Phases 5, 8 | FR-G1–G5, FR-C6, FR-K2, FR-K3 |
| 10 | Notifications | 3–4 days | Phases 2, 9 | FR-J1, FR-J2, FR-J3 |
| 11 | Competitions & Events | 4–5 days | Phases 4, 9 | FR-H1–H5 |
| 12 | Media (Beta Videos) | 3–4 days | Phase 4 | FR-C2, FR-K1, NFR-11 |
| 13 | Monetization | 3–4 days | Phases 3, 8 | FR-L2, FR-L3, FR-L4, FR-L5 |
| 14 | Progression & Analytics | 3–4 days | Phases 5, 9 | FR-E1, FR-E2, FR-E3 |
| 15 | Admin Portal & Route Setting | 5–6 days | Phases 4, 7, 11 | FR-O1–O3, FR-I1–I4, FR-C5, FR-C7 |
| 16 | Profile & Settings | 2–3 days | Phases 8, 13 | FR-A2, FR-A3, FR-A5, FR-E4 |
| 17 | Onboarding | 1–2 days | Phases 3, 4 | FR-A5 |
| 18 | Polish, Accessibility & i18n | 3–4 days | All above | FR-Q1, FR-Q2, FR-Q3, NFR-8 |
| 19 | Error Tracking & Monitoring | 1–2 days | Phase 3 | NFR-10 |
| 20 | E2E Testing & Hardening | 4–5 days | All above | NFR-1, NFR-6, NFR-12, NFR-13 |
| 21 | Build & Deployment | 2–3 days | All above | NFR-2, NFR-7 |

**Total estimated effort:** ~70–90 working days (single developer)

---

## Phase 0 — Project Scaffolding & CI Foundation

> No TDD yet — this is the skeleton that enables everything else.

### Step 0.1 — Initialize Expo Project ✅

**Depends on:** Nothing
**Status:** Complete

- Ran `npx create-expo-app beta-breaker --template tabs` (Expo SDK 54, TypeScript default).
- Moved template files into repo root alongside existing `CLAUDE.md` and `Documentation/`.
- Updated `app.json`: name → "Beta Breaker", slug → "beta-breaker".
- Fixed template TS issue: removed unused `@ts-expect-error` in `ExternalLink.tsx`.
- Verified `npx tsc --noEmit` passes with no errors.
- Committed the scaffolded project.

**Template structure notes:** The tabs template includes `app/(tabs)/` with two tab screens, `components/` with shared UI, `constants/Colors.ts`, and `assets/`. Directories not yet created (will be added in later steps): `lib/`, `hooks/`, `stores/`, `services/`, `utils/`, `supabase/`.

### Step 0.2 — Install Core Dependencies ✅

**Depends on:** Step 0.1
**Status:** Complete

Installed all core dependencies via `npx expo install` for SDK 54 compatibility:

- **Backend:** `@supabase/supabase-js` ^2.95.1
- **Server state:** `@tanstack/react-query` ^5.90.20
- **Client state:** `zustand` ^5.0.11
- **Styling:** `nativewind` ^4.2.1, `tailwindcss` ^3.4.19
- **Forms:** `react-hook-form` ^7.71.1, `zod` ^4.3.6, `@hookform/resolvers` ^5.2.2
- **Expo native modules:** `expo-secure-store`, `expo-sqlite`, `expo-camera`, `expo-image`, `expo-video`, `expo-haptics`, `expo-notifications` (all SDK 54 pinned)
- **Navigation/animation:** `react-native-gesture-handler` ~2.28.0, `react-native-reanimated` ~4.1.1 (already from template)
- **Icons:** `lucide-react-native` ^0.563.0, `react-native-svg` 15.12.1 (peer dep)
- **Utilities:** `date-fns` ^4.1.0
- **Monitoring:** `@sentry/react-native` ~7.2.0

Config plugins auto-added to `app.json`: `expo-secure-store`, `expo-sqlite`, `expo-video`, `@sentry/react-native`. TypeScript compiles cleanly.

### Step 0.3 — Configure Testing Infrastructure ✅

**Depends on:** Step 0.2
**Status:** Complete

- Installed `jest-expo` ~54.0.17 (SDK 54 compatible), `@testing-library/react-native` ^13.3.3, `@types/jest` ^30.0.0 as dev dependencies.
- Skipped deprecated `@testing-library/jest-native` — built-in matchers in RNTL v13+ replace it (loaded via `setupFilesAfterEnv`).
- Created `jest.config.js` extending `jest-expo` preset with `@/*` path alias support and RNTL built-in matchers.
- Added `npm test`, `npm run test:watch`, and `npm run test:coverage` scripts to `package.json`.
- Created `utils/__tests__/sanity.test.ts` with 3 passing assertions.
- Removed template's broken `StyledText-test.js` (React 19 incompatible with `react-test-renderer`).
- `npm test` passes cleanly (3 tests, 0 warnings).

### Step 0.4 — Configure NativeWind (Tailwind) ✅

**Depends on:** Step 0.2
**Status:** Complete

- Created `global.css` with Tailwind directives (`@tailwind base/components/utilities`).
- Created `tailwind.config.js` with content paths (`app/**`, `components/**`) and `nativewind/preset`.
- Created `babel.config.js` with `babel-preset-expo` and `nativewind/babel` presets.
- Created `metro.config.js` wrapping Expo's default config with `withNativeWind()` pointing at `global.css`.
- Imported `global.css` in root layout (`app/_layout.tsx`).
- Added `nativewind-env.d.ts` to `.gitignore` (auto-generated by NativeWind).
- Added `nativewind-env.d.ts` to `tsconfig.json` includes for className type support.
- Verified: `npx tsc --noEmit` passes, `npm test` passes (3 tests green).

### Step 0.5 — Set Up Supabase Local Dev ✅

**Depends on:** Step 0.1
**Status:** Complete

- Installed `supabase` CLI v2.75.5 as a dev dependency (global npm install not supported).
- Ran `npx supabase init` — created `supabase/config.toml` (project_id: "BetaBreaker") and `supabase/.gitignore`.
- Created `supabase/seed.sql` placeholder (referenced by config, populated in Phase 2).
- Added `.supabase/` to root `.gitignore` (Docker runtime state, must not be committed).
- Ran `npx supabase start` — pulled all Docker images, started local Postgres, Auth, Storage, Realtime, Studio.
- Created `.env.local` (gitignored) with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from local credentials.
- Created `lib/supabase.ts`: typed `createClient<Database>()` with `ExpoSecureStoreAdapter` for native token storage, `localStorage` fallback on web, PKCE auth flow, teaching comments throughout.
- Generated `lib/types/database.types.ts` via `npx supabase gen types typescript --local` — placeholder types (no tables yet, Phase 2 creates them).
- Verified: `npx tsc --noEmit` passes, `npm test` passes (3 tests, 0 regressions).

### Step 0.6 — Set Up Directory Structure ✅

**Depends on:** Step 0.1
**Status:** Complete

- Created top-level directories: `hooks/`, `stores/`, `services/`.
- Created component subdirectories: `components/ui/`, `components/routes/`, `components/session/`, `components/social/`.
- Created Supabase subdirectories: `supabase/migrations/`, `supabase/functions/` (with `.gitkeep`).
- Moved template UI primitives (`Themed.tsx`, `StyledText.tsx`, `ExternalLink.tsx`, `EditScreenInfo.tsx`) to `components/ui/`. Kept platform-specific hooks (`useColorScheme`, `useClientOnlyValue`) in `components/`.
- Updated all import paths in `app/` screens to reference new `components/ui/` locations.
- Created `lib/queryClient.ts`: TanStack Query `QueryClient` with `staleTime` (5 min), `gcTime` (30 min), `retry` (2) — teaching comments explain each default.
- Created `lib/constants.ts`: placeholder for domain constants (grades, roles, scoring) — populated in Phase 1.
- Created barrel `index.ts` files with teaching comments in `hooks/`, `stores/`, `services/`.
- Verified: `npx tsc --noEmit` passes, `npm test` passes (3 tests, 0 regressions).

### Step 0.7 — CI Pipeline (GitHub Actions) ✅

**Depends on:** Steps 0.3, 0.5

- Create `.github/workflows/ci.yml`:
  - On PR: `npm run lint`, `npx tsc --noEmit`, `npm test`.
- Verify pipeline passes on a test PR.

**Implementation notes:**
- Upgraded Node.js from v20.20.0 to v24.13.0 (Active LTS, EOL April 2028); regenerated `package-lock.json` with npm 11.
- Installed `eslint` 9.x and `eslint-config-expo` 10.x; created `eslint.config.js` using ESLint 9+ flat config format with Expo's official shareable config.
- Added `"lint": "eslint ."` script to `package.json`.
- Fixed two `react/no-unescaped-entities` lint errors in `app/+not-found.tsx` and `components/ui/EditScreenInfo.tsx`.
- Created `.nvmrc` (pins Node 24.13.0) for local dev and CI consistency.
- Created `.github/workflows/ci.yml`: triggers on PR and push to main, runs lint → type-check → test in a single job with npm caching and concurrency cancellation.
- Verified: `npm run lint` clean, `npx tsc --noEmit` passes, `npm test -- --ci` passes (3 tests, 0 regressions).

**Phase 0 Acceptance:** Project boots on iOS Simulator / Android Emulator, `npm test` passes, Supabase local runs, CI is green.

---

## Phase 1 — Data Foundation (Utilities & Grade System)

> Pure TypeScript logic — no UI, no network. Perfect for TDD.

### Step 1.1 — Grade Conversion System ✅

**Status:** Complete
**Depends on:** Phase 0 (Step 0.3 for test infra)
**Relevant requirements:** FR-P1, FR-E4

**Implementation notes:**
- `utils/grades.ts`: GRADE_TABLE (31 entries, canonical 0–30), canonicalToDisplay, displayToCanonical (lazy reverse maps), compareGrades, getGradeRange
- `utils/__tests__/grades.test.ts`: 25 tests across 6 describe blocks — 100% coverage
- Unique grade counts: V-scale 13, Font 25, YDS 27 (plan estimated 24 for YDS; actual count is 27 due to the table having more unique YDS sub-grades than initially projected)
- displayToCanonical returns first canonical index for shared display strings (round-trip collapse by design)

**What to test (`utils/__tests__/grades.test.ts`):**

| Test case | Input | Expected output |
|---|---|---|
| Canonical → V-scale | `canonicalToDisplay(10, 'v-scale')` | `"V4"` |
| Canonical → Font | `canonicalToDisplay(10, 'font')` | `"6a+"` |
| Canonical → YDS | `canonicalToDisplay(10, 'yds')` | `"5.10b"` |
| Display → canonical | `displayToCanonical("V4", 'v-scale')` | `10` |
| Round-trip consistency | Convert to display and back | Same canonical value |
| Invalid grade string | `displayToCanonical("VX", 'v-scale')` | `null` or throws |
| Boundary: min grade | `canonicalToDisplay(0, 'v-scale')` | `"V0"` |
| Boundary: max grade | `canonicalToDisplay(30, 'v-scale')` | Valid top-end grade |
| All canonical values mapped | Loop 0–30 for each system | No undefined returns |
| Grade comparison | `compareGrades(5, 10)` | Negative number (5 < 10) |
| Grade range | `getGradeRange('v-scale')` | Array of all V-scale labels |

**What to implement (`utils/grades.ts`):**

- `GRADE_TABLE`: lookup array mapping `canonical_grade` integer → `{ v: string, font: string, yds: string }`.
- `canonicalToDisplay(canonical: number, system: GradeSystem): string`
- `displayToCanonical(display: string, system: GradeSystem): number | null`
- `compareGrades(a: number, b: number): number`
- `getGradeRange(system: GradeSystem): string[]`
- `GradeSystem` type: `'v-scale' | 'font' | 'yds'`

**Acceptance:** All grade conversion tests green. No network, no DB.

---

### Step 1.2 — Streak Calculation Logic ✅

**Status:** Complete
**Depends on:** Step 0.3
**Relevant requirements:** FR-F2

**Implementation notes:**
- `utils/streaks.ts`: computeWeeklyStreak (public), groupByWeek (exported @internal), analyzeStreak (internal generic helper), deduplicateAndSort (internal)
- `utils/__tests__/streaks.test.ts`: 22 tests across 8 describe blocks — 97.82% statement, 90.9% branch, 100% function/line coverage
- Uses date-fns v4 `startOfISOWeek` and `differenceInCalendarISOWeeks` for year-boundary-safe week math
- Recovery mechanic: gap of 2 (1 missed week) freezes the streak (continues growing); gap of 3+ breaks it entirely. `decayedFrom` records the freeze point for UI hints
- `computeMonthlyStreak` deferred — analyzeStreak is generic and accepts a periodDiff callback, so monthly support can be added by passing `differenceInCalendarMonths` + `startOfMonth`
- Optional `referenceDate` parameter enables deterministic testing without fake timers
- All dates constructed with `new Date(year, monthIndex, day)` to avoid UTC parsing issues

**What to test (`utils/__tests__/streaks.test.ts`):**

| Test case | Description |
|---|---|
| No sessions | Returns `{ current: 0, longest: 0, status: 'none' }` |
| Single session today | `current: 1`, status `'active'` |
| Consecutive weeks (Mon, Mon, Mon) | Weekly streak = 3 |
| Gap of 2 weeks | Streak resets to 0 or 1 depending on recovery rules |
| Recovery mechanic | If user resumes within grace period (1 week), streak reduced but not reset |
| Monthly streak: 3 consecutive months | `monthlyStreak: 3` |
| Sessions on same day count once | No double-counting |
| Edge: session at midnight boundary | Belongs to correct week |
| Decay: no session for N periods | Streak decays per decay rules |

**What to implement (`utils/streaks.ts`):**

- `computeWeeklyStreak(sessionDates: Date[]): StreakResult`
- `computeMonthlyStreak(sessionDates: Date[]): StreakResult`
- `StreakResult`: `{ current: number, longest: number, status: 'active' | 'at_risk' | 'broken' | 'none', decayedFrom?: number }`
- Internal: `groupByWeek()`, `groupByMonth()`, `findConsecutiveRuns()`.
- Recovery logic: if gap = 1 period, reduce streak by 1 instead of resetting.

**Acceptance:** All streak tests green.

---

### Step 1.3 — Leaderboard Scoring Logic ✅

**Depends on:** Step 0.3
**Relevant requirements:** FR-G1
**Status:** Complete

**What to test (`utils/__tests__/scoring.test.ts`):**

| Test case | Description |
|---|---|
| Score by hardest grade | User with V7 send ranks above V6 send |
| Score by flash rate | Flash rate = flashes / total sends |
| Score by volume | Total sends in period |
| Tie-breaking | Same grade → earlier send date wins |
| Empty leaderboard | Returns empty array |
| Single user | Returns that user at rank 1 |
| Multiple scoring models | `computeScore(ascents, 'hardest_grade')` vs `'flash_rate'` vs `'volume'` |
| Period filtering | Only ascents within date range count |
| Rank assignment | Correctly assigns 1, 2, 3… with ties sharing rank |

**What to implement (`utils/scoring.ts`):**

- `computeScore(ascents: Ascent[], model: ScoringModel): number`
- `rankLeaderboard(entries: LeaderboardEntry[]): RankedEntry[]`
- `filterByPeriod(ascents: Ascent[], start: Date, end: Date): Ascent[]`
- `ScoringModel`: `'hardest_grade' | 'flash_rate' | 'volume'`
- Tie-breaking comparator.

**Acceptance:** All scoring tests green.

**Implementation notes:**
- 22 tests across 6 describe blocks: `computeScore` (11), `filterByPeriod` (4), `rankLeaderboard` (5), `getSuccessfulAscents` (1), integration (1).
- Ascent status uses three-way enum (`'flash' | 'send' | 'attempt'`) — attempts excluded from all scoring models.
- Flash rate stored as decimal (0.0–1.0), not percentage. UI layer formats for display.
- Ranking uses standard competition ranking (1224 system): ties share rank, next rank skips.
- Tiebreaker is optional on `LeaderboardEntry` — lower value wins (e.g., earlier timestamp).
- `getSuccessfulAscents()` exported as `@internal` helper for testability.
- No dependency on `grades.ts` — grades are opaque integers for scoring.
- 100% code coverage (statements, branches, functions, lines).

---

### Step 1.4 — Zod Validation Schemas ✅

**Status:** Complete
**Depends on:** Step 0.3
**Relevant requirements:** FR-D1, FR-A1, FR-C1

**Implementation notes:**
- `utils/validation.ts`: 7 Zod schemas (ascentLogSchema, registrationSchema, loginSchema, routeCreateSchema, profileUpdateSchema, eventCreateSchema, feedbackSchema) + 7 inferred TypeScript types
- `utils/__tests__/validation.test.ts`: 52 tests across 8 describe blocks — 100% coverage (stmts, branches, functions, lines)
- Uses Zod v4 top-level constructors: z.uuid(), z.email(), z.url(), z.int(), z.iso.datetime()
- Enum values defined as local `as const` arrays to avoid cross-module imports
- profileUpdateSchema uses .partial() for PATCH semantics (all fields optional)
- eventCreateSchema uses .refine() for cross-field date ordering validation; type inferred from base (pre-refine) schema
- loginSchema uses min(1) for password (not min(8)) — strength rules only at registration

**What to test (`utils/__tests__/validation.test.ts`):**

| Test case | Description |
|---|---|
| Valid ascent log | `{ routeId, status: 'send', attempts: 3 }` passes |
| Invalid status | `status: 'banana'` → validation error |
| Missing required field | `routeId` omitted → error |
| Attempts must be ≥ 1 | `attempts: 0` → error |
| Valid registration | Email, password (≥8 chars) passes |
| Invalid email | `"notanemail"` → error |
| Route creation schema | Grade, gym_id, setter_id required; color optional |
| Notes field max length | > 500 chars → error |
| Event creation schema | name, scoring_model, gym_id required; dates validated |
| Feedback schema | body required, max 1000 chars |

**What to implement (`utils/validation.ts`):**

- `ascentLogSchema` (Zod)
- `registrationSchema`
- `loginSchema`
- `routeCreateSchema`
- `profileUpdateSchema`
- `eventCreateSchema`
- `feedbackSchema`
- Export inferred TypeScript types from each schema.

**Acceptance:** All validation tests green.

---

### Step 1.5 — Constants & Type Definitions

**Depends on:** Step 0.3  
**Relevant requirements:** FR-L1, FR-L3, FR-C7

**What to test (`lib/__tests__/constants.test.ts`):**

| Test case | Description |
|---|---|
| All roles defined | `ROLES` contains Climber, Setter, Judge, GymAdmin, SuperAdmin |
| Free tier limits | `FREE_TIER.maxBadges === 1`, `FREE_TIER.betaPerWeek === 5` |
| Pro tier limits | `PRO_TIER.maxBadges === 3`, unlimited beta |
| Route statuses | `ROUTE_STATUS` contains Active, RetiringSoon, Archived |
| Grade systems list | Contains v-scale, font, yds |
| Scoring models list | Contains hardest_grade, flash_rate, volume |
| Notification categories | Contains friends, routes, comps, achievements |
| Save types | Contains project, wishlist, favorite |

**What to implement (`lib/constants.ts`, `lib/types/`):**

- `ROLES`, `TIERS`, `ROUTE_STATUS`, `GRADE_SYSTEMS`, `SCORING_MODELS`, `NOTIFICATION_CATEGORIES`, `SAVE_TYPES` as const objects.
- TypeScript types/enums derived from constants.
- `UserRole`, `Tier`, `RouteStatus`, `AscentStatus`, `ScoringModel`, `SaveType` types.

**Acceptance:** Constants tests green, types compile with `tsc --noEmit`.

---

## Phase 2 — Database Schema & RLS Policies

> Tests run against Supabase local. Use `pgTAP` or a custom test harness that connects to local Postgres.

### Step 2.1 — Core Tables Migration

**Depends on:** Phase 0 (Step 0.5 for Supabase local)  
**Relevant requirements:** FR-A1, FR-B1, FR-C1, FR-D1, FR-L1

**What to test (SQL / integration test):**

| Test case | Description |
|---|---|
| Tables exist | `profiles`, `gyms`, `routes`, `route_ascents`, `style_tags`, `user_gym_roles` all exist after migration |
| Required columns | `routes` has `id`, `gym_id`, `canonical_grade`, `setter_id`, `status`, `created_at` |
| Foreign keys | `route_ascents.route_id` references `routes.id`; cascade delete works |
| Enum/check constraints | `route_ascents.status` only accepts `flash`, `send`, `attempt` |
| Default values | `routes.status` defaults to `active`; `created_at` defaults to `now()` |
| UUID generation | `routes.id` auto-generates UUID |

**What to implement (`supabase/migrations/00001_core_tables.sql`):**

- `profiles`: id (FK to auth.users), display_name, avatar_url, home_gym_id, preferred_grade_system, tier, onboarding_completed, created_at
- `gyms`: id, name, address, latitude, longitude, social_links (JSONB), default_grade_system, created_at
- `routes`: id, gym_id (FK), canonical_grade, color, wall_section, setter_id (FK to profiles), status (enum: active/retiring_soon/archived), name, created_at, retired_at
- `style_tags`: id, name (unique), category
- `route_style_tags`: route_id, tag_id, vote_count (denormalized)
- `route_ascents`: id, user_id (FK), route_id (FK), status (flash/send/attempt), attempts, notes, perceived_grade, created_at
- `user_gym_roles`: user_id, gym_id, role (enum: climber/setter/judge/gym_admin/super_admin)

Run `supabase db push`, then run test suite against local DB.

**Acceptance:** Migration applies cleanly; all table-structure tests pass.

---

### Step 2.2 — Row Level Security Policies

**Depends on:** Step 2.1  
**Relevant requirements:** NFR-4, FR-L1

**What to test (integration tests with multiple Supabase auth users):**

| Test case | Description |
|---|---|
| Anon cannot read routes | Unauthenticated request to `routes` returns 0 rows or 401 |
| Authenticated user reads routes | Logged-in user sees active routes for their gym |
| User can only insert own ascents | User A cannot insert ascent with `user_id = UserB` |
| User can update own profile | Update succeeds for own row |
| User cannot update other profiles | Update for different `user_id` is rejected |
| Gym admin can update routes | User with `gym_admin` role for gym X can update routes in gym X |
| Gym admin cannot update other gym's routes | Rejected |
| Setter can create routes | User with `setter` role can insert into `routes` for their gym |
| Climber cannot create routes | Insert rejected |
| Cascade: user deletes account | All ascents, roles, saved routes removed |

**What to implement (`supabase/migrations/00002_rls_policies.sql`):**

- Enable RLS on every table.
- `profiles`: SELECT for authenticated; UPDATE/DELETE where `id = auth.uid()`.
- `routes`: SELECT for authenticated (status = 'active' or user is gym admin); INSERT/UPDATE for setter+ role.
- `route_ascents`: SELECT own + public reads; INSERT/UPDATE/DELETE where `user_id = auth.uid()`.
- `user_gym_roles`: SELECT own; INSERT/UPDATE/DELETE for gym_admin+.
- Helper function: `get_user_role(gym_id uuid)` returns role from `user_gym_roles`.

**Acceptance:** All RLS tests pass with correctly scoped data access.

---

### Step 2.3 — Database Functions & Triggers

**Depends on:** Step 2.1  
**Relevant requirements:** FR-F1, FR-F2, FR-G1

**What to test:**

| Test case | Description |
|---|---|
| New auth user → profile created | Insert into `auth.users` triggers `handle_new_user()` creating a `profiles` row |
| Ascent insert → streak updated | After inserting an ascent, user's streak metadata is recalculated |
| Ascent insert → badge check | Inserting first V5 send awards "First V5" badge |
| Ascent delete → leaderboard adjusted | Deleting an ascent updates leaderboard |
| Grade consensus | After 5+ perceived_grade submissions, route's `consensus_grade` is updated |

**What to implement (`supabase/migrations/00003_functions_triggers.sql`):**

- `handle_new_user()` trigger on `auth.users` AFTER INSERT.
- `on_ascent_insert()` trigger: calls streak logic, badge check, leaderboard refresh.
- `on_ascent_delete()` trigger: recompute streak, adjust leaderboard.
- `check_grade_consensus(route_id)`: computes median perceived grade.
- `compute_leaderboard(gym_id, period)`: refreshes materialized view.
- Badges table + `user_badges` join table.

**Acceptance:** Trigger tests pass end-to-end in local Supabase.

---

### Step 2.4 — Gamification Tables (Badges, Streaks, Leaderboards)

**Depends on:** Step 2.3  
**Relevant requirements:** FR-F1, FR-F2, FR-G1

**What to test:**

| Test case | Description |
|---|---|
| Badges table seeded | Default badge definitions exist (e.g., "First V0", "10 Sends", "Weekly Warrior") |
| User badge awarded | `user_badges` row created with timestamp |
| No duplicate badges | Awarding same badge twice is idempotent |
| Leaderboard entries | Materialized view contains correct rankings |
| Streak table | User streak record tracks current, longest, last_active_date |

**What to implement (`supabase/migrations/00004_gamification.sql`):**

- `badges`: id, name, description, icon_key, criteria_type, criteria_value
- `user_badges`: user_id, badge_id, awarded_at (unique constraint on user+badge)
- `user_streaks`: user_id, streak_type (weekly/monthly), current, longest, last_active_date
- `leaderboard_entries`: materialized view or table with gym_id, user_id, period, score, rank
- Seed script for default badges.

**Acceptance:** Gamification tables exist with correct constraints; seed data loads.

---

### Step 2.5 — Social & Community Tables

**Depends on:** Step 2.1  
**Relevant requirements:** FR-G2, FR-G3, FR-G5, FR-K1

**What to test:**

| Test case | Description |
|---|---|
| Beta tip insert | User can insert a beta tip for a route |
| Video media row | Inserting into `route_media` with type='video' succeeds |
| Report insert | User can report content; report has status='pending' |
| Follow relationship | User A follows User B; query returns B in A's following list |
| Unfollow | Deleting follow removes it |
| No self-follow | Constraint prevents user following themselves |

**What to implement (`supabase/migrations/00005_social.sql`):**

- `route_feedback`: id, route_id, user_id, body (text), score (vote tally), created_at
- `route_feedback_votes`: feedback_id, user_id, vote (up/down), unique constraint on feedback+user
- `route_media`: id, route_id, user_id, url, type (video/image), ownership_affirmed, created_at
- `content_reports`: id, reporter_id, target_type (video/feedback/user), target_id, reason, status (pending/reviewed/dismissed), reviewed_by, reviewed_at, created_at
- `follows`: follower_id, following_id, created_at (unique constraint, check follower ≠ following)
- RLS: own inserts/deletes for follows; own inserts for feedback; authenticated reads.

**Acceptance:** Social tables exist; RLS tests pass.

---

### Step 2.6 — Competitions & Events Tables

**Depends on:** Step 2.1  
**Relevant requirements:** FR-H1–H5

**What to test:**

| Test case | Description |
|---|---|
| Event creation | Gym admin can insert an event for their gym |
| Score entry | Judge/athlete can insert a score for the event |
| Duplicate score prevention | Same athlete + route + event = update, not duplicate |
| Event has scoring model | `scoring_model` column accepts valid enum values |
| Eligible routes linked | `event_routes` junction table links event to routes |
| Categories created | Age/gender categories linked to event |

**What to implement (`supabase/migrations/00006_competitions.sql`):**

- `events`: id, gym_id, name, scoring_model, start_date, end_date, status, created_by
- `event_routes`: event_id, route_id
- `event_categories`: event_id, name (e.g., "Men Open", "Women U18")
- `competition_scores`: id, event_id, user_id, route_id, category_id, score, verified_by, created_at
- RLS: gym_admin creates events; judge/verified writes scores; authenticated reads.

**Acceptance:** Competition tables exist; insertion and RLS tests pass.

---

### Step 2.7 — Notifications & Saved Routes Tables

**Depends on:** Step 2.1  
**Relevant requirements:** FR-J1, FR-J2, FR-C4

**What to test:**

| Test case | Description |
|---|---|
| Notification insert | System can insert a notification for a user |
| Read/unread toggle | User can mark notification as read |
| User only sees own notifications | RLS blocks cross-user reads |
| Saved route insert | User can save a route as 'project', 'wishlist', or 'favorite' |
| No duplicate saves | Same user + route + save_type = unique constraint |
| Notification preferences | User's per-category preferences stored and queryable |

**What to implement (`supabase/migrations/00007_notifications_saved.sql`):**

- `notifications`: id, user_id, type, title, body, data (JSONB), read, created_at
- `push_tokens`: user_id, token, platform (ios/android), created_at
- `notification_preferences`: user_id, category, enabled (default true), unique on user+category
- `saved_routes`: user_id, route_id, save_type (project/wishlist/favorite), created_at
- RLS: user reads/updates own notifications; user manages own saved routes and preferences.

**Acceptance:** Tables exist, RLS correct, constraint tests pass.

---

### Step 2.8 — Admin & Audit Tables

**Depends on:** Step 2.1  
**Relevant requirements:** FR-O3, FR-I3, FR-I4

**What to test:**

| Test case | Description |
|---|---|
| Audit log insert | System can insert an audit entry on route grade change |
| Audit log has actor | `actor_id` references the user who made the change |
| Maintenance ticket insert | Setter/climber can report broken hold on route |
| Ticket lifecycle | Status transitions: open → in_progress → resolved |
| Season record | Season with start/end dates and linked gym |

**What to implement (`supabase/migrations/00008_admin_audit.sql`):**

- `audit_log`: id, actor_id, action (enum: grade_change/tag_change/status_change/media_removed), target_type, target_id, old_value (JSONB), new_value (JSONB), created_at
- `maintenance_tickets`: id, route_id, reporter_id, description, status (open/in_progress/resolved), resolved_by, created_at, resolved_at
- `seasons`: id, gym_id, name, start_date, end_date, status (active/closed)
- Triggers: auto-insert audit log row on route grade/status/tag changes.
- RLS: authenticated reads on audit_log for gym_admin; own inserts for tickets.

**Acceptance:** Admin tables exist; audit trigger fires on route changes.

---

### Step 2.9 — Seed Data Script

**Depends on:** Steps 2.1–2.8  
**Relevant requirements:** Development workflow

**What to test:**

| Test case | Description |
|---|---|
| Seed runs without error | `supabase db reset` applies migrations + seed |
| Seed creates test gym | At least 1 gym exists |
| Seed creates test routes | At least 10 routes across different grades |
| Seed creates test users | At least 3 users with different roles |
| Seed creates badges | Default badge definitions loaded |
| Seed creates tags | Style tags (slab, overhang, dyno, crimp, etc.) loaded |

**What to implement (`supabase/seed.sql`):**

- Insert 1 gym with realistic data.
- Insert 15–20 routes (spread V0–V10).
- Insert 3 users: climber, setter, gym_admin.
- Insert sample ascents, badges, a leaderboard entry.
- Insert sample style tags.
- Insert sample season.

**Acceptance:** `supabase db reset` runs cleanly; seed verification tests pass.

---

## Phase 3 — Authentication & Session Management

### Step 3.1 — Supabase Client Initialization

**Depends on:** Phase 0 (Step 0.5)  
**Relevant requirements:** NFR-4

**What to test (`lib/__tests__/supabase.test.ts`):**

| Test case | Description |
|---|---|
| Client is initialized | `supabase` export is a valid SupabaseClient instance |
| Uses secure storage | Auth persistence uses `expo-secure-store` adapter |
| Client reads env vars | URL and anon key come from config, not hardcoded |

**What to implement (`lib/supabase.ts`):**

- Create Supabase client with `createClient()`.
- Custom `storage` adapter using `expo-secure-store` for token persistence.
- Export typed client using generated `database.types.ts`.

**Acceptance:** Client initializes; tokens persist across app restarts (manual verification).

---

### Step 3.2 — Auth Service Layer

**Depends on:** Step 3.1  
**Relevant requirements:** FR-A1, FR-A4

**What to test (`services/__tests__/auth.service.test.ts`):**

| Test case | Description |
|---|---|
| signUp success | Creates user, returns session |
| signUp with existing email | Returns appropriate error |
| signIn with correct credentials | Returns session with JWT |
| signIn with wrong password | Returns error, no session |
| signOut | Clears session |
| resetPassword | Sends reset email (mock) |
| getSession | Returns current session or null |
| onAuthStateChange | Callback fires on sign-in/sign-out |
| Google OAuth initiation | Calls `signInWithOAuth` with correct provider |
| Apple OAuth initiation | Calls `signInWithOAuth` with correct provider |

**What to implement (`services/auth.service.ts`):**

- `signUp(email, password)`: wraps `supabase.auth.signUp()`
- `signIn(email, password)`: wraps `supabase.auth.signInWithPassword()`
- `signInWithProvider(provider: 'google' | 'apple')`: wraps `signInWithOAuth()`
- `signOut()`: wraps `supabase.auth.signOut()`
- `resetPassword(email)`: wraps `supabase.auth.resetPasswordForEmail()`
- `getSession()`: wraps `supabase.auth.getSession()`
- `onAuthStateChange(callback)`: wraps `supabase.auth.onAuthStateChange()`

**Acceptance:** All auth service tests pass (using Supabase local or mocked client).

---

### Step 3.3 — useAuth Hook

**Depends on:** Step 3.2  
**Relevant requirements:** FR-A1

**What to test (`hooks/__tests__/useAuth.test.ts`):**

| Test case | Description |
|---|---|
| Initial state: loading | `isLoading` is true before session resolved |
| No session → unauthenticated | `user` is null, `isAuthenticated` is false |
| Valid session → authenticated | `user` is populated, `isAuthenticated` is true |
| signIn action | Calling `signIn()` updates state to authenticated |
| signOut action | Calling `signOut()` clears user, sets unauthenticated |
| Role derivation | `role` is derived from `profiles` or `user_gym_roles` |

**What to implement (`hooks/useAuth.ts`):**

- React hook that wraps auth service.
- Exposes: `user`, `session`, `isLoading`, `isAuthenticated`, `role`, `signIn()`, `signUp()`, `signOut()`.
- Listens to `onAuthStateChange` for reactive updates.
- Fetches user profile + role on session change.

**Acceptance:** Hook tests pass with mocked Supabase client.

---

### Step 3.4 — Auth Screens (Login, Register, Forgot Password)

**Depends on:** Step 3.3  
**Relevant requirements:** FR-A1, FR-A4

**What to test (component tests):**

| Test case | Description |
|---|---|
| Login form renders | Email input, password input, submit button visible |
| Submit with empty fields | Shows validation errors |
| Submit with invalid email | Shows email validation error |
| Successful login | Calls `signIn`, navigates to home |
| Failed login | Shows error message from service |
| Register form renders | Email, password, confirm password fields |
| Password mismatch | Shows error |
| Forgot password renders | Email input + submit |
| Social sign-in buttons | Google and Apple buttons visible, trigger OAuth |

**What to implement:**

- `app/(auth)/login.tsx`: form with React Hook Form + Zod, calls `useAuth().signIn`
- `app/(auth)/register.tsx`: form with password confirmation
- `app/(auth)/forgot-password.tsx`: email-only form
- `app/(auth)/_layout.tsx`: stack navigator for auth flow

**Acceptance:** Auth screens render correctly; form validation works; navigation flows complete.

---

### Step 3.5 — Root Layout & Auth Gate

**Depends on:** Step 3.4  
**Relevant requirements:** FR-A1

**What to test:**

| Test case | Description |
|---|---|
| No session → auth screens | Root layout redirects to `(auth)/login` |
| Valid session → tabs | Root layout renders `(tabs)` |
| Session expires → redirect | On auth state change to null, redirects to login |

**What to implement (`app/_layout.tsx`):**

- Wrap app in providers: `QueryClientProvider`, Supabase auth listener.
- Auth gate: if `isLoading` → splash; if `!isAuthenticated` → redirect to `(auth)`; else render `(tabs)`.
- Expo Router `<Slot />` or `<Stack />` at root.

**Acceptance:** Navigation correctly gates authenticated vs unauthenticated users.

---

## Phase 4 — Gym & Route Data Layer

### Step 4.1 — Routes Service

**Depends on:** Phase 3 (Step 3.1 for Supabase client), Phase 2 (tables)  
**Relevant requirements:** FR-C1, FR-C3, FR-C7

**What to test (`services/__tests__/routes.service.test.ts`):**

| Test case | Description |
|---|---|
| Fetch routes by gym | Returns routes for a given `gym_id` |
| Filter by grade range | Only routes within canonical_grade range returned |
| Filter by status | `active` only by default; include `retiring_soon` if requested |
| Filter by tags | Routes matching specified style tag IDs |
| Sort by recency | Newest first by default |
| Sort by popularity | Most ascents first |
| Filter sent/unsent | For a given user, filter routes they've sent or haven't |
| Single route detail | Fetch route with setter info, tags, media, ascent count |
| Search by name/color | Text search on route name or color |

**What to implement (`services/routes.service.ts`):**

- `getRoutes(filters: RouteFilters): Promise<Route[]>` — builds Supabase query with chained `.eq()`, `.gte()`, `.order()`, etc.
- `getRouteById(id: string): Promise<RouteDetail>` — single route with joins.
- `RouteFilters` type: `{ gymId, gradeMin?, gradeMax?, status?, tagIds?, sortBy?, sentByUser?, search? }`

**Acceptance:** Service tests pass against Supabase local with seed data.

---

### Step 4.2 — useRoutes Hook

**Depends on:** Step 4.1  
**Relevant requirements:** FR-C3

**What to test (`hooks/__tests__/useRoutes.test.ts`):**

| Test case | Description |
|---|---|
| Returns cached routes | After initial fetch, subsequent calls use cache |
| Refetches on filter change | Changing filters triggers new query |
| Loading state | `isLoading` true during fetch |
| Error state | Network failure sets `error` |
| Route detail query | `useRouteDetail(id)` fetches single route |

**What to implement (`hooks/useRoutes.ts`):**

- `useRoutes(filters)` — wraps `useQuery` with `routes.service.getRoutes`.
- `useRouteDetail(id)` — wraps `useQuery` for single route.
- Query keys include filters for correct cache invalidation.

**Acceptance:** Hook tests pass with mocked service.

---

### Step 4.3 — Gym Service & Hook

**Depends on:** Phase 3 (Step 3.1), Phase 2 (tables)  
**Relevant requirements:** FR-B1, FR-B4

**What to test:**

| Test case | Description |
|---|---|
| Fetch all gyms | Returns gym list |
| Fetch gym by ID | Returns single gym with details |
| Set home gym | Updates user profile's `home_gym_id` |
| Home gym prioritization | Hook exposes `homeGym` for UI prioritization |

**What to implement:**

- `services/gyms.service.ts`: `getGyms()`, `getGymById(id)`, `setHomeGym(gymId)`
- `hooks/useGyms.ts`: `useGyms()`, `useGym(id)`, `useHomeGym()`

**Acceptance:** Gym service and hook tests pass.

---

### Step 4.4 — Route Card Component

**Depends on:** Steps 4.2, 1.1 (grade conversion)  
**Relevant requirements:** FR-C1, FR-C7

**What to test (`components/__tests__/RouteCard.test.tsx`):**

| Test case | Description |
|---|---|
| Renders route name | Route name/identifier visible |
| Renders grade | Grade displayed in user's preferred system |
| Status indicator | Active = green, Retiring Soon = amber, Archived = gray |
| Color indicator | Route color shown as visual swatch |
| Tag chips | Style tags rendered as chips |
| Tap navigates | `onPress` calls router.push to route detail |
| Sent indicator | If user has sent, show checkmark |

**What to implement (`components/routes/RouteCard.tsx`):**

- Card component with grade badge, color swatch, status dot, tag chips.
- Accepts `route`, `userGradeSystem`, `isSent` as props.
- Uses `canonicalToDisplay()` for grade rendering.

**Acceptance:** Component tests pass; visual snapshot looks correct.

---

### Step 4.5 — Route List Screen (Home Tab)

**Depends on:** Steps 4.2, 4.4  
**Relevant requirements:** FR-C3

**What to test:**

| Test case | Description |
|---|---|
| Shows loading state | Skeleton/spinner while fetching |
| Renders route list | FlatList of RouteCard components |
| Filter bar | Grade, style, and sort dropdowns visible |
| Empty state | "No routes found" when filters return nothing |
| Pull to refresh | Triggers refetch |
| Navigates to detail | Tapping card goes to `[routeId]` screen |

**What to implement (`app/(tabs)/home/index.tsx`):**

- `FlatList` with `useRoutes()` hook.
- Filter bar component (grade range, tags, sort).
- Zustand `uiStore` for persisting active filters.
- Pull-to-refresh wired to `refetch()`.

**Acceptance:** Home screen renders routes from Supabase local; filters work.

---

### Step 4.6 — Route Detail Screen

**Depends on:** Steps 4.2, 4.4  
**Relevant requirements:** FR-C1, FR-C2, FR-C4, FR-C7, FR-G2

**What to test:**

| Test case | Description |
|---|---|
| Renders route info | Grade, color, wall section, setter, status |
| Grade conversion display | Shows grade in user's preferred system |
| Beta videos section | Lists attached videos (or "No beta yet") |
| Save button | Tapping save opens save-type picker (Project/Wishlist/Favorite) |
| Log button | "Log Ascent" button opens QuickLogSheet |
| Feedback section | Shows beta tips list |
| Status banner | Retiring Soon routes show warning banner |

**What to implement (`app/(tabs)/home/[routeId].tsx`):**

- Fetch route detail via `useRouteDetail(routeId)`.
- Sections: header (grade/color/status), beta videos, feedback, log CTA.
- "Save" action → `saved_routes` insert.
- "Log" action → opens bottom sheet (built in Phase 5).

**Acceptance:** Route detail screen renders fully with seeded data.

---

## Phase 5 — Tick-Logging & Sessions

### Step 5.1 — Session Store (Zustand)

**Depends on:** Phase 0  
**Relevant requirements:** FR-D4

**What to test (`stores/__tests__/sessionStore.test.ts`):**

| Test case | Description |
|---|---|
| Start session | Sets `isActive: true`, records `startTime` |
| End session | Sets `isActive: false`, computes `duration` |
| Add pending log | Appends to `pendingLogs` array |
| Remove pending log | Removes by ID |
| Duration computation | `endTime - startTime` in minutes |
| Reset | Clears all session state |

**What to implement (`stores/sessionStore.ts`):**

- Zustand store with: `isActive`, `startTime`, `endTime`, `pendingLogs[]`, `duration`.
- Actions: `startSession()`, `endSession()`, `addPendingLog(log)`, `removePendingLog(id)`, `reset()`.

**Acceptance:** Store tests pass.

---

### Step 5.2 — Sessions Service

**Depends on:** Phase 3 (Step 3.1), Phase 2 (tables)  
**Relevant requirements:** FR-D1, FR-D2

**What to test (`services/__tests__/sessions.service.test.ts`):**

| Test case | Description |
|---|---|
| Create ascent | Inserts into `route_ascents`, returns created row |
| Create ascent with notes | Notes field persisted |
| Fetch session summary | For a date, returns: total attempts, sends, grade distribution |
| Fetch session history | Returns sessions ordered by date |
| Delete ascent | Removes ascent row |

**What to implement (`services/sessions.service.ts`):**

- `createAscent(log: AscentLog): Promise<Ascent>`
- `deleteAscent(id: string): Promise<void>`
- `getSessionSummary(userId: string, date: Date): Promise<SessionSummary>`
- `getSessionHistory(userId: string): Promise<Session[]>`

**Acceptance:** Service tests pass against Supabase local.

---

### Step 5.3 — useSession Hook

**Depends on:** Steps 5.1, 5.2  
**Relevant requirements:** FR-D1, FR-D4

**What to test:**

| Test case | Description |
|---|---|
| Log ascent mutation | Calling `logAscent()` inserts + invalidates queries |
| Optimistic update | Pending log shows immediately before server confirms |
| Rollback on error | If insert fails, pending log reverted |
| Session timer | `startSession()` + `endSession()` computes duration |

**What to implement (`hooks/useSession.ts`):**

- `useSession()` hook combining `sessionStore` + TanStack `useMutation`.
- Optimistic updates via `onMutate` / `onError` / `onSettled`.
- Invalidates session summary, leaderboard, badge queries on success.

**Acceptance:** Hook tests pass with mocked service.

---

### Step 5.4 — QuickLog Bottom Sheet

**Depends on:** Step 5.3  
**Relevant requirements:** FR-D1

**What to test (`components/__tests__/QuickLogSheet.test.tsx`):**

| Test case | Description |
|---|---|
| Sheet renders | Status buttons (Flash/Send/Attempt), attempts counter, notes field |
| Flash sets attempts to 1 | Selecting Flash auto-sets attempts = 1 |
| Attempts increment/decrement | +/- buttons work; min = 1 |
| Submit calls logAscent | Tapping confirm calls `useSession().logAscent()` |
| Haptic feedback | Confirms via `expo-haptics` on submit |
| Dismiss resets | Closing sheet clears form state |

**What to implement (`components/session/QuickLogSheet.tsx`):**

- Bottom sheet (Reanimated + Gesture Handler).
- Three status buttons: Flash (auto attempts=1), Send, Attempt.
- Attempts counter (numeric stepper).
- Optional notes `TextInput`.
- Confirm button → calls mutation → haptic → dismiss.

**Acceptance:** QuickLog sheet works end-to-end; haptic fires on submit.

---

### Step 5.5 — Session Timer & Summary

**Depends on:** Steps 5.1, 5.3  
**Relevant requirements:** FR-D4, FR-D2

**What to test:**

| Test case | Description |
|---|---|
| Timer displays elapsed time | Shows HH:MM:SS while session active |
| Session summary card | After session end, shows attempts, sends, grades |
| Grade distribution chart | Bar chart of sends per grade |
| Session appears in logbook | New session listed in history |

**What to implement:**

- `components/session/SessionTimer.tsx`: running timer from `sessionStore.startTime`.
- `components/session/SessionSummary.tsx`: summary card with stats.

**Acceptance:** Full session lifecycle (start → log ascents → end → view summary) works.

---

### Step 5.6 — Logbook Screen

**Depends on:** Steps 5.2, 5.5  
**Relevant requirements:** FR-E5, FR-D2

**What to test:**

| Test case | Description |
|---|---|
| Lists all sessions | Chronological list with date headers |
| Session card shows stats | Attempts, sends, grade range |
| Drill-down to detail | Tapping session opens detail screen |
| Detail shows ascent list | Individual ascents with route name, grade, status |
| Saved routes tab | Access projects/wishlist/favorites from logbook |
| Empty state | "No sessions yet" for new users |

**What to implement:**

- `app/(tabs)/logbook/index.tsx`: FlatList of session cards.
- `app/(tabs)/logbook/[sessionId].tsx`: drill-down with ascent list.
- Saved routes section accessible from logbook (Project/Wishlist/Favorite tabs).

**Acceptance:** Logbook shows session history and saved routes; drill-down works.

---

## Phase 6 — Offline Support

### Step 6.1 — Offline Store & SQLite Queue

**Depends on:** Phase 5  
**Relevant requirements:** FR-D3, NFR-3, NFR-9

**What to test (`stores/__tests__/offlineStore.test.ts`):**

| Test case | Description |
|---|---|
| Enqueue action | Adds action to queue with timestamp |
| Persist to SQLite | Action survives store rehydration |
| Dequeue after sync | Successfully synced action removed from queue |
| Queue ordering | FIFO — oldest action synced first |
| Queue survives app restart | Load from SQLite on mount |

**What to implement:**

- `stores/offlineStore.ts`: Zustand store with `queue[]`, `enqueue(action)`, `dequeue(id)`, `getAll()`.
- `expo-sqlite` table: `offline_queue(id, action_type, payload JSON, created_at, retry_count)`.
- Persist middleware: on enqueue, write to SQLite; on mount, hydrate from SQLite.

**Acceptance:** Offline queue tests pass; data survives simulated app restart.

---

### Step 6.2 — Offline Route Cache

**Depends on:** Step 6.1, Phase 4 (routes hook)  
**Relevant requirements:** NFR-3

**What to test:**

| Test case | Description |
|---|---|
| Cache routes after fetch | Routes saved to SQLite after network fetch |
| Serve from cache offline | When network unavailable, returns cached routes |
| Cache invalidation | After sync, stale cache entries updated |
| Cache respects gym scope | Only home gym routes cached |

**What to implement:**

- SQLite tables: `cached_routes(id, data JSON, gym_id, cached_at)`.
- Modify `useRoutes` hook: on successful fetch, write to cache; on network error, fall back to cache.
- Cache TTL: 24 hours (configurable).

**Acceptance:** Airplane-mode test: cached routes load; new logs queue offline.

---

### Step 6.3 — Sync Engine

**Depends on:** Steps 6.1, 6.2  
**Relevant requirements:** FR-D3, NFR-9

**What to test (`hooks/__tests__/useOfflineSync.test.ts`):**

| Test case | Description |
|---|---|
| Detects connectivity | Hook fires when network comes back |
| Replays queue in order | Oldest action first |
| Successful sync removes from queue | Queue shrinks on success |
| Failed sync retries | Exponential backoff, max 3 retries |
| Permanent failure surfaced | After 3 retries, action marked as failed; user notified |
| Conflict resolution | Last-write-wins with timestamps |
| Cache invalidated after sync | TanStack Query caches refreshed |

**What to implement (`hooks/useOfflineSync.ts`):**

- Listen to `NetInfo` for connectivity changes.
- On reconnect: drain `offlineStore.queue`, replay via service layer.
- Exponential backoff: 1s, 4s, 16s.
- On success: `dequeue()`, `queryClient.invalidateQueries()`.
- On permanent failure: mark action, show in-app toast.

**Acceptance:** Full offline → online cycle tested: log offline, reconnect, verify sync.

---

## Phase 7 — QR/NFC Scanning

### Step 7.1 — QR Scanner Screen

**Depends on:** Phase 4 (route detail), Phase 5 (QuickLog)  
**Relevant requirements:** FR-B3, FR-D1

**What to test:**

| Test case | Description |
|---|---|
| Camera permission requested | Prompts for camera access on first use |
| QR decoded | Scanned QR payload extracted |
| Signed payload verified | JWT signature validated against public key |
| Invalid/expired QR rejected | Shows error toast |
| Navigates to route detail | After successful scan, routes to `home/[routeId]` |
| Quick log option | After scan, user can immediately log ascent |

**What to implement (`app/(tabs)/scan.tsx`):**

- `expo-camera` with barcode scanning enabled.
- JWT verification: decode payload, check signature with known public key, check expiry.
- On success: `router.push(/home/${routeId})`.
- Option: show QuickLogSheet directly after scan.

**Acceptance:** Scanning a test QR (generated from seed) navigates to correct route.

---

### Step 7.2 — QR Signing Edge Function

**Depends on:** Phase 2 (tables), Phase 0 (Supabase)  
**Relevant requirements:** FR-C5, FR-P3

**What to test (integration / unit test for Edge Function):**

| Test case | Description |
|---|---|
| Generates valid JWT | Returned payload decodes correctly |
| Contains route_id | JWT claims include `route_id` |
| Has expiry | JWT expires after configured TTL |
| Requires admin auth | Non-admin call rejected |
| Rotation | Subsequent calls generate different payloads (due to timestamps) |

**What to implement (`supabase/functions/sign-qr/index.ts`):**

- Deno Edge Function.
- Input: `route_id`, authenticated as gym_admin.
- Output: signed JWT with `route_id`, `gym_id`, `iat`, `exp`.
- Uses secret key from environment.

**Acceptance:** Edge function tests pass; generated QR scannable by client.

---

## Phase 8 — Gamification

### Step 8.1 — Badge Award Engine

**Depends on:** Phase 2 (Steps 2.3, 2.4), Phase 5  
**Relevant requirements:** FR-F1

**What to test:**

| Test case | Description |
|---|---|
| First send of grade | Sending V4 for first time awards "First V4" badge |
| Volume milestone | 10th, 50th, 100th send awards badge |
| Flash milestone | First flash awards badge |
| Streak milestone | 4-week streak awards "Monthly Warrior" |
| No re-award | Already-awarded badge not duplicated |
| Badge appears on profile | `user_badges` query returns awarded badges |

**What to implement:**

- Extend `on_ascent_insert()` trigger or create `check_badges(user_id)` function.
- Badge criteria evaluation: switch on `criteria_type` (first_grade, volume, flash, streak).
- Insert into `user_badges` if not already awarded.

**Acceptance:** Inserting specific ascents via tests triggers correct badge awards.

---

### Step 8.2 — Badge Display on Profile

**Depends on:** Step 8.1, Phase 3 (auth)  
**Relevant requirements:** FR-A2, FR-F1

**What to test:**

| Test case | Description |
|---|---|
| Profile shows pinned badges | Up to 3 (Pro) or 1 (Free) badges displayed |
| Badge picker | User can select which badges to pin |
| Tier enforcement | Free user cannot pin more than 1 |
| Badge detail | Tapping badge shows name, description, award date |

**What to implement:**

- `hooks/useBadges.ts`: fetch user badges, pinned badges.
- `components/ui/Badge.tsx`: badge chip with icon.
- Profile screen: badge row with pin management.

**Acceptance:** Profile displays badges; tier limit enforced.

---

### Step 8.3 — Streak UI & Notifications

**Depends on:** Steps 1.2, 8.1  
**Relevant requirements:** FR-F2

**What to test:**

| Test case | Description |
|---|---|
| Streak counter on profile | Shows current weekly streak |
| At-risk indicator | If last session > 5 days ago, show warning |
| Streak broken visual | Clear indication when streak resets |
| Recovery message | "Climb this week to recover your streak!" |

**What to implement:**

- `hooks/useStreaks.ts`: fetch from `user_streaks` table.
- Streak display component on profile/home screen.
- Integration with push notifications (Phase 10) for "streak at risk" reminders.

**Acceptance:** Streak UI reflects actual streak state from DB.

---

### Step 8.4 — Time-Boxed Challenges & Quests

**Depends on:** Steps 8.1, 2.4  
**Relevant requirements:** FR-F3

**What to test:**

| Test case | Description |
|---|---|
| Challenge definition | Admin creates challenge with start/end, criteria, rewards |
| Challenge visible to users | Active challenges appear in gamification section |
| Progress tracking | User sees current progress toward challenge goal |
| Challenge completion | Meeting criteria awards badge/reward |
| Expired challenge | Past challenges show as completed or missed |

**What to implement:**

- `challenges` table: id, gym_id, name, description, criteria (JSONB), reward_badge_id, start_date, end_date
- `user_challenge_progress`: user_id, challenge_id, progress, completed_at
- Service + hook: `useChallenges()`, `useChallengeProgress()`
- Challenge card component in gamification section.

**Acceptance:** Challenge lifecycle works from creation to completion.

---

### Step 8.5 — Elo-Like Rank System (Stretch)

**Depends on:** Steps 1.3, 8.1  
**Relevant requirements:** FR-F4

**What to test:**

| Test case | Description |
|---|---|
| Initial rank assigned | New user gets starting Elo |
| Rank adjusts on send | Sending higher-grade route increases rank |
| Rank decays over inactivity | Rank decreases if no activity for N days |
| Rank displayed on profile | Current rank shown alongside grade |

**What to implement:**

- `user_ranks`: user_id, elo_score, last_updated
- Elo update function triggered on ascent insert.
- Decay cron job via `pg_cron`.
- Rank display in profile and leaderboard.

**Acceptance:** Rank adjusts correctly on test ascents. (Low priority — implement if time allows.)

---

## Phase 9 — Social & Leaderboards

### Step 9.1 — Leaderboard Service & Hook

**Depends on:** Phase 2 (Step 2.4), Phase 5  
**Relevant requirements:** FR-G1

**What to test:**

| Test case | Description |
|---|---|
| Fetch leaderboard by gym | Returns ranked entries for a gym |
| Filter by period | Weekly, monthly, all-time |
| Filter by scoring model | Hardest grade, flash rate, volume |
| Current user highlighted | User's own entry marked in results |
| Empty leaderboard | Graceful empty state |

**What to implement:**

- `services/leaderboard.service.ts`: `getLeaderboard(gymId, period, model)`
- `hooks/useLeaderboard.ts`: TanStack Query wrapper.

**Acceptance:** Leaderboard service returns correctly ranked data.

---

### Step 9.2 — Leaderboard Screen

**Depends on:** Step 9.1  
**Relevant requirements:** FR-G1, FR-G4

**What to test:**

| Test case | Description |
|---|---|
| Renders ranked list | Shows rank, name, score, grade |
| Tab switcher | Period tabs (week/month/all-time) |
| User's row highlighted | Current user's row has distinct style |
| Video required indicator | Sends above threshold show verification badge |
| Tap navigates to profile | Tapping user row goes to `social/[userId]` |

**What to implement (`app/(tabs)/social/index.tsx`):**

- Leaderboard list with `useLeaderboard()`.
- Period tab bar.
- Scoring model switcher.
- Video verification indicator per entry.

**Acceptance:** Leaderboard screen renders with seeded data; interactions work.

---

### Step 9.3 — Beta Tips & Route Feedback

**Depends on:** Phase 4 (route detail)  
**Relevant requirements:** FR-G2, FR-C6

**What to test:**

| Test case | Description |
|---|---|
| Submit beta tip | Text tip persisted to `route_feedback` |
| View tips on route detail | Tips listed below route info |
| Up/down vote tip | Vote changes score |
| Low-score tip hidden | Tips below threshold not shown |
| Submit beta video | Video uploaded + linked to route |
| User-supplied tags | Tags submitted with feedback aggregated |

**What to implement:**

- Feedback list on route detail screen.
- Feedback compose form (text + optional video + tags).
- Vote buttons on each tip.
- `services/feedback.service.ts`: CRUD for feedback, votes.

**Acceptance:** Full feedback flow works end-to-end.

---

### Step 9.4 — Follow System & Activity Feed

**Depends on:** Phase 2 (Step 2.5), Phase 3  
**Relevant requirements:** FR-G5

**What to test:**

| Test case | Description |
|---|---|
| Follow a user | Creates `follows` row |
| Unfollow a user | Deletes `follows` row |
| Activity feed | Shows followed users' recent ascents |
| Empty feed | "Follow climbers to see their activity" |
| Follow count | Profile shows follower/following counts |

**What to implement:**

- `services/social.service.ts`: `follow()`, `unfollow()`, `getFollowing()`, `getActivityFeed()`
- `hooks/useSocial.ts`
- Activity feed component on social tab.
- Follow/unfollow button on user profiles.

**Acceptance:** Follow flow works; feed populates with followed users' activity.

---

### Step 9.5 — Content Reporting & Moderation

**Depends on:** Phase 2 (Step 2.5), Steps 9.3, 9.4  
**Relevant requirements:** FR-G3, FR-K2, FR-K3

**What to test:**

| Test case | Description |
|---|---|
| Report content | Creates `content_reports` row with correct target |
| Report reasons | Dropdown with predefined reasons |
| Community guidelines | Shown before first upload; accessible from settings |
| Moderation queue (admin) | Admin sees pending reports |
| Approve/reject/escalate | Admin actions update report status |
| Rejected content hidden | Rejected video/tip no longer visible |

**What to implement:**

- Report flow: report button → reason picker → submit.
- `services/moderation.service.ts`: `createReport()`, `getReports()`, `resolveReport()`
- Community guidelines screen in settings.
- Admin moderation screen: `app/(admin)/moderation.tsx`.

**Acceptance:** Full report → review → resolve cycle tested.

---

## Phase 10 — Notifications

### Step 10.1 — Push Token Registration

**Depends on:** Phase 3 (auth), Phase 2 (Step 2.7)  
**Relevant requirements:** FR-J1

**What to test:**

| Test case | Description |
|---|---|
| Token obtained | `expo-notifications` returns push token |
| Token saved to DB | Token persisted in `push_tokens` table |
| Token refresh | Updated token replaces old one |
| Permission denied handling | Graceful degradation if notifications denied |

**What to implement:**

- On app launch (authenticated): request notification permissions, get token, upsert to `push_tokens`.
- `services/notifications.service.ts`: `registerPushToken()`, `unregisterPushToken()`

**Acceptance:** Push token appears in DB after app launch.

---

### Step 10.2 — Push Dispatch Edge Function

**Depends on:** Step 10.1, Phase 2 (Step 2.7)  
**Relevant requirements:** FR-J1

**What to test:**

| Test case | Description |
|---|---|
| Receives trigger from Postgres | `pg_net` call arrives with correct payload |
| Reads user preferences | Respects per-category opt-in/out |
| Sends to APNs for iOS | Correct payload format |
| Sends to FCM for Android | Correct payload format |
| Opted-out user skipped | No push sent if user disabled that category |

**What to implement (`supabase/functions/dispatch-push/index.ts`):**

- Input: `{ user_id, notification_type, title, body, data }`.
- Fetch user's push token + preferences from DB.
- If opted-in: send via APNs/FCM.
- Log dispatch status.

**Acceptance:** Edge function integration tests pass.

---

### Step 10.3 — In-App Notification Center

**Depends on:** Steps 10.1, 10.2  
**Relevant requirements:** FR-J2, FR-J3

**What to test:**

| Test case | Description |
|---|---|
| Notification list | Shows recent notifications with read/unread |
| Mark as read | Tapping notification marks it read |
| Badge count | Unread count shown on tab icon |
| Notification preferences | Per-category toggles (friends, routes, comps, achievements) |
| Realtime updates | New notification appears without refresh |

**What to implement:**

- Notification bell icon in header with unread badge.
- Notification center screen/modal.
- Preferences screen in settings.
- Supabase Realtime subscription for new notifications.

**Acceptance:** Notifications flow from trigger → DB → push + in-app display.

---

## Phase 11 — Competitions & Events

### Step 11.1 — Event CRUD (Admin)

**Depends on:** Phase 4 (routes), Phase 2 (Step 2.6)  
**Relevant requirements:** FR-H1

**What to test:**

| Test case | Description |
|---|---|
| Create event | Gym admin creates event with name, dates, scoring model |
| Link routes to event | Selected routes associated via `event_routes` |
| Edit event | Update name, dates, scoring model |
| Delete event | Removes event and associated scores |
| List events | Admin sees all events for their gym |
| Create categories | Age/gender categories added to event |

**What to implement:**

- `services/events.service.ts`: CRUD operations.
- `app/(admin)/events/` screens: list, create, edit.

**Acceptance:** Admin can manage events end-to-end.

---

### Step 11.2 — Score Entry & Verification

**Depends on:** Step 11.1, Phase 7 (QR)  
**Relevant requirements:** FR-H2

**What to test:**

| Test case | Description |
|---|---|
| Self-entry via QR | Athlete scans QR at route → score recorded |
| Judge entry | Judge logs score on behalf of athlete |
| Verifier confirmation | Score marked as verified |
| Duplicate prevention | Same athlete+route+event upserts, not duplicates |

**What to implement:**

- Score entry UI for athletes (from QR scan).
- Judge entry UI in admin section.
- Verification flow: verifier confirms score.

**Acceptance:** Scores entered and verified correctly.

---

### Step 11.3 — Live Scoreboard

**Depends on:** Step 11.2  
**Relevant requirements:** FR-H3

**What to test:**

| Test case | Description |
|---|---|
| Real-time ranking | New score → ranking updates live |
| Scoring model applied | Scores computed per event's scoring model |
| Category filtering | Filter by age/gender category |
| Screen export | Scoreboard exportable as image (stretch) |

**What to implement:**

- Supabase Realtime subscription on `competition_scores` filtered by event.
- Live ranking computation.
- Scoreboard screen with auto-updating FlatList.

**Acceptance:** Adding a score via one device updates the scoreboard on another in <2s.

---

### Step 11.4 — Results Export

**Depends on:** Step 11.3  
**Relevant requirements:** FR-H4, FR-H5

**What to test:**

| Test case | Description |
|---|---|
| CSV export | Downloadable CSV with all scores, ranks, categories |
| PDF export | Formatted PDF with event name, date, rankings |
| Category-separated results | Export includes per-category rankings |
| Scheduling info included | Event dates/times in export header |

**What to implement:**

- Export function: query final scores, format as CSV/PDF.
- Share sheet / file save integration.
- Category-aware export with separate sections.

**Acceptance:** Exported files contain correct, complete competition results.

---

## Phase 12 — Media (Beta Videos)

### Step 12.1 — Video Upload Flow

**Depends on:** Phase 4 (route detail), Phase 2 (tables)  
**Relevant requirements:** FR-K1, NFR-11

**What to test:**

| Test case | Description |
|---|---|
| Video picker | User can select from library or record |
| Duration validation | >60s video rejected with message |
| Resolution cap | >1080p downscaled |
| Size cap | >50MB after compression rejected |
| Ownership checkbox | Upload blocked until affirmed |
| Upload to Storage | File appears in `beta-videos` bucket |
| Linked to route | `route_media` row created |

**What to implement:**

- Video picker (expo-image-picker or expo-video).
- Client-side validation: duration, resolution.
- Client-side compression (expo-video or FFmpeg-kit).
- Ownership affirmation modal.
- Upload to Supabase Storage → create `route_media` row.

**Acceptance:** Video upload flow works end-to-end with all constraints enforced.

---

### Step 12.2 — Video Playback

**Depends on:** Step 12.1  
**Relevant requirements:** FR-C2, NFR-11

**What to test:**

| Test case | Description |
|---|---|
| Thumbnail loading | Videos show lazy-loaded thumbnails in lists |
| Playback on tap | Video plays in detail view |
| Streaming | Large videos stream without full download |
| Error handling | Invalid URL shows fallback |

**What to implement:**

- `components/routes/BetaVideoPlayer.tsx` using `expo-video`.
- Thumbnail generation (Supabase image transforms or first-frame extraction).
- Lazy loading in FlatList.

**Acceptance:** Videos play smoothly in route detail; thumbnails load in lists.

---

## Phase 13 — Monetization

### Step 13.1 — Pro Subscription Flow

**Depends on:** Phase 3 (auth), Phase 8 (badges for tier enforcement)  
**Relevant requirements:** FR-L3, FR-L4

**What to test:**

| Test case | Description |
|---|---|
| Paywall shown for Pro features | Analytics, 3 badges, unlimited beta → paywall for free users |
| IAP purchase flow | Purchase initiates native flow |
| Receipt validation | Server-side receipt verification |
| Subscription status persisted | User's tier updated in `profiles` |
| Restore purchases | Previously purchased sub restored on new device |
| Tier enforcement | Free tier limits enforced (5 beta/week, 1 badge, no analytics) |

**What to implement:**

- Paywall component: shown when free user tries Pro feature.
- IAP integration: `expo-in-app-purchases` or RevenueCat.
- `supabase/functions/verify-iap/index.ts`: server-side receipt validation.
- `supabase/functions/billing-webhook/index.ts`: handles store webhooks.
- Tier check middleware/hook: `useEntitlement(feature)` returns boolean.

**Acceptance:** Purchase flow works in sandbox; tier limits enforced.

---

### Step 13.2 — Trials & Promo Codes

**Depends on:** Step 13.1  
**Relevant requirements:** FR-L5

**What to test:**

| Test case | Description |
|---|---|
| Trial activation | New user can start 7-day Pro trial |
| Trial expiration | After 7 days, user reverts to Free unless subscribed |
| Promo code redemption | Valid code grants Pro for specified duration |
| Invalid code rejection | Unknown code shows error |
| One trial per user | Cannot re-activate trial |

**What to implement:**

- `promo_codes` table: code, type (trial/discount), duration_days, max_uses, current_uses
- `user_trials`: user_id, started_at, expires_at
- Trial/promo redemption service + UI.
- `pg_cron` job: expire trials nightly, revert tier to Free.

**Acceptance:** Trial and promo flows work correctly with proper expiration.

---

### Step 13.3 — Gym Billing (Admin)

**Depends on:** Phase 2 (tables), Phase 15 (admin portal)  
**Relevant requirements:** FR-L2

**What to test:**

| Test case | Description |
|---|---|
| Active user count | Count of users linked to gym who logged in this month |
| Billing summary | €0.50 × active users = total |
| Billing history | Past months' bills visible |

**What to implement:**

- `pg_cron` job: monthly count of active gym users → insert billing record.
- Admin dashboard widget showing current month's active users + projected bill.
- Billing history screen.

**Acceptance:** Billing calculation is correct for seeded data.

---

## Phase 14 — Progression & Analytics (Pro)

### Step 14.1 — Grade Pyramid

**Depends on:** Phase 5 (sessions), Phase 13 (tier gating)  
**Relevant requirements:** FR-E1

**What to test:**

| Test case | Description |
|---|---|
| Pyramid data correct | Shows count of sends per grade, pyramid-shaped |
| Filters by time period | Last month, 3 months, all-time |
| Only sends counted | Attempts excluded |
| Visual rendering | Renders as horizontal bar chart (pyramid shape) |

**What to implement:**

- `hooks/useGradePyramid.ts`: aggregates ascents by canonical_grade.
- `components/analytics/GradePyramid.tsx`: horizontal bar chart.
- Pro gate: only accessible to Pro users.

**Acceptance:** Grade pyramid displays correctly for test user's ascent history.

---

### Step 14.2 — Style Insights

**Depends on:** Step 14.1  
**Relevant requirements:** FR-E2

**What to test:**

| Test case | Description |
|---|---|
| Style breakdown | Radar/spider chart of user's style distribution |
| Based on sent routes' tags | Aggregates from routes the user has sent |
| Comparison to gym average | Optional overlay of gym-wide style profile |

**What to implement:**

- Query user's sent routes → aggregate style tags.
- `components/analytics/StyleInsights.tsx`: radar chart.
- Pro gate.

**Acceptance:** Style chart renders with correct data.

---

### Step 14.3 — Personalized Route Suggestions

**Depends on:** Steps 14.1, 14.2  
**Relevant requirements:** FR-E3

**What to test:**

| Test case | Description |
|---|---|
| Suggests unsent routes | Only routes user hasn't sent |
| Grade-appropriate | Within ±2 of user's max grade |
| Style-diverse | Includes underrepresented styles |
| Refreshable | New set of suggestions on request |

**What to implement:**

- Recommendation query: unsent routes in grade range, weighted toward weak styles.
- `hooks/useRouteSuggestions.ts`
- Suggestions card on home screen (Pro).

**Acceptance:** Suggestions are relevant and change appropriately.

---

## Phase 15 — Admin Portal & Route Setting

### Step 15.1 — Admin Dashboard

**Depends on:** Phase 4 (routes), Phase 7 (QR)  
**Relevant requirements:** FR-O1

**What to test:**

| Test case | Description |
|---|---|
| Shows active routes count | Correct count for admin's gym |
| Shows sets in progress | Routes in draft/setting status |
| Scan count | Total QR scans for the gym |
| Role gate | Non-admins cannot access |

**What to implement (`app/(admin)/dashboard.tsx`):**

- Summary widgets: route counts, scan stats, recent activity.
- `(admin)/_layout.tsx`: role check → redirect if not gym_admin.

**Acceptance:** Dashboard shows correct stats; non-admins blocked.

---

### Step 15.2 — Route Management (Admin)

**Depends on:** Step 15.1, Phase 7 (Step 7.2 for QR signing)  
**Relevant requirements:** FR-I1, FR-C5, FR-C7

**What to test:**

| Test case | Description |
|---|---|
| Create route | Admin fills form → route created with generated ID |
| Edit route | Grade, status, wall section editable |
| Retire route | Status changed to 'retiring_soon' → 'archived' |
| QR generation | Route QR payload generated via Edge Function |
| Assign setter | Route linked to setter user |
| List routes | All gym's routes with filters |
| Bulk import/update | Inline editor for batch route changes |

**What to implement (`app/(admin)/routes/`):**

- Route list screen with inline bulk editor.
- Route create/edit form.
- Status transition buttons (Active → Retiring → Archived).
- QR code generation + display (from `sign-qr` edge function).

**Acceptance:** Full route lifecycle manageable from admin screens.

---

### Step 15.3 — Route Setting Calendar & Workload

**Depends on:** Step 15.2  
**Relevant requirements:** FR-I1

**What to test:**

| Test case | Description |
|---|---|
| Calendar view | Shows planned set dates |
| Assign setter to date | Setter assigned to setting session |
| Workload view | Count of routes per setter this month |

**What to implement:**

- Calendar component showing set schedule.
- Setter assignment UI.
- Workload summary per setter.

**Acceptance:** Admin can plan and track route setting.

---

### Step 15.4 — Grade Consensus View

**Depends on:** Phase 2 (Step 2.3 consensus function), Step 15.2  
**Relevant requirements:** FR-I2

**What to test:**

| Test case | Description |
|---|---|
| Setter grade vs community grade | Side-by-side comparison displayed |
| Divergence highlighted | Routes where community grade differs by ≥2 grades flagged |
| Grade history | Shows how consensus changed over time |

**What to implement:**

- Admin view comparing `canonical_grade` (setter) vs `consensus_grade` (community).
- Visual indicator for significant divergence.
- Service query: routes with grade divergence for a gym.

**Acceptance:** Grade consensus view shows accurate comparisons.

---

### Step 15.5 — Maintenance Tickets

**Depends on:** Phase 2 (Step 2.8), Step 15.1  
**Relevant requirements:** FR-I3

**What to test:**

| Test case | Description |
|---|---|
| Create ticket | Climber/setter reports spinning hold on a route |
| Ticket appears in admin view | Admin sees pending tickets |
| Status transitions | open → in_progress → resolved |
| Resolver recorded | Resolved ticket records who fixed it |

**What to implement:**

- Report broken hold button on route detail screen (accessible to all authenticated users).
- `services/maintenance.service.ts`: CRUD for tickets.
- Admin screen: ticket list with status actions.

**Acceptance:** Full ticket lifecycle works from report to resolution.

---

### Step 15.6 — Season Reset & Archive

**Depends on:** Phase 2 (Step 2.8), Step 15.2  
**Relevant requirements:** FR-I4

**What to test:**

| Test case | Description |
|---|---|
| Create season | Admin creates season with start/end |
| Close season | Closing season archives linked routes |
| Leaderboard frozen | Closed season's leaderboard no longer updates |
| New season starts clean | New season begins with fresh leaderboard |
| Archived routes visible | Archived routes still browsable but marked |

**What to implement:**

- Season management UI in admin portal.
- Season close action: batch-archive routes, freeze leaderboard snapshot.
- Season history view.

**Acceptance:** Season lifecycle works; leaderboard correctly freezes.

---

### Step 15.7 — Audit Log View

**Depends on:** Phase 2 (Step 2.8), Step 15.1  
**Relevant requirements:** FR-O3

**What to test:**

| Test case | Description |
|---|---|
| Log entries visible | Admin sees chronological list of changes |
| Filterable by action type | Filter by grade_change, status_change, media_removed |
| Actor shown | Each entry shows who made the change |
| Old/new values | Diff visible for grade and status changes |

**What to implement:**

- Audit log screen in admin portal.
- Filterable list of `audit_log` entries.
- Detail view showing before/after values.

**Acceptance:** Audit log accurately reflects all tracked changes.

---

## Phase 16 — Profile & Settings

### Step 16.1 — Profile Screen

**Depends on:** Phase 8 (badges), Phase 5 (sessions), Phase 3 (auth)  
**Relevant requirements:** FR-A2, FR-A3, FR-A5

**What to test:**

| Test case | Description |
|---|---|
| Displays user info | Name, avatar, home gym, grade preference |
| Edit fields | Can update name, avatar, home gym |
| Pinned badges | Shows pinned badges |
| Stats summary | Total sends, max grade, current streak |
| Data export | Request triggers data export |
| Account deletion | Triggers delete flow with confirmation |

**What to implement (`app/(tabs)/profile/index.tsx`):**

- Profile view + edit mode.
- Badge row.
- Stats section.
- Data export and deletion buttons (with confirmation dialogs).

**Acceptance:** Profile fully functional with edit, export, and delete.

---

### Step 16.2 — Other Users' Profile Screen

**Depends on:** Step 16.1, Phase 9 (follow system)  
**Relevant requirements:** FR-G5

**What to test:**

| Test case | Description |
|---|---|
| Public profile renders | Name, avatar, pinned badges, stats visible |
| Follow/unfollow button | Works correctly |
| Follower/following counts | Accurate counts displayed |
| Recent sends visible | Latest ascent activity shown |

**What to implement (`app/(tabs)/social/[userId].tsx`):**

- Public profile view (read-only, limited fields).
- Follow/unfollow button.
- Recent activity feed for that user.

**Acceptance:** Can view other users' profiles and follow/unfollow.

---

### Step 16.3 — Settings Screen

**Depends on:** Steps 16.1, Phase 10 (notification preferences)  
**Relevant requirements:** FR-A5, FR-E4, FR-J3, FR-Q1

**What to test:**

| Test case | Description |
|---|---|
| Grade system preference | Selectable: V-scale, Font, YDS |
| Notification preferences | Per-category toggles |
| Language switching | EN ↔ PT-PT |
| Community guidelines | Accessible from settings |
| Sign out | Signs user out |

**What to implement (`app/(tabs)/profile/settings.tsx`):**

- Grade system picker → updates profile + `uiStore`.
- Notification preferences → updates DB.
- Language selector → updates app locale.
- Links: community guidelines, privacy policy, terms.
- Sign out button.

**Acceptance:** All settings persist and take effect.

---

## Phase 17 — Onboarding

### Step 17.1 — Optional Onboarding Flow

**Depends on:** Phase 3 (auth), Phase 4 (gyms)  
**Relevant requirements:** FR-A5

**What to test:**

| Test case | Description |
|---|---|
| Shown after first registration | New users see onboarding |
| Select home gym | Gym picker works |
| Select climbing type | Boulder, lead, top-rope selection |
| Select grade range | Self-assessed grade range |
| Skip option | User can skip each step |
| Saves preferences | Selections persisted to profile |
| Not shown on subsequent logins | One-time only |

**What to implement:**

- Onboarding flow screens (3–4 steps).
- Gym search/select.
- Climbing type multi-select.
- Grade range slider.
- Skip/finish logic; flag in profile (`onboarding_completed`).

**Acceptance:** Full onboarding flow works; preferences saved.

---

## Phase 18 — Polish, Accessibility & Localization

### Step 18.1 — i18n Setup (EN + PT-PT)

**Depends on:** All UI phases (3–17)  
**Relevant requirements:** FR-Q1

**What to test:**

| Test case | Description |
|---|---|
| English strings load | Default locale shows English |
| Portuguese strings load | Switching to PT-PT shows Portuguese |
| All screens translated | No untranslated keys visible |
| Dynamic content | Grades and dates respect locale |

**What to implement:**

- i18n library (e.g., `i18next` + `react-i18next`).
- Translation files: `en.json`, `pt-PT.json`.
- Wrap all UI strings in `t()` calls.

**Acceptance:** App fully navigable in both languages.

---

### Step 18.2 — Accessibility Pass

**Depends on:** All UI phases  
**Relevant requirements:** FR-Q2, FR-Q3, NFR-8

**What to test:**

| Test case | Description |
|---|---|
| Large text mode | Text scales with system settings |
| Tap targets | All interactive elements ≥ 44×44pt |
| Color-aware mode | Route colors have pattern/label alternatives |
| Screen reader labels | Key elements have `accessibilityLabel` |
| Contrast ratios | Text meets WCAG AA |

**What to implement:**

- Audit all components for accessibility props.
- Add `accessibilityLabel`, `accessibilityRole`, `accessibilityHint`.
- Implement color-aware mode (patterns/text labels for hold colors).
- Test with VoiceOver (iOS) and TalkBack (Android).

**Acceptance:** App passes basic accessibility audit.

---

## Phase 19 — Error Tracking & Monitoring

### Step 19.1 — Sentry Integration

**Depends on:** Phase 3 (root layout)  
**Relevant requirements:** NFR-10

**What to test:**

| Test case | Description |
|---|---|
| Error captured | Thrown error appears in Sentry dashboard |
| No PII in logs | User IDs anonymized; no emails/names in breadcrumbs |
| Performance traces | Navigation transitions tracked |

**What to implement:**

- Configure `@sentry/react-native` in root layout.
- Add navigation instrumentation.
- Scrub PII from event processors.
- Test with intentional error.

**Acceptance:** Errors appear in Sentry; no PII leaks.

---

## Phase 20 — End-to-End Testing & Hardening

### Step 20.1 — Integration Test Suite

**Depends on:** All previous phases  
**Relevant requirements:** NFR-13

**What to test:**

| Flow | Description |
|---|---|
| Auth flow | Register → login → view home → logout |
| Scan-to-log | Scan QR → view route → log send → see in logbook |
| Offline sync | Go offline → log ascent → reconnect → verify sync |
| Leaderboard update | Log high-grade send → leaderboard reflects new rank |
| Badge award | Complete milestone → badge appears on profile |
| Competition | Create event → enter scores → live scoreboard updates |
| Admin route lifecycle | Create route → generate QR → retire → archive |
| Maintenance ticket | Report broken hold → admin resolves → ticket closed |
| Season reset | Create season → close → routes archived, leaderboard frozen |
| Pro subscription | Purchase Pro → verify analytics unlocked, tier limits removed |

**What to implement:**

- E2E test scripts (Maestro or Detox).
- Test against Supabase local with seeded data.
- CI integration: run E2E on PR merge.

**Acceptance:** All critical flows pass end-to-end.

---

### Step 20.2 — Performance & Security Hardening

**Depends on:** Step 20.1  
**Relevant requirements:** NFR-1, NFR-6, NFR-12

**What to test/verify:**

| Check | Target |
|---|---|
| Home screen load | <3s on 4G |
| Core action latency | <1s (log ascent, navigate) |
| Rate limiting | 60 req/min per user enforced |
| QR replay attack | Same QR payload reused after rotation → rejected |
| RLS bypass attempt | Direct PostgREST call without auth → blocked |
| Large dataset | 1000 routes + 10000 ascents → no performance degradation |

**What to implement:**

- Performance profiling with Sentry traces.
- Rate limit configuration in Supabase.
- Load testing with seed data scaled up.
- Security audit of RLS policies.

**Acceptance:** All performance targets met; security checks pass.

---

## Phase 21 — Build & Deployment

### Step 21.1 — EAS Build Profiles

**Depends on:** All previous phases

- Configure `eas.json` with `development`, `preview`, `production` profiles.
- Test build for both iOS and Android.
- Verify OTA update with `eas update`.

### Step 21.2 — CI/CD Pipeline Finalization

**Depends on:** Step 21.1

- On PR: lint + typecheck + unit tests + integration tests.
- On merge to `main`: `supabase db push` + `eas update` (OTA).
- On release tag: `eas build --production` + store submission.

### Step 21.3 — Production Supabase Setup

**Depends on:** Step 21.2

- Create production Supabase project.
- Apply all migrations.
- Configure environment variables.
- Set up storage buckets with policies.
- Enable Realtime on required tables.
- Configure Edge Function secrets.

**Phase 21 Acceptance:** App builds for both platforms, deploys to stores, connects to production Supabase.

---

## Appendix A: TDD Cheat Sheet

```
For every step:

1. RED    → Write test(s) that define expected behavior.
            Run tests. Confirm they FAIL.

2. GREEN  → Write MINIMUM code to pass.
            Run tests. Confirm they PASS.

3. REFACTOR → Clean up code (extract helpers, rename,
               remove duplication). Run tests.
               Confirm they STILL PASS.

Repeat for each test case in the step.
```

**Test file naming:** `__tests__/<filename>.test.ts(x)`

**Coverage target:** ≥80% for `utils/`, `services/`, `hooks/`. Component tests focus on behavior, not implementation.

---

## Appendix B: Requirement Traceability

| Phase | Requirements Covered |
|---|---|
| 0 — Scaffolding | NFR-7, NFR-14 |
| 1 — Data Foundation | FR-P1, FR-E4, FR-F2, FR-G1, FR-D1, FR-A1, FR-L1, FR-L3, FR-C7 |
| 2 — Database | FR-A1, FR-B1, FR-C1, FR-D1, FR-L1, NFR-4, FR-F1, FR-G1, FR-G2, FR-G3, FR-G5, FR-K1, FR-H1–H5, FR-J1, FR-J2, FR-C4, FR-O3, FR-I3, FR-I4 |
| 3 — Auth | FR-A1, FR-A4, FR-L1 |
| 4 — Gyms & Routes | FR-B1, FR-B4, FR-C1, FR-C3, FR-C7, FR-C4 |
| 5 — Logging | FR-D1, FR-D2, FR-D4, FR-E5 |
| 6 — Offline | FR-D3, NFR-3, NFR-9 |
| 7 — QR/NFC | FR-B3, FR-C5, FR-P3 |
| 8 — Gamification | FR-F1, FR-F2, FR-F3, FR-F4, FR-A2 |
| 9 — Social | FR-G1, FR-G2, FR-G3, FR-G4, FR-G5, FR-C6, FR-K2, FR-K3 |
| 10 — Notifications | FR-J1, FR-J2, FR-J3 |
| 11 — Competitions | FR-H1, FR-H2, FR-H3, FR-H4, FR-H5 |
| 12 — Media | FR-C2, FR-K1, NFR-11 |
| 13 — Monetization | FR-L2, FR-L3, FR-L4, FR-L5 |
| 14 — Analytics | FR-E1, FR-E2, FR-E3 |
| 15 — Admin | FR-O1, FR-O2, FR-O3, FR-I1, FR-I2, FR-I3, FR-I4, FR-C5, FR-C7 |
| 16 — Profile | FR-A2, FR-A3, FR-A5, FR-E4, FR-G5 |
| 17 — Onboarding | FR-A5 |
| 18 — Polish | FR-Q1, FR-Q2, FR-Q3, NFR-8 |
| 19 — Monitoring | NFR-10 |
| 20 — E2E & Hardening | NFR-1, NFR-6, NFR-12, NFR-13 |
| 21 — Deployment | NFR-2, NFR-7 |

---

## Appendix C: Uncovered / Deferred Requirements

| Requirement | PW | Status | Notes |
|---|---|---|---|
| FR-B2 (Sectors/map) | 2 | Deferred | Post-MVP; needs floor plan assets from gyms |
| FR-D5 (Auto-suggest session) | 2 | Deferred | Geofence complexity; revisit after MVP feedback |
| FR-Q2 (Large text mode) | 2 | Partial | Handled via OS dynamic type support in Phase 18 |
| FR-Q3 (Color-aware mode) | 2 | Phase 18 | Pattern/label overlays for hold colors |
