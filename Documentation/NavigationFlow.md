# Beta Breaker — Navigation Flow

**Version:** 2.0
**Last updated:** 2026-02-06

This document maps every screen in the app and what screens it leads to.

---

## Tab Bar (5 slots)

```
[ Home ]  [ Map Browse ]  [ + Start Session ]  [ Leaderboards ]  [ Profile ]
```

The center button (`+`) is a raised FAB — not a tab with its own persistent screen.

---

## Tab Screens

### 1. Home (Feed)

**Path:** `app/(tabs)/index.tsx`
**Purpose:** Strava-style activity feed with recent updates.

**Content:**
- Chronological feed of events:
  - Friend activity (ascents, achievements)
  - Gym route resets
  - Leaderboard starts / finishes
  - Competition announcements / results

**Navigates to:**
| Tap target | Destination |
|---|---|
| Friend in feed item | Profile (other user) |
| Leaderboard in feed item | Gym Leaderboard |
| Competition in feed item | Competition detail (future) |
| Gym name in feed item | Gym Main Page |

---

### 2. Map Browse

**Path:** `app/(tabs)/map.tsx`
**Purpose:** Find gyms on an interactive map.

**Content:**
- Map with gym markers
- List of gyms currently visible on the map
- Filter by name search
- Filter by favorite gyms

**Navigates to:**
| Tap target | Destination |
|---|---|
| Gym card / marker | Gym Main Page |

---

### 3. Enrolled Leaderboards

**Path:** `app/(tabs)/leaderboards.tsx`
**Purpose:** Quick access to leaderboards you're participating in.

**Content:**
- List of currently enrolled leaderboards

**Navigates to:**
| Tap target | Destination |
|---|---|
| Leaderboard item | Gym Leaderboard |

---

### 4. Profile (Own)

**Path:** `app/(tabs)/profile.tsx`
**Purpose:** View your own profile and activity history.

**Content:**
- Profile photo, name, age
- Favorite gyms (list)
- Achievements / badges
- Currently enrolled leaderboards
- Pro status indicator
- Activity history (below profile info)

**Navigates to:**
| Tap target | Destination |
|---|---|
| Edit button | Edit Profile |
| Leaderboard item | Gym Leaderboard |
| Achievement / badge | Badge detail (future) |
| Favorite gym item | Gym Main Page |

---

### 5. Start Session (FAB — center button)

**Path:** `app/start-session.tsx` (modal)
**Purpose:** Quick-start a climbing session.

**Behavior:**
1. Detect user's location
2. Show prompt: "Start session at *[closest gym]*?"
3. If **Yes** → start session at that gym
4. If **No** → redirect to Map Browse to pick a gym

---

## Detail Screens (not on tabs)

### 6. Gym Main Page

**Path:** `app/gym/[id].tsx`
**Purpose:** Hub for everything about a gym.

**Content:**
- Gym logo and name
- Favorite icon (toggle)
- Info: address, schedule, socials
- Navigation cards to: Routes, Leaderboards, Style Analysis
- Big "Start Session" button (starts session at this gym)

**Navigates to:**
| Tap target | Destination |
|---|---|
| Routes card | Gym Routes |
| Leaderboards card | Gym Leaderboards |
| Style Analysis card | Gym Style Analysis |
| Start Session button | Active session at this gym |

---

### 7. Gym Routes

**Path:** `app/gym/[id]/routes.tsx`
**Purpose:** Browse all routes at a gym.

**Content:**
- List of routes (RouteCard components)
- Filters: grade range, style, sort, status

**Navigates to:**
| Tap target | Destination |
|---|---|
| Route card | Gym Route (detail) |

---

### 8. Gym Route (Route Detail)

**Path:** `app/gym/[gymId]/route/[routeId].tsx`
**Purpose:** Full detail view of a single route.

**Content:**
- Route image
- Route ID, grade, set date
- Favorite button
- Personal sent status
- Style analysis
- Video submissions feed (each with sender comment)
- Big "Add Ascent" button
  - If in active session → log ascent
  - If NOT in active session → prompt to start session

**Navigates to:**
| Tap target | Destination |
|---|---|
| Video submission | Video detail / player |
| Add Ascent (no session) | Start Session prompt |
| Sender profile | Profile (other user) |

---

### 9. Gym Leaderboards

**Path:** `app/gym/[id]/leaderboards.tsx`
**Purpose:** List all leaderboards for a gym.

**Content:**
- List of leaderboards
- By default shows: active + "just ended"
- Filter toggle to show retired leaderboards

**Navigates to:**
| Tap target | Destination |
|---|---|
| Leaderboard item | Gym Leaderboard (detail) |

---

### 10. Gym Leaderboard (Detail)

**Path:** `app/gym/[gymId]/leaderboard/[leaderboardId].tsx`
**Purpose:** View rankings and prizes for one leaderboard.

**Content:**
- Leaderboard name
- Prizes
- Link to rules
- Ranked list of participants with points

**Navigates to:**
| Tap target | Destination |
|---|---|
| Person in ranking | Profile (other user) |

---

### 11. Gym Style Analysis

**Path:** `app/gym/[id]/style-analysis.tsx`
**Purpose:** Statistics about route styles at the gym.

**Content:** TBD — placeholder for now.

---

### 12. Route Style Analysis

**Path:** `app/gym/[gymId]/route/[routeId]/style-analysis.tsx`
**Purpose:** Statistics about a specific route's style.

**Content:** TBD — placeholder for now.

---

### 13. Profile (Other User)

**Path:** `app/profile/[userId].tsx`
**Purpose:** View another user's profile.

**Content:**
- Same layout as own profile but with Follow button instead of Edit
- Profile photo, name, age
- Favorite gyms, achievements, enrolled leaderboards
- Pro status
- Activity history

**Navigates to:**
| Tap target | Destination |
|---|---|
| Leaderboard item | Gym Leaderboard |
| Favorite gym item | Gym Main Page |

---

### 14. Edit Profile

**Path:** `app/profile/edit.tsx`
**Purpose:** Edit your own profile information.

**Content:**
- Edit: name, age, avatar, favorite gyms, preferred grade system
- Save / cancel

---

## Navigation Map (Visual)

```
TAB BAR
├── Home (Feed)
│   ├── → Profile (other user)
│   ├── → Gym Leaderboard
│   ├── → Gym Main Page
│   └── → Competition (future)
│
├── Map Browse
│   └── → Gym Main Page
│       ├── → Gym Routes
│       │   └── → Gym Route (detail)
│       │       ├── → Add Ascent / Start Session
│       │       └── → Route Style Analysis
│       ├── → Gym Leaderboards
│       │   └── → Gym Leaderboard (detail)
│       │       └── → Profile (other user)
│       ├── → Gym Style Analysis
│       └── → Start Session (at this gym)
│
├── [+] Start Session (FAB)
│   ├── Yes → Active session at closest gym
│   └── No → Map Browse
│
├── Enrolled Leaderboards
│   └── → Gym Leaderboard (detail)
│       └── → Profile (other user)
│
└── Profile (own)
    ├── → Edit Profile
    ├── → Gym Leaderboard
    └── → Gym Main Page
```
