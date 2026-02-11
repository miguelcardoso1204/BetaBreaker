# Beta Breaker — TDD Development Plan

**Product:** Beta Breaker (iOS/Android)  
**Version:** 1.0 (MVP)  
**Methodology:** Test-Driven Development (Red → Green → Refactor)  
**Last updated:** 2026-02-06

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
| 3 | Authentication & Session Mgmt | 4–5 days | Phases 1, 2 | FR-A1, FR-A4, FR-L1, NFR-8 |
| 4 | Gym, Route & Tab Data Layer | 5–7 days | Phase 3 | FR-B1, FR-B4, FR-C1, FR-C3, FR-C7, FR-G1, FR-G6, NFR-8 |
| 5 | Tick-Logging & Sessions | 5–7 days | Phase 4 | FR-D1, FR-D2, FR-D4, FR-E5, FR-C2, FR-G2 |
| 6 | Offline Support | 3–4 days | Phase 5 | FR-D3, NFR-3, NFR-9 |
| 7 | QR/NFC Scanning | 2–3 days | Phases 4, 5 | FR-B3, FR-C5, FR-P3 |
| 8 | Gamification | 3–4 days | Phases 2, 5 | FR-F1, FR-F2, FR-F3, FR-F4, FR-A2 |
| 9 | Social & Leaderboards | 5–6 days | Phases 5, 8 | FR-G1–G5, FR-G6, FR-C6, FR-K2, FR-K3 |
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

**Depends on:** Phase 0 (Step 0.3 for test infra)
**Relevant requirements:** FR-P1, FR-E4

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

**Depends on:** Step 0.3
**Relevant requirements:** FR-F2

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

---

### Step 1.4 — Zod Validation Schemas ✅

**Depends on:** Step 0.3
**Relevant requirements:** FR-D1, FR-A1, FR-C1

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

### Step 1.5 — Constants & Type Definitions ✅

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

### Step 2.1 — Core Tables Migration ✅

**Depends on:** Phase 0 (Step 0.5 for Supabase local)
**Relevant requirements:** FR-A1, FR-B1, FR-C1, FR-D1, FR-L1
**Status:** Complete

**Implementation notes:**
- Created `supabase/migrations/20260205234337_core_tables.sql` — 7 tables (gyms, profiles, routes, style_tags, route_style_tags, route_ascents, user_gym_roles) with RLS enabled, CHECK constraints, CASCADE deletes, and indexes.
- Created `supabase/__tests__/00001_core_tables.test.ts` — 33 integration tests covering table existence, column types, FK constraints, CHECK constraints, default values, UUID generation, and cascade deletes.
- Tests connect via `pg` to local Supabase (port 54322), each wrapped in BEGIN/ROLLBACK for isolation.

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

### Step 2.2 — Row Level Security Policies ✅

**Depends on:** Step 2.1
**Relevant requirements:** NFR-4, FR-L1
**Status:** Complete

**Implementation notes:**
- Created `supabase/migrations/20260206000056_rls_policies.sql` — RLS policies for all 7 core tables + helper function `get_user_role(gym_id)`.
- Created `supabase/__tests__/00002_rls_policies.test.ts` — 52 integration tests covering anon denial, authenticated reads, own-row writes, role-based access (setter, gym_admin), and cross-user isolation.
- Tests use `SET LOCAL role = 'authenticated'` + `request.jwt.claims` to simulate PostgREST auth.

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

### Step 2.3 — Database Functions & Triggers ✅

**Depends on:** Step 2.1
**Relevant requirements:** FR-F1, FR-F2, FR-G1
**Status:** Complete

**Implementation notes:**
- Created `supabase/migrations/20260206002102_functions_triggers.sql` — 4 gamification tables (badges, user_badges, user_streaks, leaderboard_entries), consensus_grade column on routes, 4 RLS policies, 7 SECURITY DEFINER functions, 3 triggers.
- Created `supabase/__tests__/00003_functions_triggers.test.ts` — 35 integration tests covering handle_new_user trigger, streak tracking (consecutive, freeze, break), badge awards (first_grade, total_sends, idempotency, attempt rejection), grade consensus (median, threshold, delete), leaderboard (scoring, 1224 ranking, delete adjustment), and on_ascent_delete trigger.
- Key decision: `on_ascent_delete()` checks profile existence before FK writes to prevent cascade errors.

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

### Step 2.4 — Gamification Tables (Badges, Streaks, Leaderboards) ✅

**Depends on:** Step 2.3
**Relevant requirements:** FR-F1, FR-F2, FR-G1
**Status:** Complete

**Implementation notes:**
- Created `supabase/migrations/20260206003749_seed_badges.sql` — 18 default badge definitions (11 first_grade, 4 total_sends, 3 streak_weeks) with ON CONFLICT DO NOTHING for idempotency.
- Created `supabase/__tests__/00004_gamification.test.ts` — 15 integration tests covering seed data verification, end-to-end grade/volume/streak badge awarding with seeded data, and RLS read access to gamification tables.
- Updated `supabase/__tests__/00003_functions_triggers.test.ts` — Fixed 4 tests that used ad-hoc badge names conflicting with seeded data; now use unique names and filter by specific badge.
- Total integration tests: 135 (33 + 52 + 35 + 15). Total unit tests: 134.

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

### Step 2.5 — Social & Community Tables ✅

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

**Implementation notes:**
- Migration: `supabase/migrations/20260206050000_social_community.sql` — 5 tables, 6 indexes, 16 RLS policies
- Tests: `supabase/__tests__/00005_social_community.test.ts` — 34 integration tests
- Key decisions: polymorphic FK on content_reports.target_id (no DB constraint); no vote UPDATE policy (delete+re-insert); score denormalized (app-maintained, no trigger)
- Total integration tests: 169 (135 existing + 34 new); unit tests: 134

---

### Step 2.6 — Competitions & Events Tables ✅

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

**Implementation notes:**
- Migration: `supabase/migrations/20260206060000_competitions.sql` — 4 tables, RLS on all, ~13 policies, CHECK constraints on scoring_model/status/dates, indexes on gym_id/status/event_id/user_id.
- Tests: `supabase/__tests__/00006_competitions.test.ts` — 48 tests covering table existence (4), RLS enabled (4), events CRUD + constraints (6), event_routes (5), event_categories (4), competition_scores (7), RLS behavioral policies (18).
- Key fix: `events.created_by` uses `ON DELETE SET NULL` (nullable) rather than `NOT NULL` — these conflict because cascade-deleting a user through `auth.users → profiles` would try to SET NULL on a NOT NULL column.
- Total integration tests: 217 (48 new + 169 existing).

---

### Step 2.7 — Notifications & Saved Routes Tables ✅

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

**Implementation notes:**
- Migration: `supabase/migrations/20260206070000_notifications_saved.sql`
- Tests: `supabase/__tests__/00007_notifications_saved.test.ts` (44 tests)
- 4 tables: `notifications`, `push_tokens`, `notification_preferences`, `saved_routes`
- 14 RLS policies: notifications (3: SELECT own, UPDATE own, no INSERT/DELETE), push_tokens (3: SELECT/INSERT/DELETE own), notification_preferences (4: full CRUD own), saved_routes (4: full CRUD own)
- Indexes: `(user_id)` on all 4 tables, plus `(user_id, read)` composite on notifications for unread count queries
- Key design: notifications has no INSERT policy for authenticated — only system (SECURITY DEFINER triggers / service_role) can create notifications
- Total integration tests: 261 (44 new + 217 existing)

---

### ✅ Step 2.8 — Admin & Audit Tables

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

**Implementation notes (completed):**
- Migration: `supabase/migrations/20260206080000_admin_audit.sql` — 3 tables, 10 RLS policies, 1 SECURITY DEFINER trigger function, 5 indexes
- Tests: `supabase/__tests__/00008_admin_audit.test.ts` — 41 tests (tables exist, RLS enabled, CHECK constraints, trigger behavior, RLS policies, CASCADE deletes)
- Key decisions:
  - `audit_log` is append-only — no UPDATE/DELETE policies for any role, only SECURITY DEFINER trigger and service_role can INSERT
  - `audit_log.actor_id` uses ON DELETE SET NULL to preserve audit history when actors are deleted
  - `on_route_update` trigger uses IS DISTINCT FROM (not !=) to correctly handle NULL → value transitions for color/wall_section
  - `maintenance_tickets` INSERT uses no RETURNING when called by plain authenticated user because the SELECT policy requires setter+ role (Postgres RLS requires RETURNING rows to pass SELECT policies)
  - `maintenance_tickets` gym is resolved via subquery `(SELECT gym_id FROM routes WHERE id = route_id)` — same pattern as event_routes
- Total integration tests: 302 (41 new + 261 existing)

---

### ✅ Step 2.9 — Seed Data Script

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

**Implementation notes (completed):**
- Files created/updated: `supabase/seed.sql` (complete rewrite), `supabase/__tests__/00009_seed_data.test.ts` (new)
- Seed has 11 sections: gym (1), auth users (3), gym roles (3), style tags (8), routes (18), route-tag links (14), ascents (12), season (1), saved routes (2), notifications (2), maintenance ticket (1)
- Fixed UUIDs for all entities (gym: `10000000-...001`, users: `20000000-...00[1-3]`, routes: `30000000-...00[01-18]`)
- Ascents fire `on_ascent_insert` trigger chain — auto-populates `user_badges`, `user_streaks`, and `leaderboard_entries` (no manual inserts needed)
- Ascents spread across 4 consecutive weeks with `now() - interval 'X weeks'` to produce a 4-week streak → auto-earns "Weekly Warrior" badge
- Alex earns 12+ badges automatically: 9 grade badges (V0–V8) + 2 volume badges (First Send, 10 Sends) + 1 streak badge (Weekly Warrior)
- Total integration tests: 319 (17 new + 302 existing)
- Total unit tests: 134 (unchanged)

---

## Phase 3 — Authentication & Session Management

### Step 3.1 — Supabase Client Initialization ✅

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

**Implementation notes:**
- `lib/supabase.ts` was implemented during Phase 0 scaffolding (ExpoSecureStoreAdapter, typed createClient, env var config, PKCE flow)
- `lib/__tests__/supabase.test.ts` — 3 unit tests verifying instance type, secure storage adapter, and env var usage
- Tests spy on `createClient` to capture args while delegating to the real implementation for instanceof checks
- Total unit tests: 137 (134 existing + 3 new)

---

### Step 3.2 — Auth Service Layer ✅

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

**Implementation notes:**
- `services/auth.service.ts` — 7 thin wrapper methods around `supabase.auth.*` (signUp, signIn, signInWithProvider, signOut, resetPassword, getSession, onAuthStateChange)
- `services/__tests__/auth.service.test.ts` — 10 unit tests mocking `@/lib/supabase` via `jest.mock` with inline factory (avoids hoisting temporal dead zone issue)
- `services/index.ts` — re-exports `authService`, `OAuthProvider`, `AuthChangeEvent`, `Session`
- `OAuthProvider` type narrowed to `'google' | 'apple'` (only configured providers)
- All methods return raw `{ data, error }` shape — no unwrapping or throwing
- Total unit tests: 147 (137 existing + 10 new)

---

### Step 3.3 ✅ — useAuth Hook

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

**Implementation notes:**
- Created `services/profile.service.ts` — 2 methods (`getById`, `getRoles`) wrapping PostgREST queries
- Created `hooks/useAuth.ts` — useState + useEffect hook with `onAuthStateChange` as single source of truth
- `UserProfile` interface transforms snake_case DB columns to camelCase at the hook boundary
- `isAuthenticated` is computed (`session !== null`), not stored as separate state
- Role derivation uses `ROLES` array index from `lib/constants.ts` to pick highest privilege
- `signIn`/`signUp`/`signOut` delegate to authService and do NOT update state — `onAuthStateChange` callback handles all state transitions
- 8 new unit tests (2 profile service + 6 useAuth hook), 155 total unit tests
- Files: `services/profile.service.ts`, `services/__tests__/profile.service.test.ts`, `hooks/useAuth.ts`, `hooks/__tests__/useAuth.test.ts`, updated `services/index.ts`, `hooks/index.ts`

---

### Step 3.4 — Design System & UI Foundations ✅

**Depends on:** Step 3.3
**Relevant requirements:** NFR-UX1, NFR-UX2
**MCP servers:** `superpowers@superpowers-marketplace`, `frontend-design@claude-plugins-official`

**Input:** User provides Figma mockup screenshots in `Documentation/mockups/`. These are the source of truth for design intent — colors, typography, layout, and visual hierarchy are extracted directly from them.

**Reference:** [Anthropic's Prompting for Frontend Aesthetics cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb) — used to fill gaps the mockups don't cover (motion, micro-interactions, depth treatment) and to avoid falling back to generic defaults.

**What to produce:**

| Output | Description |
|---|---|
| `Documentation/DesignSystem.md` | Color palette (light + dark with CSS variables), typography scale, spacing tokens, border radii, shadows, motion/animation strategy, iconography guidelines, dark mode strategy — extracted from mockups |
| `Documentation/Wireframes.md` | Per-screen layout specs, component hierarchy, interaction notes, navigation flow diagrams — derived from mockup analysis |
| `tailwind.config.js` | Populated with actual design tokens extracted from the mockups (colors, fonts, spacing) — replaces the current empty/default config |
| Base UI components in `components/ui/` | Button, Input, Card, Badge, IconButton, Divider — built with NativeWind, typed with TypeScript, matching the mockup designs |

**What to clean up:**

- Remove or replace legacy StyleSheet-based components (`Themed.tsx`, `EditScreenInfo.tsx`, `StyledText.tsx`) that will be superseded by NativeWind-based primitives.

**Process (plugin-driven workflow):**

1. **Analyze mockup screenshots.** User places Figma exports in `Documentation/mockups/`. Claude reads the images and extracts design tokens: colors (hex values, light/dark), fonts, spacing scale, border radii, shadows, and layout patterns.
2. **Build an aesthetics prompt for gaps.** Using the Anthropic frontend aesthetics cookbook, craft a brief covering areas the static mockups don't show: motion strategy (page transitions, staggered reveals, micro-interactions), depth/background treatment, interaction feedback patterns, and loading/empty/error states. Tailored to the indoor climbing gym personality.
3. **Brainstorm gaps with `/superpowers:brainstorm`.** Feed the extracted tokens, the aesthetics prompt, and the mockup screenshots. Focus on what the mockups don't cover — motion, transitions, edge-case states. Answer clarifying questions. Produces a supplemental design plan.
4. **Generate design system with `/frontend-design:frontend-design`.** Feed the mockup screenshots and the combined design plan (extracted tokens + brainstorm output). Produces the component library and finalized token set.
5. **Write `Documentation/DesignSystem.md`** documenting all finalized tokens, font choices, color variables, spacing scale, motion guidelines, and usage rules.
6. **Write `Documentation/Wireframes.md`** with per-screen layout specs, component hierarchy, and interaction notes derived from the mockups.
7. **Populate `tailwind.config.js`** with the real design tokens so NativeWind classes map to the design system.
8. **Build base UI components** in `components/ui/` using NativeWind classes and the design tokens.
9. **Remove legacy styled components** that are no longer needed.
10. **Verify** all existing tests still pass (`npm test`, `npx tsc --noEmit`).

**Acceptance:** Design docs complete and reviewed, `tailwind.config.js` has real tokens, base UI components type-check, all existing tests pass.

**Implementation notes (completed 2026-02-06):**
- **Files created:** `Documentation/DesignSystem.md` (646 lines, 10 sections), `Documentation/Wireframes.md` (1,100 lines, 11 screens), `components/ui/Button.tsx`, `components/ui/TextInput.tsx`, `components/ui/Card.tsx`, `components/ui/Badge.tsx`, `components/ui/IconButton.tsx`, `components/ui/Divider.tsx`, `components/ui/Avatar.tsx`, `components/ui/index.ts` (barrel export)
- **Files modified:** `tailwind.config.js` (populated with 25+ color tokens, fontFamily, borderRadius, boxShadow), `constants/Colors.ts` (updated to match design system)
- **Files deleted:** `components/ui/Themed.tsx`, `components/ui/StyledText.tsx`, `components/ui/EditScreenInfo.tsx` (legacy Expo template components replaced by NativeWind)
- **Files updated:** `app/(tabs)/index.tsx`, `app/(tabs)/two.tsx`, `app/modal.tsx`, `app/+not-found.tsx` (rewritten to use NativeWind classes)
- **Tests:** 42 new component tests (Button: 12, TextInput: 8, Card: 5, Badge: 6, IconButton: 4, Divider: 2, Avatar: 5). Total unit tests: 197
- **Key decisions:** Dark-first design (primary theme), purple accent (#7C3AED), NativeWind v4 with Tailwind 3.x, lucide-react-native for icons, expo-image for Avatar, Pressable over TouchableOpacity, AppTextInput naming to avoid RN collision

---

### ✅ Step 3.5 — Auth Screens (Login, Register, Forgot Password)

**Depends on:** Step 3.4
**Relevant requirements:** FR-A1, FR-A4

**What to test (component tests):**

| Test case | Description |
|---|---|
| Login form renders | Email input, password input, submit button visible |
| Submit with empty fields | Shows validation errors |
| Submit with invalid email | Shows email validation error |
| Successful login | Calls `signIn`, navigates to home |
| Failed login | Shows error message from service |
| Register form renders | Email, display name, password fields |
| Short password | Shows min-length error (8 chars) |
| Forgot password renders | Email input + submit, success message on send |
| Social sign-in buttons | Google and Apple buttons visible (visual-only, OAuth in later phase) |
| Auth gate loading | Returns null while isLoading (splash stays visible) |
| Auth gate unauthenticated | Redirects to (auth)/login |
| Auth gate authenticated | Renders Slot (main app) |

**What to implement:**

- `app/(auth)/login.tsx`: form with React Hook Form + Zod, calls `useAuth().signIn`
- `app/(auth)/register.tsx`: form with display name + password strength indicator
- `app/(auth)/forgot-password.tsx`: email-only form
- `app/(auth)/_layout.tsx`: stack navigator for auth flow

**Acceptance:** Auth screens render correctly; form validation works; navigation flows complete.

**Implementation notes:**
- Files created: `app/(auth)/_layout.tsx`, `app/(auth)/login.tsx`, `app/(auth)/register.tsx`, `app/(auth)/forgot-password.tsx`, `app/_layout.tsx` (rewritten)
- Tests: 30 new unit tests (11 login + 10 register + 6 forgot-password + 3 auth gate)
- Total unit tests: 227
- Key patterns: react-hook-form Controller + zodResolver, AuthGate with Redirect, QueryClientProvider in root layout
- Password strength indicator (visual-only, 0-4 scale)
- Social OAuth buttons rendered but non-functional (needs deep link config in later phase)

---

### ✅ Step 3.6 — Root Layout & Auth Gate

**Depends on:** Step 3.5
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

**Implementation notes:** Fully implemented as part of Step 3.5. AuthGate component exported separately for testability, uses Redirect for URL-based navigation. 3 tests included in Step 3.5 test count.

---

### Step 3.7 — AppTextInput Enhancements (Left Icons & Password Toggle) ✅

**Depends on:** Step 3.4
**Relevant requirements:** NFR-8, FR-A1

> **Implementation notes (2026-02-06):**
> - Extended `components/ui/TextInput.tsx` with `leftIcon`, `rightIcon` props and automatic Eye/EyeOff password toggle when `secureTextEntry` is true
> - Added 5 new tests to `components/ui/__tests__/TextInput.test.tsx` (total: 13 component tests)
> - Updated auth screens: `login.tsx` (Mail), `register.tsx` (Mail, User), `forgot-password.tsx` (Mail)
> - Key decision: custom `rightIcon` takes priority over built-in password toggle
> - Also fixed AuthGate infinite redirect loop (replaced `<Redirect>` with `useEffect` + `router.replace`, always renders `<Slot />`)
> - Total unit tests: 235

**What to test (`components/ui/__tests__/TextInput.test.tsx` — extend existing tests):**

| Test case | Description |
|---|---|
| Left icon renders | When `leftIcon` prop provided, icon appears to the left of input text |
| Right icon renders | When `rightIcon` prop provided, icon appears to the right |
| Password toggle | `secureTextEntry` field with eye icon toggles between visible/hidden text |
| No icons by default | Without icon props, input renders as before (no regression) |

**What to implement (`components/ui/TextInput.tsx` — extend):**

- Add optional `leftIcon` prop (Lucide icon component) — renders icon inside the input container, left-aligned.
- Add optional `rightIcon` prop — renders icon on the right side.
- Add built-in password visibility toggle: when `secureTextEntry` is true, automatically show an `Eye`/`EyeOff` toggle icon as `rightIcon` (unless a custom `rightIcon` is provided).
- Update `AppTextInput` styles: add `pl-10` padding when leftIcon is present so text doesn't overlap the icon.

**Why:** The Login and Sign Up wireframes show text inputs with left icons (Mail, Lock, User) and a password visibility toggle (Eye/EyeOff). These are standard UX patterns that improve form usability — the icon provides a visual cue about what the field expects, and the eye toggle lets users verify their password without retyping.

**Acceptance:** Extended component tests pass; existing tests still pass (backward-compatible).

---

## Phase 4 — Gym, Route & Tab Data Layer

### Step 4.1 — Routes Service ✅

**Depends on:** Phase 3 (Step 3.1 for Supabase client), Phase 2 (tables)
**Relevant requirements:** FR-C1, FR-C3, FR-C7

> **Implementation notes (2026-02-06):**
> - Created `services/routes.service.ts` with `getRoutes(filters)` and `getRouteById(id)`
> - `RouteFilters` interface: gymId (required), gradeMin, gradeMax, status, sortBy, search
> - Default filters: active + retiring_soon, newest first
> - `getRouteById` joins setter profile via embedded select (`profiles!setter_id`)
> - 6 unit tests in `services/__tests__/routes.service.test.ts`
> - Exported from `services/index.ts` barrel
> - Total unit tests: 241

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

### Step 4.2 — useRoutes Hook ✅

**Depends on:** Step 4.1
**Relevant requirements:** FR-C3

> **Implementation notes (2026-02-06):**
> - Created `hooks/useRoutes.ts` with `useRoutes(filters)` and `useRouteDetail(routeId)`
> - Query keys: `["routes", filters]` for lists, `["routes", routeId]` for detail
> - queryFn unwraps Supabase `{ data, error }` — throws on error, returns data
> - 5 unit tests in `hooks/__tests__/useRoutes.test.tsx`
> - Total unit tests: 246

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

### Step 4.3 — Gym Service & Hook ✅

**Depends on:** Phase 3 (Step 3.1), Phase 2 (tables)
**Relevant requirements:** FR-B1, FR-B4

> **Implementation notes (2026-02-06):**
> - Created `services/gyms.service.ts` with `getGyms()`, `getGymById(id)`, `setHomeGym(userId, gymId)`
> - Created `hooks/useGyms.ts` with `useGyms()`, `useGym(id)`, `useSetHomeGym()`
> - `useSetHomeGym` uses `useMutation` + invalidates `["auth"]` cache on success
> - Added `jest.setup.ts` with TanStack Query `notifyManager.setScheduler` for sync mutation tests
> - 3 service tests + 5 hook tests = 8 new tests
> - Total unit tests: 254

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

### Step 4.4 — Route Card Component ✅

**Depends on:** Steps 4.2, 1.1 (grade conversion)
**Relevant requirements:** FR-C1, FR-C7

> **Implementation notes (2026-02-06):**
> - Created `components/routes/RouteCard.tsx` — presentational card composing Card + Badge
> - Props: `route` (RouteCardRoute), `userGradeSystem`, `onPress`, `isSent`
> - Status dot: green (active), amber (retiring_soon), gray (archived)
> - Color swatch: inline backgroundColor from route.color (conditional)
> - Style tags: Badge chips with "tag" variant
> - Grade via `canonicalToDisplay()`, null name fallback to "Unnamed Route"
> - 13 component tests in `components/routes/__tests__/RouteCard.test.tsx`
> - Total unit tests: 267

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

### Step 4.5 — Tab Bar Layout with FAB ✅

**Depends on:** Phase 3 (Step 3.6 — root layout)
**Relevant requirements:** NFR-8

**What to test (`app/(tabs)/__tests__/_layout.test.tsx`):**

| Test case | Description |
|---|---|
| Renders 4 tab slots + FAB | Home, Map Browse, center FAB, Leaderboards, Profile tabs visible |
| FAB button renders | Center slot is a 56x56 purple circle with Plus icon, elevated above tab bar |
| Active tab highlighting | Tapping a tab changes its icon color to accent (#7C3AED) |
| FAB opens start session | Pressing the FAB navigates to Start Session modal |
| Tab bar hidden on detail screens | Tab bar not visible on gym/[id], profile/[userId], etc. |

**What to implement (`app/(tabs)/_layout.tsx`):**

- Custom tab bar component using Expo Router's `Tabs` with `tabBar` prop.
- 4 tabs + center FAB: Home (Home icon), Map Browse (MapPin icon), center FAB (Plus icon), Leaderboards (Trophy icon), Profile (User icon).
- FAB: 56x56px circle, `bg-accent`, elevated ~12px above tab bar. Uses `expo-haptics` for feedback.
- Active/inactive colors: `accent` (#7C3AED) when active, `text-muted` when inactive.

**Acceptance:** Custom tab bar renders; FAB elevated; navigation works for all tabs + FAB.

**Implementation notes:**
- Created `components/navigation/CustomTabBar.tsx` — 4 tabs + center FAB with haptic feedback
- Tabs: Home (Home icon), Map (MapPin), Leaderboards (Trophy), Profile (User)
- FAB: 56x56 accent circle, `router.push("/start-session")`, `expo-haptics` Medium impact on press
- Platform-specific shadow via `Platform.select` for FAB glow effect (iOS shadow props + Android elevation)
- Replaced `two.tsx` with `map.tsx`, `leaderboards.tsx`, `profile.tsx` placeholders
- Created `app/start-session.tsx` modal placeholder (outside tabs group, no tab bar shown)
- 5 tests in `components/navigation/__tests__/CustomTabBar.test.tsx`
- 3 tests in `app/(tabs)/__tests__/_layout.test.tsx`

---

### Step 4.6 — Gym Routes Screen ✅

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
| Navigates to detail | Tapping card goes to route detail screen |
| Back navigates to gym | Back button returns to Gym Main Page |

**What to implement (`app/gym/[id]/routes.tsx`):**

- FlatList with `useRoutes()` hook (gymId from route params).
- Filter bar component (grade range, tags, sort).
- Zustand `uiStore` for persisting active filters.
- Pull-to-refresh wired to `refetch()`.

**Acceptance:** Screen renders routes for a gym; filters work; navigation correct.

**Implementation notes:**
- Created `stores/routeFilterStore.ts` — Zustand store with per-gym grade range + sort filter persistence (keyed by gymId)
- Created `components/routes/FilterBar.tsx` — horizontal pill buttons for min/max grade pickers (modal with scrollable grade list) and sort toggle
- Created `app/gym/_layout.tsx` — Stack navigator for gym screens (outside tabs, provides back navigation)
- Created `app/gym/[id]/routes.tsx` — FlatList of RouteCard components with FilterBar, loading/empty/error states, pull-to-refresh
- Updated `stores/index.ts` barrel export
- `style_tags` passed as `[]` to RouteCard (query join not yet implemented)
- `userGradeSystem` hardcoded to `"v-scale"` (user preferences not yet implemented)
- Tests: 4 store + 4 FilterBar + 6 screen = 14 new tests (289 unit total)

---

### Step 4.7 — Route Detail Screen ✅

**Depends on:** Steps 4.2, 4.4
**Relevant requirements:** FR-C1, FR-C2, FR-C4, FR-C7, FR-G2

**What to test:**

| Test case | Description |
|---|---|
| Renders route info | Grade, color, wall section, setter, status |
| Grade conversion display | Shows grade in user's preferred system |
| Beta videos section | Lists video submissions as feed with sender comments |
| Favorite button | Tapping toggles favorite state |
| Add Ascent button | Button visible; prompts start session if no active session |
| Status banner | Retiring Soon routes show warning banner |
| Back navigates to routes | Back button returns to Gym Routes |

**What to implement (`app/gym/[gymId]/route/[routeId].tsx`):**

- Fetch route detail via `useRouteDetail(routeId)`.
- Sections: header (grade/color/status), video submissions feed, ascent CTA.
- Favorite toggle → `saved_routes` insert.
- "Add Ascent" → if active session, log ascent; if not, prompt to start session.

**Acceptance:** Route detail screen renders fully with seeded data.

**Implementation notes:**
- Created `services/savedRoutes.service.ts` — thin Supabase wrapper for saved_routes CRUD (getSavedRoute, saveRoute, unsaveRoute) with manual `SavedRoute` type (database.types.ts not yet regenerated for this table)
- Created `hooks/useSavedRoutes.ts` — `useIsFavorite(routeId)` query hook and `useToggleFavorite(routeId)` mutation hook using TanStack Query, reads current user from `useAuth()`
- Created `app/gym/[id]/route/[routeId].tsx` — ScrollView layout with color swatch, metadata column (name, grade, set date, wall section, setter, status badge), star favorite toggle, "Add Ascent" placeholder button (Alert.alert until Phase 5), "Video Submissions" empty state section (until Phase 12), conditional "Retiring Soon" banner
- Used `fromSavedRoutes()` helper with `any` cast to bypass TypeScript until `supabase gen types` is re-run
- `userGradeSystem` hardcoded to `"v-scale"` (user preferences not yet implemented)
- Color swatch used as visual identifier instead of route photo (no image column in routes table)
- Tests: 4 service + 5 hook + 9 screen = 18 new tests (307 unit total)

---

### Step 4.8 — Gym Main Page ✅

**Depends on:** Step 4.3 (Gym Service & Hook)
**Relevant requirements:** FR-B1, FR-B4
**Wireframe ref:** Screen 8 (Gym Main Page) in `Documentation/Wireframes.md`

**What to test (`app/gym/__tests__/[id].test.tsx`):**

| Test case | Description |
|---|---|
| Renders gym name | Gym name displayed in heading |
| Renders gym address | MapPin icon + address text visible |
| Renders operating hours | Clock icon + hours text visible |
| Open/closed indicator | Red dot when closed, green when open |
| Social media handle | Social handle displayed in accent-light color |
| Favorite toggle | Star icon toggleable |
| Routes navigation card | "Routes" card navigates to Gym Routes |
| Leaderboards navigation card | "Leaderboards" card navigates to Gym Leaderboards |
| Style Analysis navigation card | "Style Analysis" card present |
| Start Session button | Big "Start Session" button starts a session at this gym |
| Loading state | Spinner shown while fetching gym data |

**What to implement (`app/gym/[id].tsx`):**

- Fetch gym via `useGym(id)` hook.
- Header: gym logo, gym name, star favorite button.
- Metadata: address, hours with open/closed indicator, social handle.
- Three navigation cards: Routes, Leaderboards, Style Analysis.
- Big "Start Session" button (primary CTA).

**Acceptance:** Gym Main Page renders with all metadata; navigation cards route correctly.

**Implementation notes (2026-02-09):**
- Created `app/gym/[id]/__tests__/index.test.tsx` — 11 tests covering gym name, address with MapPin, hours placeholder with Clock, no open/closed dot (no hours data), social handle from social_links JSONB, favorite toggle calling useSetHomeGym, gold star when home gym, Routes card navigation, Leaderboards/Style Analysis coming soon alerts, loading spinner
- Created `app/gym/[id]/index.tsx` — ScrollView layout with Avatar initials fallback (no logo_url column), gym name + Star IconButton (gold when home gym), MapPin + address, Clock + "Hours not available" placeholder, Instagram handle from social_links, "Start Session" Button (Alert placeholder for Phase 5), three Card navigation tiles (Routes navigates, Leaderboards/Style Analysis show Alert.alert)
- Data gaps noted: no `operating_hours` column → "Hours not available"; no `logo_url` → Avatar initials; no `saved_gyms` table → reuses `home_gym_id` from profiles via `useSetHomeGym()`
- Test 4 adjusted from dev plan's "red/green dot" spec: since no `operating_hours` column exists, we verify the dot is absent rather than testing its color
- Tests: 11 new screen tests (300 unit total, 636 total with integration)

---

### Step 4.9 — Map Browse Screen ✅

**Depends on:** Steps 4.3, 4.8
**Relevant requirements:** FR-B1, FR-B5, NFR-8
**Wireframe ref:** Screen 9 (Map Browse) in `Documentation/Wireframes.md`

**What to test (`app/(tabs)/__tests__/map.test.tsx`):**

| Test case | Description |
|---|---|
| Map renders | MapView component visible |
| Gym markers displayed | Pins shown at gym coordinates |
| Search bar renders | Search input overlaid on map |
| Favorites filter renders | Star filter icon visible |
| Bottom sheet shows gym count | Collapsed bottom sheet shows "N gyms" text |
| Tap marker navigates | Tapping a gym marker navigates to Gym Main Page |
| Search filters markers | Typing in search filters visible gyms |

**What to implement (`app/(tabs)/map.tsx`):**

- `react-native-maps` or Expo MapView — full-screen interactive map.
- Gym markers at each gym's latitude/longitude.
- Search bar with star filter for favorites.
- Bottom sheet with gym list; tapping navigates to `app/gym/[id].tsx`.

**Acceptance:** Map renders with pins; search filters work; navigation to Gym Main Page works.

**Implementation notes:**
- Installed `react-native-maps` via `npx expo install react-native-maps`
- Replaced placeholder `app/(tabs)/map.tsx` with full MapView + Marker implementation
- Filtering pipeline: useMemo with 3 stages (valid coords → search query → favorites toggle)
- Uses `initialRegion` (not `region`) so users can pan/zoom freely after initial render
- Plain RN `TextInput` for search overlay (not AppTextInput — no visible label needed on map)
- `as any` cast on `router.push()` for typed routes compatibility (matching existing pattern)
- Tests: 7 new screen tests (307 unit total, 625 total with integration)

---

### Step 4.10 — Enrolled Leaderboards Tab ✅

**Depends on:** Steps 4.5 (tab bar)
**Relevant requirements:** FR-G1

**What to test:**

| Test case | Description |
|---|---|
| Shows loading state | Spinner while fetching |
| Renders leaderboard list | List of enrolled leaderboards with gym logo, name, rank |
| Empty state | "No enrolled leaderboards" message with CTA |
| Tap navigates to detail | Tapping leaderboard goes to Leaderboard Detail |

**What to implement (`app/(tabs)/leaderboards.tsx`):**

- Fetch user's enrolled leaderboards (service + hook to be built in Phase 9).
- List cards with gym logo, competition name, rank, points, status badge.
- Empty state with trophy icon and "Find gyms" button.

**Acceptance:** Tab renders placeholder or real data; navigation to leaderboard detail works.

**Implementation notes:**
- Created `hooks/useEnrolledLeaderboards.ts` — stub hook returning empty data (Phase 9 replaces with TanStack Query)
- Exported `EnrolledLeaderboard` interface with id, gym_id, gym_name, period, rank, score, total_participants
- Replaced placeholder in `app/(tabs)/leaderboards.tsx` with three-state screen (loading, empty, data)
- Data state uses FlatList with Pressable cards showing rank badge, gym name, period, formatted score, chevron
- Empty state shows Trophy icon, "No enrolled leaderboards" message, and "Find Gyms" Button CTA
- Created `app/(tabs)/__tests__/leaderboards.test.tsx` — 4 tests using __mockData pattern
- Tests: 4 new screen tests (311 unit total)

---

### Step 4.11 — Start Session Modal ✅

**Depends on:** Steps 4.3, 4.5
**Relevant requirements:** FR-D4, FR-B5

**What to test:**

| Test case | Description |
|---|---|
| Shows loading state | Detecting location spinner |
| Shows nearest gym prompt | "Start session at [gym name]?" displayed |
| Yes button starts session | Tapping "Yes" navigates to Gym Main Page with active session |
| No button goes to map | Tapping "No" navigates to Map Browse |
| Location error fallback | If location unavailable, redirects to Map Browse |

**What to implement (`app/start-session.tsx`):**

- Modal screen triggered by FAB.
- Detect user location via `expo-location`.
- Find nearest gym from gym list (distance calculation).
- Prompt: "Start session at [closest gym]?"
- Yes → start session at gym, navigate to Gym Main Page.
- No → navigate to Map Browse to pick manually.

**Acceptance:** Modal opens from FAB; location detection works; both paths navigate correctly.

**Implementation notes:**
- Created `utils/geo.ts` — Haversine distance function + `findNearestGym` helper (pure, no deps)
- Created `utils/__tests__/geo.test.ts` — 7 tests (known distance, zero distance, antipodal, findNearestGym picks closest, empty list, null coords, mixed coords)
- Replaced `app/start-session.tsx` — three-state modal (loading/prompt/error) using expo-location + useGyms + findNearestGym
- Updated `app/_layout.tsx` — added `<Stack.Screen name="start-session" options={{ presentation: "modal" }} />`
- Created `app/__tests__/start-session.test.tsx` — 5 tests covering all modal states and navigation paths
- Updated `app/__tests__/_layout.test.tsx` — fixed Stack mock to support Stack.Screen children
- Installed `expo-location` dependency
- Unit tests: 341 total (336 → 341, +5 start-session + 7 geo = +12 new, -7 dedup = net +5 file-level)

---

## Phase 5 — Tick-Logging & Sessions

### Step 5.1 — Session Store (Zustand) ✅

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

**Implementation notes:**
- Created `stores/sessionStore.ts` — Zustand store with `SessionState` interface, `PendingLog` type (reuses `AscentStatus` from `@/lib/constants`), `INITIAL_STATE` constant for reset, `gymId` field for per-gym sessions
- Created `stores/__tests__/sessionStore.test.ts` — 6 tests covering all actions, uses `jest.spyOn(Date, 'now')` for deterministic duration assertions
- Updated `stores/index.ts` — added `useSessionStore` export
- Unit tests: 347 total (341 → 347, +6 session store tests)

---

### Step 5.2 — Sessions Service ✅

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

**Implementation notes (Step 5.2):**
- Created `services/sessions.service.ts` with 4 methods: `createAscent`, `deleteAscent`, `getSessionSummary`, `getSessionHistory`
- `createAscent`/`deleteAscent` are thin PostgREST wrappers; `getSessionSummary`/`getSessionHistory` are async aggregation methods that fetch rows with route grade joins and reduce in JS
- Exported types: `AscentLog`, `Ascent`, `SessionSummary`, `SessionHistoryEntry`
- Created `services/__tests__/sessions.service.test.ts` — 5 tests passing
- Updated `services/index.ts` with service and type exports
- Unit tests: 352 total (5 new)

---

### Step 5.3 — useSession Hook ✅

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

**Implementation notes:**
- Created `hooks/useSession.ts` — coordinates Zustand sessionStore + sessionsService via TanStack mutations. Returns store state (isActive, pendingLogs, duration, etc.), store actions (startSession, endSession, reset), and mutations (logAscent, deleteAscent). logAscent uses optimistic updates via onMutate/onError, deleteAscent is simple. Both invalidate `["sessions"]` query key on settle.
- Created `hooks/__tests__/useSession.test.tsx` — 4 tests using real Zustand store + mocked service/auth. Key learning: Date.now mock must use non-zero start time because store uses `startTime ?` (0 is falsy).
- Updated `hooks/index.ts` — exported useSession and LogAscentInput type.
- Unit tests: 356 total (4 new)

---

### Step 5.4 — QuickLog Bottom Sheet ✅

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

**Implementation notes:**
- Created `components/session/QuickLogSheet.tsx` — modal-based bottom sheet using RN `Modal` with `animationType="slide"` + `transparent` backdrop (avoids `@gorhom/bottom-sheet` dependency for a simple form). Internal state: status (`AscentStatus | null`), attempts (stepper 1–99, locked to 1 for flash), notes (free text). Uses `useSession().logAscent.mutate()` for fire-and-forget submission with `expo-haptics` notification on confirm. `useEffect` resets form when `visible` transitions to false.
- Created `components/session/__tests__/QuickLogSheet.test.tsx` — 6 tests mocking useSession (logAscent.mutate), expo-haptics, and lucide-react-native. Tests use role-based queries (`getByRole("button", { name })`) to disambiguate title text from button label.
- Unit tests: 362 total (6 new)

---

### Step 5.5 — Session Timer & Summary ✅

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

**Implementation notes:**
- Created `utils/time.ts` with `formatElapsedTime(ms)` — clamps negatives, floors sub-seconds, pads HH:MM:SS (8 tests)
- Created `components/session/SessionTimer.tsx` — reads `useSession()` for `isActive`/`startTime`, 1s `setInterval` with `Date.now() - startTime` per tick (4 tests)
- Created `components/session/SessionSummary.tsx` — presentational props-only card with Card/Badge/Divider, optional grade distribution bars via percentage-width Views (7 tests)
- Created `components/session/index.ts` — barrel export for QuickLogSheet, SessionTimer, SessionSummary
- Total: 19 new unit tests, 381 unit tests total

---

### Step 5.6 — Logbook Screen ✅

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

**Implementation notes:**
- Added `AscentWithRoute` type + `getSessionAscents()` to `services/sessions.service.ts`
- Added `getUserSavedRoutes()` to `services/savedRoutes.service.ts`
- Created `hooks/useSessions.ts` — `useSessionHistory()` + `useSessionDetail(date)` hooks (6 tests)
- Added `useSavedRoutesList()` to `hooks/useSavedRoutes.ts` (3 new tests, 8 total)
- Modified `app/(tabs)/_layout.tsx` — added logbook screen with `href: null` (hidden tab)
- Created `app/(tabs)/logbook/_layout.tsx` — Stack navigator with dark header + back button
- Created `app/(tabs)/logbook/index.tsx` — Sessions/Saved segmented control + FlatList (7 tests)
- Created `app/(tabs)/logbook/[date].tsx` — SessionSummary card + inline ascent list (5 tests)
- Used `[date]` instead of `[sessionId]` since sessions are implicit date groupings
- Total: 21 new unit tests, 402 unit tests total

---

### Step 5.7 — Start Activity Screen ⏭️ SKIPPED

**Skipped:** The `gyms` table has no `country`/`city` columns, so cascading country → city → gym dropdowns aren't feasible. The existing `app/start-session.tsx` (Step 5.5) already satisfies the "Start Activity" requirement — it renders nearby gyms using `useGyms()` and starts a session via `sessionStore.startSession(gymId)`.

**Depends on:** Steps 4.3 (Gym Service), 5.1 (Session Store)
**Relevant requirements:** FR-D4, FR-B4
**Wireframe ref:** Screen 7 (Start Activity) in `Documentation/Wireframes.md`, `Documentation/mockups/Start Activity.png`

**What to test (`app/(tabs)/__tests__/activity.test.tsx`):**

| Test case | Description |
|---|---|
| Renders country dropdown | Country selector visible with label |
| Renders city dropdown | City selector visible with label |
| Renders gym dropdown | Gym selector visible with label |
| Cascading filter: country → city | Changing country updates city options |
| Cascading filter: city → gym | Changing city updates gym options |
| Start Activity button | Button present and enabled when gym selected |
| Button disabled without gym | Button disabled/dimmed when no gym selected |
| Starts session on press | Pressing "Start Activity" calls `sessionStore.startSession()` with selected gym |
| Navigates after start | After starting, navigates to Route Browse filtered to selected gym |

**What to implement (`app/(tabs)/activity.tsx`):**

- Three cascading dropdown selectors (Country → City → Gym) using `AppTextInput` (dropdown variant) or a custom picker component.
- Data flow: `useGyms()` hook fetches all gyms → group by country → filter cities by selected country → filter gyms by selected city.
- "Start Activity" button: calls `sessionStore.startSession(gymId)`, then navigates to Route Browse.
- Pre-select user's home gym (from `useAuth().user.homeGymId`) if set.
- Layout: dropdowns stacked vertically with spacer pushing button to bottom of screen.

**Why:** The Start Activity screen is the entry point for every climbing session. The cascading dropdown pattern prevents invalid combinations (e.g., gym in Porto but city set to Lisbon). Pre-selecting the home gym reduces friction for daily climbers.

**Acceptance:** Cascading selectors work correctly; session starts; navigation to route browse works.

---

### Step 5.8 — Full Ascent Form Screen ✅

**Depends on:** Steps 5.3 (useSession), 4.6 (Route Detail)
**Relevant requirements:** FR-D1, FR-C2, FR-G2
**Wireframe ref:** Screen 6 (Ascent Form) in `Documentation/Wireframes.md`, `Documentation/mockups/Ascent.png`

**What to test (`app/route/[id]/__tests__/ascent.test.tsx`):**

| Test case | Description |
|---|---|
| Route header card renders | Route photo, ID, grade, rating, send status visible |
| Star rating renders | 5 tappable stars visible |
| Star rating interactive | Tapping star N fills stars 1–N with gold |
| Video upload button renders | "Add Beta Video" button visible |
| Comment textarea renders | Comment input with placeholder visible |
| Character counter | Shows current/max character count (0/200) |
| Style tags render | All climbing style tags displayed |
| Style tags multi-select | Tapping tag toggles selection state |
| Submit button renders | "Add Ascent" button visible |
| Submit calls logAscent | Valid submission calls `useSession().logAscent()` with rating, tags, comment |
| Submit navigates back | Successful submission navigates back to Route Detail |
| Empty submit allowed | Rating, video, comment, tags are all optional |

**What to implement (`app/route/[id]/ascent.tsx`):**

- Route header card: `Card` with route photo, ID, grade, rating, send status (same metadata as Route Detail header).
- Star rating: custom `StarRating` component — 5 `IconButton`s (Star icon), tappable, fill with `gold` color up to selected value.
- Video upload: `Button` (variant: "secondary", dashed border) labeled "Add Beta Video" — opens camera/gallery picker (real upload logic in Phase 12, visual-only for now).
- Comment section: multiline `TextInput` with `maxLength={200}`, character counter text below (`{length}/200`).
- Style tags: `Badge` (variant: "tag") components in a `flex-row flex-wrap` grid. Multi-select — tapped tags get full color, unselected get muted/outline style. Tags: Power, Finger Strength, Footwork, Dynamic Movement, Core Strength, Technique.
- Submit: `Button` (variant: "primary") calls `useSession().logAscent()` with assembled payload, then navigates back.

**Why:** The wireframe shows a rich ascent form that goes beyond the QuickLog bottom sheet (Step 5.4). While QuickLog is for fast tap-and-go logging (Flash/Send/Attempt + attempts count), this full-screen form captures detailed feedback: how the user rates the route, which climbing styles were involved, beta comments, and video. This data feeds the gamification, social, and analytics systems.

**Acceptance:** All form elements render; star rating interactive; tags multi-selectable; submission creates ascent with all metadata; navigation works.

**Implementation notes:**
- Files created: `components/ui/StarRating.tsx`, `app/gym/[id]/route/[routeId]/ascent.tsx`, `app/gym/[id]/route/[routeId]/_layout.tsx`
- Files modified: `lib/constants.ts` (added `STYLE_TAGS` + `StyleTagKey`), `lib/__tests__/constants.test.ts` (1 new test), `app/gym/[id]/route/[routeId]/index.tsx` (renamed from `[routeId].tsx`, updated "Add Ascent" to navigate to `/ascent` sub-route)
- Route directory restructured: `[routeId].tsx` → `[routeId]/index.tsx` + `_layout.tsx` to support sub-routes
- Test files: `components/ui/__tests__/StarRating.test.tsx` (4 tests), `app/gym/[id]/route/[routeId]/__tests__/ascent.test.tsx` (12 tests), `app/gym/[id]/route/[routeId]/__tests__/index.test.tsx` (moved + updated)
- Style tags are UI-only (tracked in component state, not persisted — no DB column yet)
- Star rating maps to `perceivedGrade` field (1–5 scale, stored directly)
- Video upload is a placeholder (Phase 12) — shows Alert on press
- Total unit tests: 419

---

## Phase 6 — Offline Support

### Step 6.1 — Offline Store & SQLite Queue ✅

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

**Implementation notes:**
- Created `lib/offlineDb.ts` — pure SQLite CRUD wrapper with lazy DB init (insertQueueItem, deleteQueueItem, getAllQueueItems, incrementRetryCount, clearQueue)
- Created `stores/offlineStore.ts` — Zustand store with dual-write pattern (in-memory + SQLite), hydrate() for app startup
- Added `OFFLINE_ACTION_TYPES`, `OfflineActionType`, `MAX_OFFLINE_RETRIES`, `OFFLINE_DB_NAME` to `lib/constants.ts`
- Exported `useOfflineStore` and `OfflineAction` from `stores/index.ts`
- 11 new store tests + 6 new constants tests = 17 new unit tests (436 total)

---

### Step 6.2 — Offline Route Cache ✅

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

**Implementation notes (2026-02-10):**
- Added `ROUTE_CACHE_TTL_MS` constant (24h) to `lib/constants.ts`
- Extended `lib/offlineDb.ts` with `cached_routes` table + `upsertCachedRoutes`, `getCachedRoutesByGym`, `clearCachedRoutes`
- Created `lib/routeCache.ts` — business logic layer: serialization, TTL checks, gym scoping
- Modified `hooks/useRoutes.ts` — write-through on success, fallback on error
- New tests: 7 in `lib/__tests__/routeCache.test.ts`, 3 in `hooks/__tests__/useRoutes.test.tsx`, 1 in `lib/__tests__/constants.test.ts` = 11 new unit tests
- Total tests: 447 unit + 318 integration = 765

---

### Step 6.3 — Sync Engine ✅

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

**Implementation notes (Step 6.3):**
- Installed `@react-native-community/netinfo` for event-driven network status
- Created `lib/syncEngine.ts` — pure async `drainQueue()` with dependency injection for testability; `replayAction()` maps `log_ascent` → `createAscent`, `delete_ascent` → `deleteAscent`
- Created `lib/__tests__/syncEngine.test.ts` — 8 tests covering FIFO order, dequeue on success, retry on failure, skip at MAX_OFFLINE_RETRIES, action mapping, idempotent deletes, accurate SyncResult counts
- Created `hooks/useOfflineSync.ts` — subscribes to NetInfo, triggers drain on offline→online transition, invalidates `["sessions"]` query key, schedules exponential backoff retries via SYNC_BACKOFF_DELAYS
- Created `hooks/__tests__/useOfflineSync.test.ts` — 7 tests using captured-callback pattern (same as useAuth tests)
- Added `SYNC_BACKOFF_DELAYS = [1000, 4000, 16000]` to `lib/constants.ts` + 1 test
- Updated `app/_layout.tsx`: imports shared `queryClient` from `lib/queryClient.ts` (replaces local `new QueryClient()`), added `<SyncManager />` component, added `hydrate()` call in useEffect
- Total: 16 new tests (8 syncEngine + 7 useOfflineSync + 1 constant), 463 unit tests total

---

## Phase 7 — QR/NFC Scanning

### Step 7.1 — QR Scanner Screen ✅

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

**Implementation notes:**
- Installed `jose` (isomorphic JWT library) for JWT verification without Node.js crypto
- Added `jose` to jest.config.js `transformIgnorePatterns` allow-list (ESM-only package)
- Created `utils/qr.ts` — `verifyQrToken()` with `QrPayload` and `QrResult` types
- Created `app/(tabs)/scan.tsx` — camera permission flow, CameraView with QR scanning, success/error overlays with View Route + Quick Log actions
- Added `QR_PUBLIC_KEY` (EC P-256 JWK placeholder) to `lib/constants.ts`
- Registered scan screen in `app/(tabs)/_layout.tsx` with `href: null` (hidden tab)
- Added FAB long-press action menu to `CustomTabBar.tsx` with "Scan QR Code" option
- Total: 15 new unit tests (6 qr.ts + 6 scan.tsx + 2 CustomTabBar + 1 constants), 478 unit tests total

---

### Step 7.2 — QR Signing Edge Function ✅

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

**Implementation notes (Step 7.2):**
- Files created: `supabase/functions/sign-qr/index.ts` (Edge Function), `supabase/.env.local` (private key, gitignored), `supabase/__tests__/00010_qr_signing.test.ts` (8 integration tests), `utils/__tests__/qr-roundtrip.test.ts` (1 unit test)
- Files modified: `lib/constants.ts` (real EC P-256 public key), `tsconfig.json` (exclude `supabase/functions` — Deno uses different module system)
- Generated real EC P-256 keypair; private key stored as `QR_PRIVATE_KEY` env var, public key embedded in app
- Edge Function uses service role client for DB queries (bypasses RLS for route/role lookup), user identity verified via `auth.getUser()`
- Requires `--no-verify-jwt` flag with `supabase functions serve` (newer Supabase auth issues ES256 tokens which the gateway may not validate correctly; function handles its own auth)
- Test counts: 479 unit tests (+1), 326 integration tests (+8) = 805 total

---

## Phase 8 — Gamification

### Step 8.1 — Badge Award Engine ✅

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

**Implementation notes (Step 8.1):**
- Migration `20260210113100_add_first_flash_badge.sql`: expanded `badges.criteria_type` CHECK constraint to include `'first_flash'`, replaced `check_and_award_badges()` with new `first_flash` ELSIF branch, seeded "First Flash" badge (19 total badges)
- `services/gamification.service.ts`: thin Supabase wrappers for `getBadges`, `getUserBadges`, `getUserStreak`, `getLeaderboard`
- `hooks/useBadges.ts`: `useBadges()`, `useUserBadges(userId)`, `useUserStreak(userId)` TanStack Query hooks
- `hooks/useLeaderboard.ts`: `useLeaderboard(gymId, period)` TanStack Query hook
- Regenerated `lib/types/database.types.ts` with gamification table types
- Updated barrel exports: `services/index.ts`, `hooks/index.ts`
- Tests: +4 integration (00004: 15→19), +7 service unit, +10 badge hook unit, +3 leaderboard hook unit = +24 new tests
- Updated 00009 seed data badge count assertion (18→19)

---

### Step 8.2 — Badge Display on Profile ✅

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

**Implementation notes:**
- Migration `20260210120000_add_pinned_badges.sql`: Added `pinned_badge_ids uuid[]` column to profiles with `enforce_pinned_badge_limit` trigger (free: max 1, pro: max 3)
- Created `components/ui/BadgeIcon.tsx` — circular achievement display with text-initial placeholders (distinct from Badge label pill)
- Created `components/badges/ProfileBadges.tsx` — horizontal pinned badge row with empty slot placeholders and Edit button
- Created `components/badges/BadgePicker.tsx` — Modal overlay for selecting which badges to pin, with maxPins enforcement
- Extended `services/gamification.service.ts` with `getPinnedBadges()` and `setPinnedBadges()` methods
- Extended `hooks/useBadges.ts` with `usePinnedBadges()` query and `useSetPinnedBadges()` mutation (invalidates cache on success)
- Extended `hooks/useAuth.ts` with `pinnedBadgeIds: string[]` on UserProfile interface
- Replaced profile placeholder with full screen: avatar, display name, tier badge, streak stats, pinned badges section, BadgePicker modal
- Files created: migration, BadgeIcon.tsx, ProfileBadges.tsx, BadgePicker.tsx, components/badges/index.ts, 4 test files
- Files modified: gamification.service.ts, useBadges.ts, useAuth.ts, profile.tsx, components/ui/index.ts, database.types.ts, DevelopmentPlan.md
- Tests: +27 unit (4 BadgeIcon + 2 service + 4 hooks + 4 ProfileBadges + 5 BadgePicker + 8 profile screen), +4 integration = +31 total
- Unit tests: 526 total (was 499). Integration tests: 334 total (was 330).

---

### Step 8.3 — Streak UI & Notifications ✅

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

**Implementation notes (2026-02-10):**
- Created `utils/streakStatus.ts` — `deriveStreakStatus()` computes real-time streak status from stale DB data by comparing `last_active_date` against current date using ISO week gaps
- Created `components/streaks/StreakCard.tsx` — presentational component showing current + longest streaks with status badge (Active/At Risk/Broken/No Streak)
- Created `components/streaks/StreakStatusBanner.tsx` — contextual warning/recovery banner (returns null when not applicable)
- Created `components/streaks/index.ts` — barrel export
- Updated `app/(tabs)/profile.tsx` — replaced inline streak numbers with `StreakCard` + `StreakStatusBanner`, added `deriveStreakStatus()` via `useMemo`
- Fixed profile test mock: renamed `last_active_week` → `last_active_date` to match DB column
- Push notifications deferred to Phase 10
- New tests: 8 (streakStatus) + 5 (StreakCard) + 5 (StreakStatusBanner) + 3 (profile) = **+21 tests** → **547 total unit tests**

---

### Step 8.4 — Time-Boxed Challenges & Quests ✅

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

**Implementation notes (completed 2026-02-10):**
- Files created: `utils/challengeCriteria.ts`, `services/challenges.service.ts`, `hooks/useChallenges.ts`, `components/challenges/ChallengeCard.tsx`, `components/challenges/ChallengeProgress.tsx`, `components/challenges/index.ts`, `supabase/migrations/20260210140000_challenges.sql`
- Files modified: `app/(tabs)/profile.tsx` (Active Challenges section), `lib/types/database.types.ts` (regenerated)
- Migration: 2 tables (challenges, user_challenge_progress), 5 RLS policies, `update_challenge_progress()` SECURITY DEFINER function, expanded `check_and_award_badges()` with 'challenge' no-op branch, extended `on_ascent_insert()` with challenge progress call
- 4 criteria types: send_count, flash_count, unique_routes, grade_sends (JSONB + Zod validation)
- Trigger-based auto-progress: `update_challenge_progress()` fires inside `on_ascent_insert()`, keeping all gamification atomic
- New tests: 20 (challengeCriteria) + 30 (integration 00011) + 7 (challenges.service) + 10 (useChallenges hooks) + 8 (ChallengeCard) + 4 (ChallengeProgress) + 3 (profile) = **+82 tests** → **599 unit tests, 364 integration tests**

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

### Step 9.1 — Leaderboard Service & Hook ✅

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

**Implementation notes:**
- Created migration `20260211150000_leaderboard_scoring_models.sql`: added `scoring_model` column to `leaderboard_entries` with CHECK constraint, updated UNIQUE constraint and index to include scoring_model, extended `compute_leaderboard()` with 3 scoring models (hardest_grade, flash_rate, volume), updated `on_ascent_insert()`/`on_ascent_delete()` triggers to compute all 3 models, created `get_enrolled_leaderboards()` RPC function
- Created `services/leaderboard.service.ts` — getLeaderboard (PostgREST with model filter) and getEnrolledLeaderboards (RPC)
- Updated `hooks/useLeaderboard.ts` to use leaderboardService with optional `model` parameter, updated query key to include model
- Replaced stub `hooks/useEnrolledLeaderboards.ts` with real TanStack Query hook taking `userId` parameter
- Updated `app/(tabs)/leaderboards.tsx` to pass `user.id` from `useAuth()` to `useEnrolledLeaderboards(userId)`
- Updated 00003 integration tests to filter by `scoring_model = 'hardest_grade'` (backward compat)
- Tests: +20 integration (00012), +5 service, +2 useLeaderboard, +4 useEnrolledLeaderboards, +1 screen = **+32 tests**
- Totals: 611 unit tests, 376 integration tests (excluding edge function)

---

### Step 9.2 — Leaderboard Screen ✅

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

**What to implement (`app/gym/[id]/leaderboard.tsx`):**

- Leaderboard list with `useLeaderboard()`.
- Period chips (This Week / Last Week).
- Scoring model chips (Grade / Flash Rate / Volume).
- Video verification indicator deferred to Phase 12 (no `video_required` column).

**Acceptance:** Leaderboard screen renders with seeded data; interactions work.

**Implementation notes:**
- Created `utils/isoWeek.ts` — ISO week label helpers (getISOWeekLabel, getCurrentISOWeekLabel, getPreviousISOWeekLabel)
- Created `app/gym/[id]/leaderboard.tsx` — gym leaderboard detail screen with period/model chips, ranked list, current user highlighting, score formatting per model
- Updated `app/gym/[id]/index.tsx` — Leaderboards card now navigates to `/gym/${gymId}/leaderboard` instead of showing "Coming Soon" alert
- Updated `app/gym/[id]/__tests__/index.test.tsx` — test verifies `mockPush` instead of `Alert.alert`
- Tests: +4 isoWeek util, +10 leaderboard screen = +14 new (625 total unit tests)

---

### Step 9.3 — Beta Tips & Route Feedback ✅

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

**Implementation notes:**
- Created `services/feedback.service.ts` — thin Supabase wrapper for route_feedback + route_feedback_votes tables (getRouteFeedback, getUserVotes, createFeedback, deleteFeedback, vote, unvote)
- Created `hooks/useFeedback.ts` — TanStack Query wrappers (useRouteFeedback, useCreateFeedback, useDeleteFeedback, useVoteFeedback)
- Created `components/social/FeedbackItem.tsx` — presentational card with avatar, body, vote buttons (ThumbsUp/ThumbsDown with color highlighting), delete button for authors
- Created `components/social/FeedbackComposer.tsx` — TextInput + Send button form for submitting new tips
- Updated `app/gym/[id]/route/[routeId]/index.tsx` — added Beta Tips section with composer, tip list, empty state; kept Video Submissions section below
- Vote pattern: delete-then-insert for upsert behavior; score recalculated on refetch via query invalidation
- Videos deferred to Phase 12 (Storage integration); tags already handled on ascent form
- Tests: +8 service, +6 hooks, +7 FeedbackItem, +4 FeedbackComposer, +4 route detail = +29 new (654 total unit tests)

---

### Step 9.4 — Follow System & Activity Feed ✅

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

**Implementation notes:**
- Created: `services/social.service.ts` (follow, unfollow, isFollowing, getFollowCounts, getFollowing, getActivityFeed)
- Created: `hooks/useSocial.ts` (useIsFollowing, useToggleFollow, useFollowCounts, useActivityFeed)
- Created: `components/social/FollowButton.tsx` (self-contained toggle button)
- Created: `components/social/FeedItem.tsx` (presentational activity feed item)
- Created: `app/profile/[userId].tsx` (other user profile screen — avatar, name, follow button, counts)
- Updated: `app/(tabs)/index.tsx` (replaced placeholder with activity feed)
- +31 unit tests (8 service + 7 hooks + 4 FollowButton + 3 FeedItem + 5 profile + 4 home tab) = 685 total unit tests
- No new migration needed — `follows` table already exists from migration `20260206050000_social_community.sql`

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
| 3 — Auth | FR-A1, FR-A4, FR-L1, NFR-8 |
| 4 — Gyms & Routes | FR-B1, FR-B4, FR-C1, FR-C3, FR-C7, FR-C4, NFR-8 |
| 5 — Logging | FR-D1, FR-D2, FR-D4, FR-E5, FR-C2, FR-G2 |
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
