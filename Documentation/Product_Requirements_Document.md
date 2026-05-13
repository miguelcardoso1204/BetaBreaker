# Beta Breaker — Product Requirements Document

**Product:** Beta Breaker (iOS/Android)
**Version:** 1.0 (MVP)
**Last updated:** 2026-02-06

---

## 1. Purpose

This document captures the functional and non-functional requirements for Beta Breaker, a mobile platform connecting climbers and gyms through route discovery, beta sharing, and lightweight gamification.

**Primary users:**
1. Climbers who want to progress and engage with their gym community
2. Route setters / gyms who want structured feedback and engagement tools

---

## 2. Functional Requirements

> **Priority Weight (PW):** 5 = Must-have, 4 = Should-have, 3 = Nice-to-have, 2 = Low priority, 1 = Stretch goal

### A. Identity & Accounts

| ID | PW | Requirement |
|---|---|---|
| FR-A1 | 5 | Email/password sign-up, login, logout, password reset |
| FR-A2 | 4 | Profile with editable fields; pin up to 3 badges (Free: 1) |
| FR-A3 | 5 | Account deletion and data export on request |
| FR-A4 | 4 | Social sign-in (Google, Apple) as alternative to email/password |
| FR-A5 | 3 | Optional onboarding flow: select favorite gyms (multi-select), climbing type preference, self-assessed grade range |

### B. Gyms & Areas

| ID | PW | Requirement |
|---|---|---|
| FR-B1 | 5 | Gym directory with details and social links |
| FR-B2 | 2 | Sectors/areas metadata and map position inside gym |
| FR-B3 | 4 | QR/NFC station mapping to open route details |
| FR-B4 | 4 | User favorites multiple gyms via a `favorite_gyms` join table; favorite gym content prioritized in feeds and leaderboards |
| FR-B5 | 3 | Location-based nearest gym detection for quick session start (FAB prompt) |
| FR-B6 | 3 | Gym logo display in directory listings, profile session cards, and leaderboard entries |

### C. Problems/Routes Catalog

| ID | PW | Requirement |
|---|---|---|
| FR-C1 | 5 | Route model with setter ID; user-sourced tags aggregated by consensus |
| FR-C2 | 4 | Media attachments: beta videos |
| FR-C3 | 5 | Search & filters by grade, style, tags, recency, popularity, sent/unsent, setter |
| FR-C4 | 4 | Save routes as Project/Wishlist/Favorite; viewable list on Profile or dedicated Saved Routes screen |
| FR-C5 | 4 | System generates unique route IDs and printable QR/NFC payloads |
| FR-C6 | 3 | Feedback governance: up/down-vote tags and beta tips; low-score/spam hidden |
| FR-C7 | 4 | Route lifecycle status visible to users (Active, Retiring Soon, Archived) with visual indicator |
| FR-C8 | 3 | Video like/unlike system with like counts on route media; sort videos by most liked |

### D. Tick-Logging & Sessions

| ID | PW | Requirement |
|---|---|---|
| FR-D1 | 5 | Quick log: Flash/Send/Attempt, attempts count, notes, one-tap from route or scan |
| FR-D2 | 4 | Session summary per day: attempts, sends, grade distribution |
| FR-D3 | 4 | Offline cache and sync with conflict resolution |
| FR-D4 | 4 | Explicit session start/end; compute duration |
| FR-D5 | 2 | Auto-suggest session start based on geofence/QR or multiple logs |
| FR-D6 | 4 | Session summary screen at session end: attempts, sends, grade distribution, duration; also viewable from activity history |
| FR-D7 | 4 | Persistent session history with gym, duration, and linked ascent metadata; drill-down from profile logbook |
| FR-D8 | 3 | Active session hub screen: live timer, pending logs list, stats row, browse/scan action buttons, post-session summary |

### E. Progression & Analytics

| ID | PW | Requirement |
|---|---|---|
| FR-E1 | 4 | Personal grade pyramid visualization |
| FR-E2 | 3 | Style insights from crowd tags (slab, overhang, dyno) |
| FR-E3 | 3 | Personalized route suggestions (Pro) |
| FR-E4 | 3 | Grade conversion view (Font/V/YDS) respecting gym defaults and user pref |
| FR-E5 | 3 | Session history / logbook view: chronological activity history on Profile tab with summary stats and drill-down to session summaries |

### F. Gamification

| ID | PW | Requirement |
|---|---|---|
| FR-F1 | 4 | Badges/achievements for milestones; user chooses display |
| FR-F2 | 4 | Streaks (weekly/monthly) with decay and recovery mechanics; streak display surfaced on Profile |
| FR-F3 | 3 | Time-boxed challenges/quests |
| FR-F4 | 1 | Elo-like ranks (low priority), decay rules |

### G. Social & Community

| ID | PW | Requirement |
|---|---|---|
| FR-G1 | 4 | Leaderboards by hardest grade, flash rate, volume, rank |
| FR-G2 | 4 | Route feedback: beta tips (text), optional beta video, user-supplied tags |
| FR-G3 | 4 | Report abuse/spam on users, videos, tags, comments (moderation queue) |
| FR-G4 | 4 | Gym-configurable video requirement for leaderboard sends above grade threshold |
| FR-G5 | 3 | Follow / friend system: follow other climbers to see their activity in a feed |
| FR-G6 | 4 | Activity feed (Home tab): aggregated event stream showing friend activity, gym route resets, leaderboard updates, and competition events |
| FR-G7 | 2 | Leaderboard rules and prizes display: gym-configured text shown in modals on leaderboard detail screen |
| FR-G8 | 3 | Climber search: case-insensitive substring search over profiles by display name, accessed from the Profile tab header. Self is excluded from results. Each result row links to that climber's profile and exposes an inline Follow / Following toggle. |
| FR-G9 | 3 | Tappable follower / following counts on profiles: counts always render (including 0) and tap to dedicated list screens (`/profile/[userId]/followers`, `/profile/[userId]/following`). Empty lists show a plain "No followers yet" / "Not following anyone yet" message. Each row navigates to that climber's profile. |

### H. Competitions & Events

| ID | PW | Requirement |
|---|---|---|
| FR-H1 | 4 | Event creation (gym admin): scoring model, eligible routes |
| FR-H2 | 4 | Athlete score entry: self-entry via QR + verifier or judge entry |
| FR-H3 | 4 | Live scoreboard with real-time rankings and screen exports |
| FR-H4 | 3 | Categories (age/gender), scheduling |
| FR-H5 | 3 | Results export (CSV/PDF) |

### I. Route-Setting Workflow (Gym Admin)

| ID | PW | Requirement |
|---|---|---|
| FR-I1 | 4 | Set list/calendar planning; assign setters; workload view |
| FR-I2 | 3 | Grade consensus view: setter vs community |
| FR-I3 | 3 | Maintenance tickets: report spinning/broken holds; ticket lifecycle |
| FR-I4 | 3 | Season reset: archive/rotate sets; close leaderboards per season |

### J. Notifications

| ID | PW | Requirement |
|---|---|---|
| FR-J1 | 4 | Push notifications (configurable): friends' sends, route retirements, comp updates, rank changes |
| FR-J2 | 4 | In-app notification center: list of recent notifications with read/unread state |
| FR-J3 | 3 | Notification preferences screen: per-category opt-in/out (friends, routes, comps, achievements) |
| FR-J4 | 3 | Notification bell icon on Home tab header linking to in-app notification center (FR-J2) |

### K. Content Moderation

| ID | PW | Requirement |
|---|---|---|
| FR-K1 | 5 | Video upload requires content ownership affirmation; max duration 60 s, max resolution 1080p, client-side compression |
| FR-K2 | 4 | Moderation queue for gym admins: review reported content, approve/reject/escalate with reason |
| FR-K3 | 4 | Community guidelines displayed before first upload; accessible from settings |

### L. Monetization & Access Control

| ID | PW | Requirement |
|---|---|---|
| FR-L1 | 5 | Roles: Climber, Gym Admin, Setter, Judge, Super-Admin (scoped per gym) |
| FR-L2 | 4 | Gym billing: €0.50 per active gym-linked user/month |
| FR-L3 | 4 | Consumer tiers: Free (1 badge, 5 beta/week, no analytics) vs Pro (3 badges, unlimited beta, analytics) |
| FR-L4 | 5 | Pro subscription purchase flow: native IAP, restore purchases |
| FR-L5 | 3 | Trials and promo/coupon redemption for Pro |

### O. Admin Web Portal

| ID | PW | Requirement |
|---|---|---|
| FR-O1 | 4 | Web dashboard: sets in progress, active routes, scan counts |
| FR-O2 | 3 | Bulk import/update (inline bulk editor) |
| FR-O3 | 3 | Audit log: who changed grades/tags/statuses or removed media |

### P. Data Quality & Mapping

| ID | PW | Requirement |
|---|---|---|
| FR-P1 | 5 | Multiple grade systems with internal canonical scale |
| FR-P2 | 4 | Crowd-sourced tagging normalized into controlled taxonomy; admin alias/merge |
| FR-P3 | 4 | Anti-spoof for QR/NFC: signed payloads with rotation and client verification |

### Q. Accessibility & Localization

| ID | PW | Requirement |
|---|---|---|
| FR-Q1 | 3 | Language switching (EN, PT-PT) |
| FR-Q2 | 2 | Large text mode and larger tap targets |
| FR-Q3 | 2 | Color-aware mode (patterns/labels for hold colors) |

---

## 3. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | Home/route details load <3 s on 4G/Wi-Fi. Core actions feedback <1 s. |
| NFR-2 | Availability | ≥99% uptime/month excluding scheduled maintenance. |
| NFR-3 | Offline | Cached routes viewable offline; auto-sync on reconnect. |
| NFR-4 | Security | HTTPS (TLS 1.2+), encrypted credentials, role-based access control. |
| NFR-5 | Privacy | GDPR compliant; data export/delete; consent flags on media. |
| NFR-6 | Scalability | Support 10,000 concurrent users; horizontal scaling via containers. |
| NFR-7 | Maintainability | Modular architecture, Git, CI/CD. |
| NFR-8 | Usability | Consistent design, clear iconography, large tap targets, high-contrast mode. |
| NFR-9 | Reliability | Local session logs preserved on interruption; auto-retry sync. |
| NFR-10 | Monitoring | Anonymized error/performance metrics, no PII in logs. |
| NFR-11 | Video/Media | Beta videos: max 60 s, max 1080p, ≤150 MB after client-side compression; hosted on Cloudinary (unsigned upload preset). Lazy-loaded thumbnails in lists; streaming playback. |
| NFR-12 | Rate Limiting | Public-facing endpoints rate-limited (e.g., 60 req/min per user). QR/NFC scan endpoint hardened against replay attacks. |
| NFR-13 | Testability | Core business logic (grade mapping, leaderboard scoring, streak calculation) covered by unit tests with ≥80% coverage. Integration tests for auth, sync, and QR flows. |
| NFR-14 | Compatibility | Support iOS 16+ and Android 10+ (API 29+). Responsive layout for phones; tablet layout not required for MVP. |
