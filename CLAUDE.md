# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beta Breaker is a React Native (Expo SDK 54) mobile app for indoor climbing gyms. Climbers discover routes, log ascents, share beta videos, earn achievements, and compete on leaderboards. Gyms get feedback tools, route management, and community engagement. Backend is fully managed by Supabase (no custom server).

**Status:** Documentation-complete, implementation not yet started. Begin with Phase 0 of the Development Plan.

## Git Conventions

Do NOT include `Co-Authored-By` lines in commit messages.

## Code Style & Comments

All generated code must include comments explaining what the code does. The user is a CS student learning these technologies — comments should teach, not just label. Explain the "why" behind patterns (e.g., why RLS is used, why TanStack Query wraps the service layer, what Zustand is doing).

## Documentation Updates

Whenever a feature change, scope change, or design change occurs, immediately update the relevant files in `Documentation/`. This includes:
- `Documentation/Initial_context.md` — project vision, scope, glossary
- `Documentation/Product_Requirements_Document.md` — functional/non-functional requirements
- `Documentation/SystemArchitecture.md` — tech stack, data flows, architecture decisions
- `Documentation/DevelopmentPlan.md` — TDD phases, steps, acceptance criteria

After completing each step, mark it ✅ in `Documentation/DevelopmentPlan.md` and add implementation notes (files created, key decisions, test counts).

## Build & Development Commands

### Mobile App (Expo)
```bash
npx expo start                              # Dev server with hot reload
eas build --profile preview                 # Preview build (iOS Simulator + Android APK)
eas build --profile production              # Production build for stores
eas update --branch production              # OTA update (JS-only changes)
```

### Supabase (Backend)
```bash
supabase start                              # Start local Postgres, Auth, Storage, Realtime
supabase stop                               # Stop local services
supabase migration new <name>               # Create new SQL migration
supabase db push                            # Apply migrations to remote
supabase db reset                           # Reset local DB (re-run all migrations + seed)
supabase functions serve                    # Local Edge Function dev server
supabase functions deploy                   # Deploy Edge Functions to production
supabase gen types typescript --local > lib/types/database.types.ts  # Regenerate DB types
```

### Testing
```bash
npm test                                    # Run all Jest tests
npm test -- --watch                         # Watch mode
npm test -- <path>                          # Run a single test file
npm test -- --coverage                      # Coverage report
npx tsc --noEmit                            # Type-check without emitting
```

### CI Pipeline (GitHub Actions)
- **On PR:** `npm run lint` → `npx tsc --noEmit` → `npm test`
- **On merge to main:** integration tests → `supabase db push` → `eas update`
- **On release tag:** `eas build --profile production` → store submission

## Architecture

### Philosophy: "Supabase-first, client-heavy"
- **No custom backend server.** All API access goes through Supabase PostgREST, Auth, Storage, and Realtime.
- **Authorization lives in Postgres** via Row Level Security (RLS) on every table — the hard security boundary.
- **Edge Functions** (Deno) used sparingly: QR signing, push dispatch, billing webhooks, IAP verification.
- **Offline-first** for session logging and route browsing via expo-sqlite.

### State Management — Three Layers
| Layer | Technology | What It Holds |
|-------|-----------|---------------|
| Server state | TanStack Query v5 | All Supabase data (routes, ascents, leaderboards, badges). Source of truth is the DB. |
| Client state | Zustand 5.x | Ephemeral/UI state: session timer, pending logs, active filters, bottom sheet visibility. |
| Local persistence | expo-sqlite | Offline route cache, offline action queue. Synced on reconnect. |

### Data Flow
1. **Reads:** Screen → `useX()` hook (TanStack Query) → `x.service.ts` (Supabase query builder) → PostgREST → Postgres (RLS)
2. **Writes:** User action → Zustand optimistic update → `useMutation` → service → Supabase → Postgres triggers (streak/badge/leaderboard) → invalidate queries
3. **Offline:** Action → `offlineStore.enqueue()` → expo-sqlite → [reconnect] → drain queue → service layer → invalidate caches
4. **Realtime:** Screen mounts → Supabase Realtime subscription → Postgres emits changes → TanStack Query cache updated

### Key Directories
- `app/` — Expo Router file-based routes. `(auth)/` for unauthenticated, `(tabs)/` for main app, `(admin)/` for role-gated admin screens.
- `services/` — Thin wrappers around `supabase.from(...).select/insert/update/delete`. No business logic here.
- `hooks/` — TanStack Query wrappers (`useQuery`/`useMutation`) that call services and manage cache invalidation.
- `stores/` — Zustand stores for client-only state (session timer, UI state, offline queue).
- `utils/` — Pure functions with no side effects: grade conversion, streak calculation, scoring logic, Zod schemas.
- `lib/` — Supabase client init, TanStack Query client, constants, auto-generated DB types.
- `components/` — Shared UI split by domain: `ui/` (primitives), `routes/`, `session/`, `social/`.
- `supabase/migrations/` — Sequential SQL migrations. `supabase/functions/` — Edge Functions. `supabase/seed.sql` — dev seed data.

### Role-Based Access (Two Levels)
1. **Database RLS** — enforces auth.uid() and role checks from `user_gym_roles` table. Cannot be bypassed.
2. **Client route guards** — `(admin)/_layout.tsx` checks role and redirects non-admins. UX convenience only.

Roles: Climber (global) → Setter (per gym) → Judge (per event) → Gym Admin (per gym) → Super-Admin (platform).

### Grade System
Grades stored as canonical integers (0–30). Client-side conversion in `utils/grades.ts` maps to V-scale, Font, or YDS. Each gym has a `default_grade_system`; users can override in profile.

## TDD Methodology

Every implementation step follows Red → Green → Refactor:
1. **Red:** Write failing tests first
2. **Green:** Write minimum code to pass
3. **Refactor:** Clean up, re-run tests

**Test conventions:**
- Test files: `__tests__/<filename>.test.ts(x)`
- Jest preset: `jest-expo`
- Utils/services/hooks: Jest unit tests (≥80% coverage target)
- Components: `@testing-library/react-native` (behavior, not implementation)
- DB/RLS: Integration tests against `supabase start` (local Postgres)
- E2E: Maestro or Detox (Phase 20)

## Development Phases

21 sequential phases (see `Documentation/DevelopmentPlan.md` for full details):
- **Phase 0:** Scaffolding — Expo init, deps, Jest, NativeWind, Supabase local, directory structure, CI
- **Phase 1:** Data Foundation — grade conversion, streak calc, scoring logic, Zod schemas, constants (pure TS, no UI/network)
- **Phase 2:** Database — SQL migrations for all tables, RLS policies, triggers, seed data
- **Phase 3:** Auth — Supabase client, auth service, useAuth hook, login/register screens, auth gate
- **Phase 4:** Gyms & Routes — services, hooks, RouteCard component, route list/detail screens
- **Phase 5:** Tick-Logging — session store, sessions service, QuickLog bottom sheet, session timer, logbook
- **Phase 6:** Offline — SQLite queue, route cache, sync engine with exponential backoff
- **Phase 7–21:** QR scanning, gamification, social/leaderboards, notifications, competitions, media, monetization, analytics, admin portal, profile, onboarding, polish/i18n, monitoring, E2E, deployment

## Key Tech Decisions
- **Expo SDK 54 + React Native 0.81** — cross-platform with managed builds
- **Supabase** over Firebase — Postgres + RLS eliminates custom API layer
- **Zustand** over Redux — minimal boilerplate, no providers
- **TanStack Query** for all server state — caching, optimistic mutations, cache invalidation
- **NativeWind v4** — Tailwind utility classes for React Native styling
- **expo-sqlite** for offline — built into Expo SDK, simple SQL
