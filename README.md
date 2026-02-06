# Beta Breaker

A React Native mobile app for indoor climbing gyms — discover routes, log ascents, share beta videos, earn achievements, and compete on leaderboards.

![Status](https://img.shields.io/badge/status-in%20development-yellow)
![Tests](https://img.shields.io/badge/tests-303%20passing-brightgreen)
![License](https://img.shields.io/badge/license-TBD-lightgrey)

---

## About

Beta Breaker connects climbers and gyms on a single platform. Climbers discover and log routes, track streaks and progression, share beta videos, and compete on leaderboards. Gyms get route management, community moderation, and feedback tools — all backed by Supabase with zero custom backend servers.

## Tech Stack

| Category | Technology | Purpose |
|---|---|---|
| Framework | Expo SDK 54 / React Native 0.81 | Cross-platform iOS & Android |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) | Database, auth, file storage, real-time subscriptions |
| Server State | TanStack Query v5 | Caching, optimistic mutations, cache invalidation |
| Client State | Zustand 5.x | Ephemeral/UI state (session timer, filters, bottom sheets) |
| Offline | expo-sqlite | Local route cache and offline action queue |
| Styling | NativeWind v4 (Tailwind CSS) | Utility-first styling for React Native |
| Forms | React Hook Form + Zod | Form state management and schema validation |
| Testing | Jest + React Native Testing Library | Unit, integration, and component tests |
| Monitoring | Sentry | Error tracking and performance monitoring |

## Features (MVP)

- **Route Discovery** -- Browse gym routes with filtering by grade, style, wall, and setter
- **Tick Logging** -- Log ascents (flash, redpoint, project) with grade, attempts, and notes
- **Session Tracking** -- Time climbing sessions, track volume, and review history
- **Gamification** -- Earn badges, maintain streaks, and progress through achievements
- **Leaderboards** -- Gym-wide and friend-based rankings with multiple scoring formulas
- **Beta Sharing** -- Upload and view short beta videos attached to routes
- **Social** -- Follow climbers, share completions, and comment on activity
- **Competitions** -- Gym-hosted events with live scoring and bracket management
- **Admin Tools** -- Route management, community moderation, and gym analytics
- **Offline Support** -- Log ascents and browse routes without connectivity

## Project Structure

```
beta-breaker/
├── app/                    # Expo Router file-based routes
│   ├── (tabs)/             #   Main app tab screens
│   ├── (auth)/             #   Unauthenticated screens (login, register)
│   └── (admin)/            #   Role-gated admin screens
├── components/             # Shared UI components
│   ├── ui/                 #   Primitives (buttons, cards, inputs)
│   ├── routes/             #   Route-related components
│   ├── session/            #   Session/logging components
│   └── social/             #   Social feed components
├── services/               # Supabase query builders (no business logic)
├── hooks/                  # TanStack Query wrappers (useQuery/useMutation)
├── stores/                 # Zustand stores (client-only state)
├── utils/                  # Pure functions (grades, streaks, scoring, validation)
├── lib/                    # Supabase client, query client, constants, DB types
├── supabase/
│   ├── migrations/         #   Sequential SQL migrations
│   ├── functions/          #   Deno Edge Functions
│   └── __tests__/          #   Database integration tests
├── Documentation/          # Project docs (PRD, architecture, dev plan)
├── assets/                 # Images, fonts, static files
└── .github/                # CI/CD workflows
```

## Getting Started

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- npm 10+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Supabase CLI](https://supabase.com/docs/guides/cli) v2.x
- Docker (required for Supabase local development)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd BetaBreaker

# Install dependencies
npm install

# Start Supabase local services (Postgres, Auth, Storage, Realtime)
npx supabase start

# Apply all migrations and seed data
npx supabase db reset

# Start the Expo dev server
npx expo start
```

### Environment

Copy `.env.local.example` to `.env.local` and set your Supabase URL and anon key (printed by `supabase start`).

## Available Scripts

### App Development

| Command | Description |
|---|---|
| `npm start` | Start Expo dev server with hot reload |
| `npm run android` | Start on Android emulator |
| `npm run ios` | Start on iOS Simulator |
| `npm run web` | Start web version |

### Testing

| Command | Description |
|---|---|
| `npm test` | Run unit tests |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:coverage` | Run unit tests with coverage report |
| `npm run test:integration` | Run database integration tests (requires `supabase start`) |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Type-check without emitting |

### Supabase

| Command | Description |
|---|---|
| `npx supabase start` | Start local Postgres, Auth, Storage, Realtime |
| `npx supabase stop` | Stop local services |
| `npx supabase db reset` | Reset local DB (re-run migrations + seed) |
| `npx supabase migration new <name>` | Create a new SQL migration |
| `npx supabase db push` | Apply migrations to remote |
| `npx supabase gen types typescript --local` | Regenerate TypeScript DB types |

## Development Status

### Completed

- **Phase 0 -- Project Scaffolding:** Expo init, dependencies, Jest config, NativeWind, Supabase local, directory structure, CI pipeline
- **Phase 1 -- Data Foundation:** Grade conversion (V-scale/Font/YDS), streak calculations, leaderboard scoring, Zod schemas, constants
- **Phase 2 -- Database Schema:** 5 migrations covering core tables, RLS policies, functions/triggers, gamification (badges, streaks, leaderboards), and social/community features

### Test Coverage

| Suite | Tests | Files |
|---|---|---|
| Unit tests | 134 | 5 (grades, scoring, streaks, validation, constants) |
| Integration tests | 169 | 5 (core tables, RLS, triggers, gamification, social) |
| **Total** | **303** | **10** |

### Up Next

- **Phase 3** -- Authentication and session management
- **Phase 4** -- Gym and route data layer
- **Phase 5** -- Tick-logging and sessions
- Phases 6-21 cover offline support, QR scanning, gamification UI, social features, competitions, media, monetization, analytics, admin portal, and deployment

## Architecture

Beta Breaker follows a **Supabase-first, client-heavy** philosophy -- no custom backend server. All API access goes through Supabase PostgREST, Auth, Storage, and Realtime. Authorization is enforced in Postgres via Row Level Security (RLS) on every table.

### Three-Layer State Model

| Layer | Technology | Responsibility |
|---|---|---|
| Server state | TanStack Query v5 | All Supabase data. Source of truth is the database. |
| Client state | Zustand 5.x | Ephemeral UI state: session timer, pending logs, filters. |
| Local persistence | expo-sqlite | Offline route cache and action queue, synced on reconnect. |

### Data Flow

1. **Reads:** Screen -> hook (TanStack Query) -> service (Supabase query) -> PostgREST -> Postgres (RLS)
2. **Writes:** User action -> Zustand optimistic update -> mutation -> service -> Postgres triggers (streak/badge/leaderboard) -> invalidate queries
3. **Offline:** Action -> enqueue (expo-sqlite) -> reconnect -> drain queue -> service layer -> cache invalidation
4. **Realtime:** Subscribe -> Postgres changes -> TanStack Query cache updated

### Role-Based Access

Authorization is enforced at two levels: database RLS (hard security boundary) and client route guards (UX convenience). Roles are hierarchical: Climber -> Setter -> Judge -> Gym Admin -> Super-Admin.

## Documentation

| Document | Description |
|---|---|
| [Initial Context](Documentation/Initial_context.md) | Project vision, scope, and glossary |
| [Product Requirements](Documentation/Product_Requirements_Document.md) | Functional and non-functional requirements |
| [System Architecture](Documentation/SystemArchitecture.md) | Tech stack, data flows, architecture decisions |
| [Development Plan](Documentation/DevelopmentPlan.md) | TDD phases, steps, and acceptance criteria |
