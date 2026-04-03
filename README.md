# Beta Breaker

A React Native mobile app for indoor climbing gyms — discover routes, log ascents, share beta videos, earn achievements, and compete on leaderboards.

![Expo SDK](https://img.shields.io/badge/Expo_SDK-54-blue)
![Tests](https://img.shields.io/badge/tests-1475%20passing-brightgreen)
![Phases](https://img.shields.io/badge/phases-19%2F21%20complete-green)

---

## About

Beta Breaker connects climbers and gyms on a single platform. Climbers discover and log routes, track streaks and progression, share beta videos, and compete on leaderboards. Gyms get route management, community moderation, and feedback tools — all backed by Supabase with zero custom backend servers.

Built as a university project following strict **Test-Driven Development** (Red → Green → Refactor) across 21 phases.

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Expo SDK 54 / React Native 0.81 |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) |
| Server State | TanStack Query v5 |
| Client State | Zustand 5.x |
| Offline | expo-sqlite |
| Styling | NativeWind v4 (Tailwind CSS) |
| Forms | React Hook Form + Zod |
| Testing | Jest + React Native Testing Library |
| Monitoring | Sentry |
| i18n | i18next (English + Portuguese) |

## Features

- **Route Discovery** — Browse gym routes with filtering by grade, style, wall, and setter
- **Tick Logging** — Log ascents (flash, redpoint, project) with grade, attempts, and notes
- **Session Tracking** — Time climbing sessions, track volume, and review history in a logbook
- **Gamification** — Earn badges, maintain streaks, complete challenges, and progress through achievements
- **Leaderboards** — Gym-wide and enrolled leaderboard rankings with multiple scoring models
- **Beta Sharing** — Upload and view short beta videos attached to routes
- **Social** — Follow climbers, share completions, leave route feedback, and report content
- **Competitions** — Gym-hosted events with live scoreboard and results export
- **Notifications** — Push notifications with in-app notification center and preferences
- **Subscriptions** — Pro tier with IAP, trials, and promo codes
- **Admin Tools** — Dashboard, route management, setting calendar, grade consensus, maintenance tickets, season resets, audit log, billing, and moderation
- **Analytics** — Grade pyramid, style insights, and personalized route suggestions
- **Offline Support** — Log ascents and browse routes without connectivity, auto-sync on reconnect
- **Accessibility** — Screen reader support and accessibility store
- **i18n** — English and Portuguese (Portugal) localization

## Project Structure

```
BetaBreaker/
├── app/                        # Expo Router file-based routes
│   ├── (tabs)/                 #   Main app tab screens
│   ├── (auth)/                 #   Login, register, forgot password
│   └── (admin)/                #   Role-gated admin screens
├── components/                 # Shared UI components
│   ├── ui/                     #   Primitives (Button, Card, TextInput, Avatar, etc.)
│   ├── routes/                 #   RouteCard, FilterBar, BetaVideoPlayer
│   ├── session/                #   QuickLogSheet, SessionTimer, SessionSummary
│   ├── social/                 #   FeedItem, FollowButton, FeedbackComposer
│   ├── badges/                 #   BadgePicker, ProfileBadges
│   ├── challenges/             #   ChallengeCard, ChallengeProgress
│   ├── streaks/                #   StreakCard, StreakStatusBanner
│   ├── analytics/              #   GradePyramid, StyleInsights, SuggestionsCard
│   ├── admin/                  #   CalendarGrid, GradeConsensusCard
│   ├── notifications/          #   NotificationBell, NotificationItem
│   ├── subscription/           #   Paywall, PromoCodeInput
│   └── navigation/             #   CustomTabBar
├── services/                   # Supabase query builders (thin wrappers, no business logic)
├── hooks/                      # TanStack Query wrappers (useQuery/useMutation)
├── stores/                     # Zustand stores (session, offline queue, filters, accessibility)
├── utils/                      # Pure functions (grades, streaks, scoring, validation, geo)
├── lib/                        # Supabase client, query client, constants, DB types
├── locales/                    # i18n translation files (en.json, pt-PT.json)
├── supabase/
│   ├── migrations/             #   27 sequential SQL migrations
│   ├── functions/              #   5 Deno Edge Functions
│   ├── __tests__/              #   20 database integration test suites
│   └── seed.sql                #   Development seed data
├── Documentation/              # PRD, architecture, development plan, wireframes
└── .github/                    # CI/CD workflows
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
git clone https://github.com/miguelcardoso1204/BetaBreaker.git
cd BetaBreaker
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

| Command | Description |
|---|---|
| `npm start` | Start Expo dev server |
| `npm test` | Run unit tests (1475+ tests) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:coverage` | Unit tests with coverage report |
| `npm run test:integration` | Database integration tests (requires `supabase start`) |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Type-check without emitting |

## Architecture

Beta Breaker follows a **Supabase-first, client-heavy** architecture — no custom backend server. All API access goes through Supabase PostgREST, Auth, Storage, and Realtime. Authorization is enforced in Postgres via Row Level Security (RLS) on every table.

### State Management

| Layer | Technology | Responsibility |
|---|---|---|
| Server state | TanStack Query v5 | All Supabase data. Source of truth is the database. |
| Client state | Zustand 5.x | Ephemeral UI state: session timer, pending logs, filters. |
| Local persistence | expo-sqlite | Offline route cache and action queue, synced on reconnect. |

### Data Flow

1. **Reads:** Screen → hook (TanStack Query) → service (Supabase query) → PostgREST → Postgres (RLS)
2. **Writes:** User action → Zustand optimistic update → mutation → service → Postgres triggers → invalidate queries
3. **Offline:** Action → enqueue (expo-sqlite) → reconnect → drain queue → service layer → cache invalidation
4. **Realtime:** Subscribe → Postgres changes → TanStack Query cache updated

### Role-Based Access

Authorization is enforced at two levels: database RLS (hard security boundary) and client route guards (UX convenience). Roles: Climber → Setter → Judge → Gym Admin → Super-Admin.

## Development Status

### Completed Phases (19/21)

| Phase | Description |
|---|---|
| 0 | Project Scaffolding & CI |
| 1 | Data Foundation (grade conversion, streaks, scoring, validation) |
| 2 | Database Schema & RLS (27 migrations, 20 integration test suites) |
| 3 | Authentication & Session Management |
| 4 | Gyms, Routes & Tab Screens |
| 5 | Tick-Logging & Sessions |
| 6 | Offline Support (SQLite queue, route cache, sync engine) |
| 7 | QR Scanning & Signing Edge Function |
| 8 | Gamification (badges, streaks, challenges) |
| 9 | Social & Leaderboards (follows, feed, feedback, moderation) |
| 10 | Notifications (push tokens, dispatch edge function, notification center) |
| 11 | Competitions & Events (partial — live scoreboard, results export) |
| 12 | Media (beta video upload & playback) |
| 13 | Monetization (IAP, trials, promo codes, gym billing) |
| 14 | Progression & Analytics (grade pyramid, style insights, suggestions) |
| 15 | Admin Portal (dashboard, route management, calendar, consensus, maintenance, seasons, audit log) |
| 16 | Profile & Settings |
| 17 | Onboarding |
| 18 | i18n & Accessibility |
| 19 | Sentry Error Tracking |

### Remaining

| Phase | Description |
|---|---|
| 20 | E2E Testing & Hardening |
| 21 | Build & Deployment |

### Test Coverage

| Category | Count |
|---|---|
| Unit test suites | 166 |
| Unit tests | 1,475+ |
| Integration test suites | 20 |
| Total test files | 188 |

## Documentation

| Document | Description |
|---|---|
| [Initial Context](Documentation/Initial_context.md) | Project vision, scope, and glossary |
| [Product Requirements](Documentation/Product_Requirements_Document.md) | Functional and non-functional requirements |
| [System Architecture](Documentation/SystemArchitecture.md) | Tech stack, data flows, architecture decisions |
| [Development Plan](Documentation/DevelopmentPlan.md) | TDD phases, steps, and acceptance criteria |
| [Navigation Flow](Documentation/NavigationFlow.md) | Screen navigation map. |
| [Design System](Documentation/DesignSystem.md) | Colors, typography, and component patterns. |
| [Wireframes](Documentation/Wireframes.md) | Screen layout references. |
