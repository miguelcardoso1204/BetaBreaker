# Beta Breaker — System Architecture

**Product:** Beta Breaker (iOS/Android)
**Version:** 1.0 (MVP)
**Last updated:** 2026-02-05

---

## 1. Architecture Philosophy

Beta Breaker follows a **Supabase-first, client-heavy** architecture. The goal is to minimize custom backend code by leveraging Supabase's managed services (Auth, Database, Storage, Realtime, Edge Functions) and keeping business logic either in the client or in Postgres (RLS policies, database functions). This approach is ideal for a single-developer team and optimized for AI-assisted ("vibe coded") development: convention-driven, minimal boilerplate, and few moving parts.

**Guiding principles:**

- **Convention over configuration** — file-based routing, auto-generated types, managed infrastructure
- **Thin client, smart database** — push authorization and data integrity into Postgres via RLS and triggers
- **No custom backend server** — Supabase Edge Functions handle the few cases that need server-side logic
- **Offline-first where it matters** — session logs and route cache work without connectivity
- **Type safety end-to-end** — TypeScript from database types to UI components

---

## 2. Tech Stack Summary

### 2.1 Client (Mobile App)

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | React Native | 0.81 | Cross-platform mobile UI |
| **Platform SDK** | Expo | SDK 54 | Managed build toolchain, native APIs, OTA updates |
| **Language** | TypeScript | 5.x | Type safety across the entire codebase |
| **Navigation** | Expo Router | v6 | File-based routing, deep linking, typed routes |
| **State Management** | Zustand | 5.x | Lightweight global state with slices and middleware |
| **Server State** | TanStack Query (React Query) | v5 | Caching, background refetch, optimistic updates for Supabase data |
| **Styling** | NativeWind | v4 | Tailwind CSS utility classes for React Native |
| **Animations** | React Native Reanimated | v4 | Gesture-driven animations (New Architecture required) |
| **Forms** | React Hook Form + Zod | latest | Declarative form validation |
| **Images** | expo-image | SDK 54 | Optimized image loading with caching and blurhash placeholders |
| **Video** | expo-video | SDK 54 | Beta video playback and recording |
| **Camera/QR** | expo-camera | SDK 54 | QR code scanning from route tags |
| **Haptics** | expo-haptics | SDK 54 | Tactile feedback on log actions |
| **Secure Storage** | expo-secure-store | SDK 54 | Token and sensitive data persistence |
| **SQLite (offline)** | expo-sqlite | SDK 54 | Local session log cache and offline route data |
| **Notifications** | expo-notifications | SDK 54 | Push notification handling |
| **In-App Purchases** | expo-in-app-purchases or RevenueCat | latest | Pro subscription management |
| **Icons** | lucide-react-native | latest | Consistent icon set |

### 2.2 Backend (Supabase — fully managed)

| Service | Purpose | Key Features Used |
|---|---|---|
| **Supabase Auth** | Identity & access control | Email/password, Google OAuth, Apple Sign-In, JWT tokens, RLS integration |
| **Supabase Database** | Primary data store (Postgres 15+) | Row Level Security, database functions, triggers, views, pg_cron |
| **Supabase Storage** | Media files (beta videos, profile images) | S3-compatible buckets, storage policies, CDN, image transformations |
| **Supabase Realtime** | Live data subscriptions | Postgres Changes (leaderboards, live scoreboards, notifications) |
| **Supabase Edge Functions** | Server-side logic | Deno/TypeScript runtime, QR payload signing, push notification dispatch, billing webhooks |

### 2.3 Infrastructure & Tooling

| Tool | Purpose |
|---|---|
| **Expo Application Services (EAS)** | Cloud builds, OTA updates, app submission |
| **Supabase CLI** | Local development, migrations, Edge Function deployment |
| **GitHub** | Source control, CI/CD via GitHub Actions |
| **Supabase Dashboard** | Database management, logs, monitoring |
| **Sentry (expo-sentry)** | Error tracking and performance monitoring |

---

## 3. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     MOBILE CLIENT                       │
│               (Expo SDK 54 / React Native 0.81)         │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐│
│  │  Expo     │  │ Zustand  │  │   TanStack Query       ││
│  │  Router   │  │ Stores   │  │   (server state cache) ││
│  │  (v6)     │  │          │  │                        ││
│  └────┬─────┘  └────┬─────┘  └──────────┬─────────────┘│
│       │              │                   │              │
│  ┌────┴──────────────┴───────────────────┴─────────────┐│
│  │              Supabase JS Client (v2)                ││
│  │    Auth │ Database │ Storage │ Realtime │ Functions  ││
│  └────────────────────────┬────────────────────────────┘│
│                           │                             │
│  ┌────────────────────────┴────────────────────────────┐│
│  │              expo-sqlite (offline cache)             ││
│  └─────────────────────────────────────────────────────┘│
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS / WSS
                            ▼
┌─────────────────────────────────────────────────────────┐
│                     SUPABASE CLOUD                      │
│                                                         │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐ │
│  │  Auth   │  │ PostgREST│  │ Storage │  │ Realtime │ │
│  │ (GoTrue)│  │  (API)   │  │  (S3)   │  │  (WS)    │ │
│  └────┬────┘  └────┬─────┘  └────┬────┘  └────┬─────┘ │
│       │             │             │             │       │
│  ┌────┴─────────────┴─────────────┴─────────────┴────┐ │
│  │              PostgreSQL 15+                        │ │
│  │   RLS Policies │ Functions │ Triggers │ pg_cron    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │              Edge Functions (Deno)                 │ │
│  │  QR Signing │ Push Dispatch │ Billing Webhooks    │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES                      │
│                                                         │
│  Apple/Google IAP  │  APNs/FCM  │  Sentry  │  EAS      │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Project Structure

The app uses Expo Router's file-based routing convention. Non-route code lives outside the `app/` directory.

```
beta-breaker/
├── app/                          # Expo Router — file-based routes
│   ├── _layout.tsx               # Root layout (providers, splash, auth gate)
│   ├── index.tsx                 # Landing / redirect
│   ├── (auth)/                   # Auth group (unauthenticated)
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/                   # Main app (authenticated, tab navigator)
│   │   ├── _layout.tsx           # Custom tab bar with FAB
│   │   ├── index.tsx             # Home — activity feed (Strava-style)
│   │   ├── map.tsx               # Map Browse — gym map + list
│   │   ├── leaderboards.tsx      # Enrolled Leaderboards
│   │   └── profile.tsx           # Profile (own) + activity history
│   ├── gym/                      # Gym screens (detail + sub-screens)
│   │   ├── [id].tsx              # Gym Main Page
│   │   └── [id]/
│   │       ├── routes.tsx        # Gym Routes (filtered list)
│   │       ├── route/
│   │       │   └── [routeId].tsx # Route Detail (video feed, ascent)
│   │       ├── leaderboards.tsx  # Gym Leaderboards (list)
│   │       ├── leaderboard/
│   │       │   └── [leaderboardId].tsx  # Leaderboard Detail (rankings)
│   │       └── style-analysis.tsx
│   ├── profile/
│   │   ├── [userId].tsx          # Profile (other user, with Follow)
│   │   └── edit.tsx              # Edit own profile
│   ├── start-session.tsx         # Start Session modal (FAB target)
│   ├── (admin)/                  # Gym admin screens (role-gated)
│   │   ├── _layout.tsx
│   │   ├── dashboard.tsx
│   │   ├── routes/
│   │   ├── events/
│   │   └── moderation.tsx
│   └── +not-found.tsx
│
├── components/                   # Shared UI components
│   ├── ui/                       # Primitives (Button, Card, Input, Badge)
│   ├── routes/                   # Route-specific (RouteCard, GradeBadge)
│   ├── session/                  # Session logging (QuickLogSheet, SessionTimer)
│   └── social/                   # Leaderboard, FeedItem
│
├── lib/                          # Core utilities and configuration
│   ├── supabase.ts               # Supabase client initialization
│   ├── queryClient.ts            # TanStack Query client setup
│   ├── constants.ts              # App-wide constants (grade scales, etc.)
│   └── types/                    # Shared TypeScript types
│       └── database.types.ts     # Auto-generated from Supabase schema
│
├── hooks/                        # Custom React hooks
│   ├── useAuth.ts                # Auth state and actions
│   ├── useRoutes.ts              # Route queries and mutations
│   ├── useSession.ts             # Session management
│   ├── useLeaderboard.ts         # Leaderboard data
│   └── useOfflineSync.ts         # Offline queue management
│
├── stores/                       # Zustand stores (client-only state)
│   ├── sessionStore.ts           # Active session state (timer, pending logs)
│   ├── uiStore.ts                # UI state (modals, filters, active tab)
│   └── offlineStore.ts           # Offline action queue
│
├── services/                     # Data access layer (Supabase queries)
│   ├── auth.service.ts
│   ├── routes.service.ts
│   ├── sessions.service.ts
│   ├── leaderboard.service.ts
│   ├── media.service.ts
│   └── notifications.service.ts
│
├── utils/                        # Pure utility functions
│   ├── grades.ts                 # Grade conversion logic
│   ├── scoring.ts                # Leaderboard scoring calculations
│   ├── streaks.ts                # Streak calculation
│   └── validation.ts             # Zod schemas
│
├── assets/                       # Static assets (images, fonts)
├── supabase/                     # Supabase local development
│   ├── config.toml
│   ├── migrations/               # SQL migration files
│   ├── functions/                # Edge Functions
│   │   ├── sign-qr/
│   │   ├── dispatch-push/
│   │   └── billing-webhook/
│   └── seed.sql                  # Development seed data
│
├── app.json                      # Expo configuration
├── tsconfig.json
├── tailwind.config.js            # NativeWind configuration
└── package.json
```

---

## 5. Data Flow Patterns

### 5.1 Standard Read (e.g., Route List)

```
Screen Component
  → usRoutes() hook (TanStack Query wrapper)
    → routes.service.ts  (supabase.from('routes').select(...))
      → Supabase PostgREST API
        → PostgreSQL (RLS filters by gym / user context)
      ← JSON response
    ← Cached in TanStack Query
  ← Render list
```

TanStack Query handles caching, background refetching, and stale-while-revalidate. The service layer is a thin wrapper around the Supabase client — no transformation logic, just query construction.

### 5.2 Authenticated Write (e.g., Log an Ascent)

```
User taps "Send" on QuickLogSheet
  → sessionStore.addPendingLog(log)          # Optimistic local state
  → useMutation (TanStack Query)
    → sessions.service.createAscent(log)
      → supabase.from('route_ascents').insert(...)
        → PostgreSQL
          → RLS: verify user = auth.uid()
          → Trigger: update streak, check badge eligibility
          → Trigger: update leaderboard materialized view
      ← Success
    ← Invalidate relevant queries (session, leaderboard, badges)
  → sessionStore.removePendingLog(log)
  ← UI updates via query cache invalidation
```

### 5.3 Offline Flow (Session Logging)

```
User logs ascent while offline
  → sessionStore.addPendingLog(log)
  → offlineStore.enqueue(action)
  → expo-sqlite: persist to local queue table
  ← UI shows log as "pending sync" (subtle indicator)

... network reconnects ...

  → useOfflineSync() detects connectivity
  → Drain queue: replay each action via Supabase client
    → On success: remove from local queue, invalidate queries
    → On conflict: apply last-write-wins with timestamps
  ← UI reflects synced state
```

### 5.4 Realtime (Live Scoreboard)

```
Competition screen mounts
  → Subscribe: supabase.channel('event:{eventId}')
      .on('postgres_changes', { table: 'competition_scores', filter: ... })
  ← Postgres emits change events on INSERT/UPDATE
  → TanStack Query cache updated via setQueryData
  ← UI re-renders with new rankings

Competition screen unmounts
  → Unsubscribe from channel
```

### 5.5 Media Upload (Beta Video)

```
User records / selects video
  → Client-side: validate duration ≤60s, resolution ≤1080p
  → Client-side: compress with expo-video (FFmpeg if needed)
  → Ownership affirmation checkbox
  → supabase.storage.from('beta-videos').upload(path, file)
    → Storage bucket (policy: authenticated users, max 50MB)
  ← Public URL returned
  → supabase.from('route_media').insert({ route_id, url, type: 'video' })
  ← Media linked to route
```

### 5.6 QR Scan → Route Detail

```
User scans QR code at gym wall
  → expo-camera decodes QR payload (signed JWT)
  → Client verifies signature against known public key
  → Extract route_id from payload
  → router.push(`/home/${route_id}`)
  → Route detail screen fetches data via TanStack Query
```

---

## 6. Component Relationships

### 6.1 State Architecture

The app uses a **clear separation between server state and client state**:

**Server state (TanStack Query)** — any data that lives in Supabase:
- Routes, gyms, ascents, leaderboards, badges, events, notifications
- Cached locally, auto-refetched, supports optimistic mutations
- The source of truth is always the database

**Client state (Zustand)** — ephemeral or UI-specific state:
- `sessionStore`: active session timer, pending (unsaved) logs, session draft
- `uiStore`: active filters, selected gym, bottom sheet visibility, grade system preference
- `offlineStore`: queued actions awaiting sync

**Local persistence (expo-sqlite)** — offline resilience:
- Cached route catalog for offline browsing
- Offline action queue (logs made without connectivity)
- Synced to Supabase when connection restores

### 6.2 Auth Flow

```
App Launch
  │
  ├─ supabase.auth.getSession()
  │   ├─ Valid session → (tabs)/_layout.tsx → Home
  │   └─ No session → (auth)/_layout.tsx → Login
  │
  ├─ supabase.auth.onAuthStateChange(callback)
  │   └─ Keeps session fresh, handles token refresh
  │
  └─ Auth context exposed via useAuth() hook
      ├─ user, session, isLoading
      ├─ signIn(), signUp(), signOut()
      └─ role (derived from user metadata / profiles table)
```

### 6.3 Role-Based Access

Roles are enforced at **two levels**:

1. **Database (RLS policies)** — the hard security boundary. Every table has RLS policies checking `auth.uid()` and user roles from a `user_gym_roles` table. Even if the client is compromised, unauthorized writes are rejected.

2. **Client (route guards)** — the UX layer. The `(admin)/_layout.tsx` checks the user's role before rendering admin screens. Non-admins are redirected.

| Role | Scope | Capabilities |
|---|---|---|
| Climber | Global | Log ascents, view routes, upload beta, participate in events |
| Setter | Per gym | All Climber + create/edit routes, view feedback summaries |
| Judge | Per event | All Climber + enter/verify scores during competitions |
| Gym Admin | Per gym | All Setter + manage gym settings, moderation, events, billing |
| Super-Admin | Platform | All Gym Admin + cross-gym administration |

### 6.4 Notification Pipeline

```
Event occurs (e.g., friend sends a route)
  → PostgreSQL trigger fires
    → Inserts row into `notifications` table
    → Calls pg_net to invoke Edge Function `dispatch-push`
  → Edge Function:
    → Reads user's push token + notification preferences
    → If opted-in: sends via APNs (iOS) / FCM (Android)
  → Client:
    → expo-notifications receives push → shows system notification
    → In-app: Realtime subscription on `notifications` table updates badge count
    → Notification center queries `notifications` table via TanStack Query
```

---

## 7. Supabase Database Design Notes

### 7.1 Row Level Security Strategy

Every table has RLS enabled. Policies follow this pattern:

- **Public read** (routes, gyms, leaderboards): `SELECT` allowed for authenticated users, scoped to active content
- **Owner write** (ascents, profiles, saved routes): `INSERT/UPDATE/DELETE` where `auth.uid() = user_id`
- **Role-gated write** (route management, events): checks `user_gym_roles` table for appropriate role
- **Admin escalation** (moderation, billing): checks for `gym_admin` or `super_admin` role

### 7.2 Key Database Functions & Triggers

| Function | Trigger | Purpose |
|---|---|---|
| `on_ascent_insert()` | AFTER INSERT on `route_ascents` | Update streak, check badge eligibility, refresh leaderboard |
| `on_ascent_delete()` | AFTER DELETE on `route_ascents` | Recompute streak, adjust leaderboard |
| `compute_leaderboard(gym_id, period)` | Called by pg_cron or on-demand | Refresh materialized leaderboard view |
| `check_grade_consensus(route_id)` | AFTER INSERT on `route_ascents` (when perceived grade submitted) | Update consensus grade aggregation |
| `handle_new_user()` | AFTER INSERT on `auth.users` | Create profile row, assign default Climber role |

### 7.3 Grade System

Grades are stored as an **internal canonical integer scale** (`canonical_grade INTEGER`). Display conversion is handled client-side via a lookup table in `utils/grades.ts`:

```
canonical_grade: 0 → V0 / 4a / 5.5
canonical_grade: 10 → V4 / 6a+ / 5.10b
canonical_grade: 20 → V8 / 7b / 5.13b
...
```

Each gym has a `default_grade_system` setting. Users can override with their preferred system in their profile.

---

## 8. Edge Functions

Edge Functions are used sparingly — only for operations that **cannot** run client-side or in Postgres:

| Function | Trigger | What It Does |
|---|---|---|
| `sign-qr` | Called by admin portal | Generates signed JWT payload for QR/NFC tags with rotation |
| `dispatch-push` | Called by Postgres trigger (pg_net) | Sends push notifications via APNs/FCM, respects user preferences |
| `billing-webhook` | HTTP webhook from IAP receipt validation | Validates App Store / Play Store receipts, updates subscription status |
| `verify-iap` | Called by client after purchase | Server-side receipt verification for Pro subscription |

---

## 9. Offline Strategy

### What works offline:

| Feature | Offline Behavior |
|---|---|
| Browse routes | Served from expo-sqlite cache (last sync) |
| Log ascents | Saved to local queue, synced on reconnect |
| View session history | Local data available |
| QR scan | Decodes locally, shows cached route data |

### What requires connectivity:

| Feature | Reason |
|---|---|
| Upload video | Needs Storage bucket |
| View leaderboards | Realtime data |
| Competition scoring | Needs server validation |
| Social actions (follow, report) | Write to server |
| Auth (login/register) | Needs Auth service |

### Sync & Conflict Resolution

- **Strategy:** Last-write-wins with client timestamp
- **Queue:** Zustand `offlineStore` backed by expo-sqlite
- **Replay:** On reconnect, actions are replayed in order; failures are retried with exponential backoff (3 attempts), then surfaced to user
- **Cache invalidation:** After successful sync, relevant TanStack Query caches are invalidated to refetch fresh server state

---

## 10. Security Model

| Concern | Solution |
|---|---|
| **Authentication** | Supabase Auth (GoTrue) — JWT tokens, auto-refresh, secure storage via expo-secure-store |
| **Authorization** | Row Level Security on every table; role checks in `user_gym_roles` |
| **Transport** | HTTPS/TLS 1.2+ for all API calls; WSS for Realtime |
| **QR/NFC anti-spoof** | Signed JWT payloads with short expiry, server-side rotation via Edge Function |
| **Rate limiting** | Supabase built-in rate limits + custom per-user limits on scan endpoints |
| **Data privacy** | GDPR: data export via Supabase SQL function, account deletion cascades all user data |
| **Media safety** | Upload requires ownership affirmation; storage bucket policies limit size/type; moderation queue |
| **Secrets** | Environment variables in Supabase Edge Functions; `.env` for local dev (never committed) |

---

## 11. Monitoring & Observability

| What | How |
|---|---|
| **Client errors** | Sentry (expo-sentry) — crash reports, breadcrumbs, performance traces |
| **API errors** | Supabase Dashboard logs (PostgREST, Auth, Storage) |
| **Edge Function logs** | Supabase Dashboard → Edge Functions → Logs |
| **Database performance** | Supabase Dashboard → Database → Query Performance |
| **Push delivery** | APNs/FCM delivery reports |
| **App analytics** | expo-insights (anonymous usage metrics) |

---

## 12. Build & Deployment

### Mobile App

```
Local development:
  npx expo start                  # Dev server with hot reload

Preview builds (internal testing):
  eas build --profile preview     # iOS Simulator + Android APK

Production builds:
  eas build --profile production  # App Store + Play Store bundles

OTA updates (non-native changes):
  eas update --branch production  # Push JS bundle update
```

### Supabase

```
Local development:
  supabase start                  # Local Postgres + Auth + Storage + Realtime

Migrations:
  supabase migration new <name>   # Create migration
  supabase db push                # Apply to remote

Edge Functions:
  supabase functions serve        # Local testing
  supabase functions deploy       # Deploy to production

Type generation:
  supabase gen types typescript --local > lib/types/database.types.ts
```

### CI/CD (GitHub Actions)

1. **On PR:** Lint + type-check + unit tests
2. **On merge to `main`:** Run integration tests → `supabase db push` → `eas update` (OTA)
3. **On release tag:** `eas build --profile production` → submit to stores

---

## 13. Technology Decision Log

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Mobile framework | React Native + Expo SDK 54 | Flutter, native Swift/Kotlin | Cross-platform from single codebase; Expo simplifies builds, OTA updates, and native API access; strong AI/vibe-coding ecosystem |
| Backend | Supabase | Firebase, custom Node.js API | Postgres with RLS eliminates need for custom API layer; built-in Auth, Storage, Realtime; open-source; generous free tier for MVP |
| Navigation | Expo Router v6 | React Navigation (manual) | File-based routing reduces boilerplate; automatic deep linking; convention-driven — ideal for AI-assisted development |
| State management | Zustand | Redux Toolkit, Jotai, Context API | Minimal boilerplate, hook-based, no providers needed; pairs well with TanStack Query for server state; simple enough for AI to generate correctly |
| Server state | TanStack Query v5 | SWR, manual fetch + state | Best-in-class caching, background refetch, optimistic mutations, devtools; well-documented and AI-friendly |
| Styling | NativeWind v4 | StyleSheet, Tamagui, Unistyles | Tailwind utility classes are familiar, consistent, and easy for AI to generate; no context switching between web and mobile patterns |
| Offline storage | expo-sqlite | WatermelonDB, MMKV | Built into Expo SDK; simple SQL interface for offline queue and route cache; no native module complexity |
| Video | expo-video | react-native-video | First-party Expo module; simpler setup; sufficient for 60s beta clips |
| Push notifications | expo-notifications + Edge Functions | OneSignal, Firebase Cloud Messaging direct | Native Expo integration; Edge Functions handle dispatch logic without third-party dependency |
| IAP | RevenueCat or expo-in-app-purchases | Custom receipt validation | RevenueCat simplifies cross-platform subscription management; expo-in-app-purchases as lighter alternative |
| Error tracking | Sentry (expo-sentry) | Bugsnag, Crashlytics | First-class Expo integration; generous free tier; source map support |

---

## 14. Constraints & Trade-offs

| Constraint | Impact | Mitigation |
|---|---|---|
| Single developer | Limited bandwidth for custom solutions | Lean on managed services (Supabase, EAS); avoid custom backends |
| Academic timeline (Oct 2025 – Jun 2026) | Must ship MVP by Mar 2026 | Prioritize PW 5 and PW 4 requirements; defer PW ≤3 to backlog |
| Free/low-cost budget | Cannot use expensive third-party services | Supabase free tier (500 MB DB, 1 GB storage, 50K MAU auth); EAS free builds; Sentry free tier |
| Supabase Realtime limits (free tier) | Max 200 concurrent connections | Sufficient for MVP scale (single gym pilot); upgrade plan if needed |
| No custom backend | Complex server logic is harder | Push logic into Postgres functions + RLS; use Edge Functions for the rest |
| Client-side video compression | Quality/size trade-off | Cap at 1080p/60s/50MB; use expo-video or FFmpeg-kit if finer control needed |

---

## 15. Appendix: Package List (Estimated)

```json
{
  "dependencies": {
    "expo": "~54.0.0",
    "expo-router": "~6.0.0",
    "react": "19.1.0",
    "react-native": "0.81.x",
    "@supabase/supabase-js": "^2.x",
    "@tanstack/react-query": "^5.x",
    "zustand": "^5.x",
    "nativewind": "^4.x",
    "react-hook-form": "^7.x",
    "zod": "^3.x",
    "@hookform/resolvers": "^3.x",
    "expo-camera": "~16.x",
    "expo-image": "~2.x",
    "expo-video": "~2.x",
    "expo-notifications": "~0.x",
    "expo-secure-store": "~14.x",
    "expo-sqlite": "~15.x",
    "expo-haptics": "~14.x",
    "expo-in-app-purchases": "~16.x",
    "react-native-reanimated": "~4.x",
    "react-native-gesture-handler": "~2.x",
    "react-native-safe-area-context": "~5.x",
    "lucide-react-native": "^0.x",
    "@sentry/react-native": "^6.x",
    "date-fns": "^4.x"
  }
}
```

> **Note:** Exact minor/patch versions should be resolved at project initialization via `npx create-expo-app` and `npx expo install` to ensure SDK 54 compatibility.
