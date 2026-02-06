# Beta Breaker -- Wireframe Specifications

**Version:** 2.0
**Last updated:** 2026-02-06
**Derived from:** 13 Figma mockup screenshots in `Documentation/mockups/`
**Companion doc:** `Documentation/DesignSystem.md` (color tokens, typography, components)

---

## Table of Contents

1. [How to Read This Document](#how-to-read-this-document)
2. [Tab Bar Layout](#tab-bar-layout)
3. [Screen Specifications](#screen-specifications)
   - [1. Login](#1-login)
   - [2. Sign Up](#2-sign-up)
   - [3. Home / Activity Feed](#3-home--activity-feed)
   - [4. Gym Routes](#4-gym-routes)
   - [5. Route Details](#5-route-details)
   - [6. Ascent Form](#6-ascent-form)
   - [7. Start Session](#7-start-session)
   - [8. Gym Main Page](#8-gym-main-page)
   - [9. Map Browse](#9-map-browse)
   - [10. Leaderboard Detail](#10-leaderboard-detail)
   - [11. Profile (Own)](#11-profile-own)
   - [12. Enrolled Leaderboards](#12-enrolled-leaderboards)
   - [13. Gym Leaderboards](#13-gym-leaderboards)
   - [14. Profile (Other User)](#14-profile-other-user)
   - [15. Edit Profile](#15-edit-profile)
4. [Navigation Flow](#navigation-flow)

---

## How to Read This Document

### What Are Wireframe Specs?

A wireframe specification is a text-based blueprint for a screen. Before you write any JSX or
styling code, you need to know **what goes on the screen**, **how it is structured**, and
**what happens when the user interacts with it**. Think of it like an architect's floor plan --
you would not start pouring concrete without knowing where the walls go.

### Why Not Just Code from the Mockups Directly?

Mockup screenshots show you what a screen *looks like*, but they do not tell you:

- **Component hierarchy** -- which UI elements are *inside* which containers. For example,
  a route card's image, title, and grade text are all children of a single `Card` component.
  Knowing this hierarchy determines your JSX nesting structure.
- **Interactions** -- what happens when you tap, swipe, or long-press. A static image cannot
  show you that tapping a route card navigates to the detail screen.
- **Reusable components** -- which pieces repeat across screens. If the same `TextInput` style
  appears on Login, Sign Up, and Search, you build it once and reuse it.

### How Each Screen Is Documented

Every screen spec below includes five sections:

| Section | What It Tells You | Why It Matters |
|---|---|---|
| **File path** | Where this screen lives in the `app/` directory | Expo Router uses file-based routing -- the file path *is* the URL |
| **Layout** | A tree showing which components contain which | Translates directly to your JSX nesting |
| **Components used** | Which base UI components (from `components/ui/`) appear | Tells you what to import and which props to set |
| **Interactions** | What each tappable element does | Drives your `onPress` handlers and state changes |
| **Navigation** | Where each action takes the user | Determines your `router.push()` / `router.back()` calls |

### Reading the Component Hierarchy Trees

The indented tree notation works like this:

```
Screen (SafeAreaView)
  ScrollView
    SectionA
      ComponentX
      ComponentY
    SectionB
      ComponentZ
```

This means: the screen is wrapped in a `SafeAreaView`. Inside that is a `ScrollView`. The
scroll view contains two sections (A and B). Section A holds components X and Y; section B
holds component Z. Each indentation level = one level of JSX nesting.

---

## Tab Bar Layout

The tab bar is the persistent bottom navigation visible on all main screens (Home, Map Browse,
Leaderboards, Profile, and the Start Session FAB). It is implemented by Expo Router's
`(tabs)/_layout.tsx`.

### Structure

```
TabBar (fixed at bottom, bg-background, border-t border-border, h-14)
  |-- Tab: Home          (Home icon, 28px)          -> app/(tabs)/index.tsx
  |-- Tab: Map Browse    (MapPin icon, 28px)         -> app/(tabs)/map.tsx
  |-- FAB: Center (+)    (Plus icon, purple circle)  -> app/start-session.tsx (modal)
  |-- Tab: Leaderboards  (Trophy icon, 28px)         -> app/(tabs)/leaderboards.tsx
  +-- Tab: Profile       (User icon, 28px)           -> app/(tabs)/profile.tsx
```

### Visual Details

- **5 slots** arranged in a horizontal row, evenly spaced.
- **Active tab:** Icon color changes to `accent` (#7C3AED). Inactive tabs use `text-muted` (#6B6B80).
- **FAB (Floating Action Button):** The center slot is not a standard tab -- it is a 56x56px
  circle with `bg-accent` and the `Plus` icon in white. It is elevated above the tab bar by
  approximately 12px, creating a "floating" effect. A purple glow (`accent-glow`) radiates
  behind it. This draws the user's eye to the primary action: starting a climbing session.
- **Why a FAB?** The "start session" action is the most important thing a climber does in
  the app. Elevating it above the tab bar makes it instantly discoverable and reachable with
  a thumb, even on large phones. This is a common pattern in fitness and social apps (think
  Instagram's camera button or Strava's record button).

### Tab Bar Visibility

- **Visible on:** All `(tabs)/` screens (Home, Map Browse, Leaderboards, Profile).
- **Hidden on:** Auth screens (`(auth)/`), detail screens (`gym/[id]`, `gym/[gymId]/route/[routeId]`,
  `gym/[gymId]/leaderboard/[leaderboardId]`), modal overlays (start session, ascent form),
  and profile detail screens (`profile/[userId]`, `profile/edit`).

---

## Screen Specifications

### 1. Login

**File:** `app/(auth)/login.tsx`
**Purpose:** Authenticate returning users with email/password or social OAuth.
**Mockup:** `Documentation/mockups/Login.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, contentContainerStyle: center vertically)
    LogoSection (items-center, mb-8)
      Image (BB logo, ~120x120)
      Text ("Welcome Back!", text-3xl font-bold text-white, mt-4)
      Text ("We missed you!", text-base text-secondary, mt-1)

    FormSection (gap-4, w-full)
      TextInput (label: "Username", leftIcon: CircleUser, placeholder: "Username")
      TextInput (label: "Password", leftIcon: Lock, rightIcon: Eye/EyeOff toggle,
                 placeholder: "--------", secureTextEntry: true)
      Button (variant: "ghost", align: right, "Forgot Password?")

    ActionSection (mt-6, gap-4, w-full)
      Button (variant: "primary", full-width, "Sign in")
      Divider (text: "Or continue with")
      SocialButtonRow (flex-row, justify-center, gap-4)
        IconButton (Google logo)
        IconButton (Apple logo)
        IconButton (Facebook logo)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `TextInput` | label, leftIcon, placeholder, secureTextEntry, rightIcon | Password field has eye toggle for show/hide |
| `Button` | variant: "primary", full-width | Purple rounded-full "Sign in" button |
| `Button` | variant: "ghost" | "Forgot Password?" link-style button, right-aligned |
| `Divider` | text: "Or continue with" | Horizontal line with centered text |
| `IconButton` | Social provider logos | Google, Apple, Facebook -- not Lucide icons, custom SVGs |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Username input | Tap | Opens keyboard, focus ring appears |
| Password input | Tap | Opens keyboard with secure entry (dots) |
| Eye icon (password) | Tap | Toggles between `secureTextEntry: true/false` (show/hide password) |
| "Forgot Password?" | Tap | Navigates to password reset flow (or opens modal) |
| "Sign in" button | Tap | Validates form -> calls `authService.signInWithEmail()` -> on success, navigates to Home |
| Social buttons | Tap | Initiates OAuth flow for the respective provider via Supabase Auth |

#### Navigation

| Trigger | Destination |
|---|---|
| Successful sign-in | `app/(tabs)/index.tsx` (Home) |
| "Forgot Password?" | Password reset screen (future) |
| Social OAuth success | `app/(tabs)/index.tsx` (Home) |
| No account? (implied) | `app/(auth)/register.tsx` (Sign Up) -- link not visible in mockup but expected |

---

### 2. Sign Up

**File:** `app/(auth)/register.tsx`
**Purpose:** Create a new account with email/password or social OAuth.
**Mockup:** `Documentation/mockups/Sign Up.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, contentContainerStyle: center vertically)
    LogoSection (items-center, mb-8)
      Image (BB logo, ~120x120)
      Text ("Sign up!", text-3xl font-bold text-white, mt-4)
      Text ("Make part of this amazing community!", text-base text-secondary, mt-1)

    FormSection (gap-4, w-full)
      TextInput (label: "Email Adress", leftIcon: Mail,
                 placeholder: "yourname@gmail.com")
      TextInput (label: "Your Name", leftIcon: CircleUser,
                 placeholder: "@yourname")
      TextInput (label: "Password", leftIcon: Lock, rightIcon: Eye/EyeOff,
                 placeholder: "--------", secureTextEntry: true)
      PasswordStrengthIndicator (flex-row, gap-1)
        StrengthBar (4 bars, colored by strength level)
        Text ("Strong", text-sm text-success)

    ActionSection (mt-6, gap-4, w-full)
      Button (variant: "primary", full-width, "Sign up")
      Divider (text: "Or sign up with")
      SocialButtonRow (flex-row, justify-center, gap-4)
        IconButton (Google logo)
        IconButton (Apple logo)
        IconButton (Facebook logo)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `TextInput` | label, leftIcon, placeholder | Email and name inputs; name has "@" prefix in placeholder |
| `TextInput` | secureTextEntry, rightIcon: Eye | Password with visibility toggle |
| `PasswordStrengthIndicator` | Custom component | 4 horizontal bars that fill with color as password strengthens. Labels: "Weak" (red), "Fair" (amber), "Strong" (green) |
| `Button` | variant: "primary" | Purple "Sign up" button |
| `Divider` | text: "Or sign up with" | Same pattern as Login |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Email input | Type | Standard text input |
| Name input | Type | Captures display name (the "@" prefix suggests a username/handle) |
| Password input | Type | Each keystroke re-evaluates password strength indicator |
| Eye icon | Tap | Toggle password visibility |
| Strength bars | (Automatic) | Update color/fill as password changes: 1 bar = weak (red), 2 = fair (amber), 3-4 = strong (green) |
| "Sign up" button | Tap | Validates form (Zod schema) -> calls `authService.signUpWithEmail()` -> on success, navigates to Home or onboarding |
| Social buttons | Tap | OAuth flow for respective provider |

#### Navigation

| Trigger | Destination |
|---|---|
| Successful sign-up | `app/(tabs)/index.tsx` (Home) or onboarding flow (Phase 17) |
| Social OAuth success | `app/(tabs)/index.tsx` (Home) |
| Already have account? (implied) | `app/(auth)/login.tsx` (Login) |

---

### 3. Home / Activity Feed

**File:** `app/(tabs)/index.tsx`
**Purpose:** Welcome the user and show a Strava-style chronological feed of activity and events --
friend ascents, gym route resets, leaderboard changes, competition results, and achievements.
**Mockup:** `Documentation/mockups/Home.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4)
    HeaderSection (mt-8, mb-6)
      Text ("Welcome Back", text-3xl font-bold text-white)
      Text (userName, text-4xl font-bold text-accent-light)  // e.g., "Miguel!"

    SubtitleSection (mb-4)
      Text ("While you were away...", text-base text-secondary)

    FeedList (gap-3)
      FeedItem (flex-row, items-start, gap-3)
        DateColumn (items-center, w-10)
          Text (day number, text-xl font-bold text-muted)  // e.g., "27"
          Text (month abbr, text-xs text-muted)             // e.g., "Oct"
        ContentColumn (flex-1)
          Text (description with bold names + emoji, text-base text-secondary)
            // e.g., "Sao Rock had new routesetting!"
            // Bold gym/competition names use text-white font-bold
          Button (variant: "ghost", text-accent-light)
            // e.g., "Check out the new routes!"

      FeedItem ...  (repeats for each event)
      FeedItem ...

  TabBar (fixed bottom)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Text` | Various typography combos | "Welcome Back" in white bold, user name in accent-light bold |
| `FeedItem` | Custom component | Each item has a left date column and right content column. The date column shows the day number and abbreviated month. The content column has description text with inline bold names and a link-style action. |
| `Button` | variant: "ghost" | Link-style text in `accent-light` color (e.g., "Check out the new routes!") |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Link text (e.g., "Check out the new routes!") | Tap | Navigates to the relevant screen (gym routes, leaderboard, video submission, etc.) |
| Pull down | Swipe | Refresh feed data |
| Feed item (full row) | Tap | Could also navigate to the relevant detail screen |

#### Navigation

| Trigger | Destination |
|---|---|
| "Check out the new routes!" | `app/gym/[id]/routes.tsx` (Gym Routes) for the mentioned gym |
| "Check the leaderboard!" | `app/gym/[gymId]/leaderboard/[leaderboardId].tsx` (Leaderboard Detail) for the mentioned competition |
| "Check the submission!" | Route detail or video submission detail |
| Friend name / avatar in feed | `app/profile/[userId].tsx` (Profile Other User) |
| Gym name in feed | `app/gym/[id].tsx` (Gym Main Page) |
| Competition in feed | Competition detail (future) |

---

### 4. Gym Routes

**File:** `app/gym/[id]/routes.tsx`
**Purpose:** Search, filter, and browse climbing routes at a specific gym. Accessed from the
Gym Main Page, not from the tab bar directly. This is where climbers find their next challenge.
**Mockup:** `Documentation/mockups/Route Browse.png`, `Route Browse-1.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  HeaderSection (px-4, pt-4)
    Row (flex-row, items-center, gap-2)
      IconButton (ArrowLeft, back to Gym Main Page)
      Text (gymName, text-xl font-bold text-white)  // e.g., "Sao Rock Routes"

    TextInput (variant: "search", leftIcon: Search,
               placeholder: "Route name/ID", mt-3)

    FilterRow (flex-row, items-center, gap-2, mt-3)
      IconButton (Star icon, toggle for favorites filter)
      Badge (variant: "tag", "New", onPress: toggle new-routes filter)
      DropdownButton ("Difficulty", ChevronDown icon)
      DropdownButton ("Styles", ChevronDown icon)

  RouteList (FlatList, px-4, gap-3, mt-4)
    RouteCard (Card variant: "pressable", flex-row, items-center)
      Image (route photo, 80x80, rounded-xl)
      CardContent (flex-1, ml-4)
        Text (route ID, text-2xl font-bold font-mono text-white)   // "#01"
        Text (grade, text-sm text-secondary)                       // "Grade: 5"
      Badge (variant: "warning", "New!", if isNew)                  // optional
      Icon (ChevronRight, text-white)

    RouteCard ...  (repeats for each route)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `TextInput` | search variant, leftIcon: Search | Search bar at top for filtering by route name or ID |
| `IconButton` | Star icon, toggleable | Filters list to show only favorited routes |
| `IconButton` | ArrowLeft | Back button navigating to Gym Main Page |
| `Badge` | variant: "tag" | "New" filter chip |
| `DropdownButton` | Custom or TextInput dropdown variant | "Difficulty" and "Styles" open bottom sheets or dropdown menus |
| `Card` | variant: "pressable" | Each route is a horizontal card with image, text, and chevron |
| `Badge` | variant: "warning" | Yellow "New!" label on recently set routes |
| `Image` | 80x80, rounded-xl | Route photo thumbnail on the left side of each card |

#### Visual States

- **Default card:** `bg-surface` with standard elevation.
- **Selected/highlighted card:** `bg-surface-elevated` with a visible `border border-accent`
  (seen on route #01 in the mockup -- it has a brighter border, indicating it is the currently
  selected or most recently viewed route).
- **"New!" badge:** Positioned at the left edge of the card, overlapping the image slightly.
  Uses `bg-warning` with dark text.

#### Interactions

| Element | Action | Result |
|---|---|---|
| Back button | Tap | Returns to Gym Main Page |
| Search bar | Type | Filters route list in real-time by name or ID |
| Star filter | Tap | Toggles favorites-only filter; icon fills when active |
| "New" chip | Tap | Filters to show only newly set routes |
| "Difficulty" dropdown | Tap | Opens dropdown/bottom sheet to select grade range |
| "Styles" dropdown | Tap | Opens dropdown/bottom sheet to select climbing styles |
| Route card | Tap | Navigates to Route Details for that route |
| Pull down | Swipe | Refresh route list from server |
| Scroll | Swipe up/down | Scrolls through route list; loads more via infinite scroll |

#### Navigation

| Trigger | Destination |
|---|---|
| Tap route card | `app/gym/[gymId]/route/[routeId].tsx` (Route Details) |
| Back button | `app/gym/[id].tsx` (Gym Main Page) |

---

### 5. Route Details

**File:** `app/gym/[gymId]/route/[routeId].tsx`
**Purpose:** Show all information about a single climbing route -- grade, set date, send status,
rating, style analysis, and a feed of community video submissions with sender comments.
**Mockup:** `Documentation/mockups/Route Details.png`, `Route Details-1.png`

#### Layout

The mockup shows two states of this screen. `Route Details.png` shows the basic view (no
"Add Ascent" button visible -- the user has already sent this route). `Route Details-1.png`
shows the full view with the "Add Ascent" button and the rating displayed. Both share the
same layout structure.

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, pt-4)
    RouteHeader (flex-row, items-start, gap-4)
      Image (route photo, ~120x120, rounded-xl)
      MetadataColumn (flex-1)
        Row (flex-row, items-center, gap-2)
          Text (route ID, text-2xl font-bold font-mono text-white)  // "#01"
          IconButton (Star, outline, toggle favorite)
        Text ("Rating: 4.2", text-sm text-secondary)               // if rated
        Row (flex-row, items-center, gap-1)
          Text ("Send Status:", text-sm text-secondary)
          Badge (variant: "success", checkmark emoji)               // if sent
        Text ("Grade: 5", text-sm text-secondary)
        Text ("Set on: 23 November", text-sm text-secondary)
        Button (variant: "ghost", "Style Analysis >", text-accent-light)

    ActionSection (mt-6)
      Button (variant: "secondary", full-width, "Add Ascent",
              border-accent, text-accent)
        // Shown when the user can log an ascent.
        // If NO active session: tapping prompts "Start session at [gym]?"
        // If active session: navigates directly to Ascent Form.

    VideoSubmissionsFeed (mt-8)
      Text ("Video Submissions:", text-lg font-semibold text-white, mb-4)
      VideoList (gap-3)
        VideoFeedItem (bg-surface, rounded-lg, p-3)
          Row (flex-row, items-center)
            Avatar (sm, user photo)
            Text (userName, text-base text-white, flex-1, ml-3)
            Icon (Heart, filled, color: heart)
            Text (count, text-sm text-secondary, ml-1)  // "57"
            Icon (ChevronRight, text-white, ml-2)
          CommentText (mt-2, text-sm text-secondary)
            // Sender's comment about the beta / video
            // e.g., "Heel hook on the second hold makes the crux way easier"

        VideoFeedItem ...  (repeats)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Image` | ~120x120, rounded-xl | Route photo, larger than the browse card thumbnail |
| `IconButton` | Star, toggleable | Favorite/unfavorite this route |
| `Badge` | variant: "success" | Green checkmark for "Send Status" when route is completed |
| `Button` | variant: "ghost" | "Style Analysis >" link navigates to style breakdown |
| `Button` | variant: "secondary" with accent border | "Add Ascent" button, outlined style with purple border and text. Behavior depends on active session state. |
| `Avatar` | size: "sm" | User photos next to video submission entries |
| `Icon` | Heart (filled, color: heart) | Red heart showing upvote count per video |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Star icon | Tap | Toggle route as favorite (optimistic update, synced to server) |
| "Style Analysis >" | Tap | Navigate to style analysis breakdown for this route |
| "Add Ascent" button (active session) | Tap | Navigate to Ascent Form for this route |
| "Add Ascent" button (no active session) | Tap | Prompt: "Start session at [gym name]?" -- Yes starts session then opens Ascent Form, No redirects to Map Browse |
| Video submission item | Tap | Navigate to video player/detail for that submission |
| Sender avatar / name | Tap | Navigate to that user's profile |
| Heart icon (on video item) | Tap | Upvote/un-upvote the video (heart fills/unfills, count updates) |
| Back gesture / button | Swipe right / tap back | Return to Gym Routes |

#### Navigation

| Trigger | Destination |
|---|---|
| "Add Ascent" (active session) | `app/gym/[gymId]/route/[routeId]/ascent.tsx` (Ascent Form) |
| "Add Ascent" (no session) | `app/start-session.tsx` (Start Session prompt) |
| "Style Analysis >" | `app/gym/[gymId]/route/[routeId]/style-analysis.tsx` (Route Style Analysis) |
| Video submission item | Video player screen (future, Phase 12) |
| Sender avatar / name | `app/profile/[userId].tsx` (Profile Other User) |
| Back | `app/gym/[id]/routes.tsx` (Gym Routes) |

---

### 6. Ascent Form

**File:** `app/gym/[gymId]/route/[routeId]/ascent.tsx`
**Purpose:** Log a climbing attempt (ascent) for a route. The climber rates the route, optionally
adds a beta video and comment, and tags the climbing styles involved.
**Mockup:** `Documentation/mockups/Ascent.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, pt-4)
    RouteHeaderCard (Card variant: "elevated", flex-row, items-start, gap-4,
                     border-accent, p-4)
      Image (route photo, ~80x80, rounded-xl)
      MetadataColumn (flex-1)
        Text ("#01", text-2xl font-bold font-mono text-white)
        Text ("Rating: 4.2", text-sm text-secondary)
        Text ("Send Status:", text-sm text-secondary)
        Text ("Grade: 5", text-sm text-secondary)
        Text ("Set on: 23 November", text-sm text-secondary)
        Button (variant: "ghost", "Style Analysis >", text-accent-light)

    RatingSection (mt-6)
      Text ("Your rating:", text-base font-semibold text-white, mb-2)
      StarRatingRow (flex-row, gap-2)
        Star (1) ... Star (5)   // tappable, fill with gold on select
        // Mockup shows 3 out of 5 filled (gold), 2 empty (muted)

    VideoSection (mt-6)
      Button (variant: "secondary", "Add Beta Video", leftIcon: Plus,
              full-width, border-dashed)
        // Dashed border suggests an upload zone; Plus icon indicates adding media

    CommentSection (mt-6)
      Text ("Add Comment:", text-base font-semibold text-white, mb-2)
      TextArea (bg-surface, border border-border, rounded, p-3,
                placeholder: "Your comment here...", multiline: true,
                maxLength: 200)
      Text ("0/200", text-xs text-muted, align: right)  // character counter

    TagSection (mt-6)
      Text ("Select Tags:", text-base font-semibold text-white, mb-2)
      TagGrid (flex-row, flex-wrap, gap-2)
        Badge (variant: "tag", color: red, "Power")
        Badge (variant: "tag", color: amber, "Finger Strength")
        Badge (variant: "tag", color: green, "Footwork")
        Badge (variant: "tag", color: blue, "Dynamic Movement")
        Badge (variant: "tag", color: purple, "Core Strength")
        Badge (variant: "tag", color: teal, "Technique")
        // Each tag is multi-select: tap to toggle on/off
        // Selected tags have full color; unselected have muted/outline style

    SubmitSection (mt-8, mb-8)
      Button (variant: "primary", full-width, "Add Ascent")
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Card` | variant: "elevated", border-accent | Route header card with purple accent border, same metadata as Route Details |
| `StarRating` | Custom component, 5 stars | Tappable star row; each star is an `IconButton` with Star icon |
| `Button` | variant: "secondary", dashed border | "Add Beta Video" upload trigger |
| `TextArea` | multiline TextInput | Comment box with placeholder and character counter |
| `Badge` | variant: "tag", multi-select | Climbing style tags in their designated colors (see DesignSystem.md) |
| `Button` | variant: "primary" | Final "Add Ascent" submission button |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Star (1-5) | Tap | Sets rating to that star's value. Stars 1 through N fill with gold, remaining stars stay empty. Tapping the same star again could deselect (toggle). |
| "Add Beta Video" | Tap | Opens camera/gallery picker to select or record a video |
| Comment textarea | Type | Free-text input, character counter updates in real-time |
| Style tag (any) | Tap | Toggles tag selection. Multiple tags can be selected simultaneously. Selected tags use full background color; deselected tags use muted/outline style. |
| "Add Ascent" button | Tap | Validates form -> calls ascent service to create the ascent record -> navigates back to Route Details with updated data |
| Back gesture | Swipe right | Discards form and returns to Route Details (with confirmation if form has data) |

#### Navigation

| Trigger | Destination |
|---|---|
| "Add Ascent" (successful submit) | `app/gym/[gymId]/route/[routeId].tsx` (Route Details) -- data refreshed |
| Back | `app/gym/[gymId]/route/[routeId].tsx` (Route Details) |
| Camera/gallery picker | Native OS media picker (returns to form with selected media) |

---

### 7. Start Session

**File:** `app/start-session.tsx` (modal)
**Purpose:** Quickly start a climbing session using location detection. Instead of manually
selecting country, city, and gym, the app detects the user's location and suggests the nearest
gym. This reduces friction from three taps (cascade dropdowns) to a single confirmation.
**Mockup:** Mockup: TBD (original mockup at `Documentation/mockups/Start Activity.png` shows
the old cascade-dropdown design; the new flow is location-based)

#### Layout

```
Screen (Modal presentation, bg-background, flex-1)
  ContentArea (px-4, flex-1, justify-center, items-center)
    IconSection (mb-6)
      Icon (MapPin, 48px, text-accent)
        // Location pin icon to reinforce the "we found you" concept

    PromptSection (items-center, gap-4)
      Text ("Start session at", text-xl text-white)
      Text (closestGymName, text-2xl font-bold text-accent-light)
        // e.g., "Sao Rock"
      Text (gymAddress, text-sm text-secondary, mt-1)
        // e.g., "Rua de Godim 312, Porto"

    ButtonSection (mt-8, w-full, gap-3, px-4)
      Button (variant: "primary", full-width, "Yes, start session!")
      Button (variant: "ghost", full-width, "No, choose another gym")

    LoadingState (shown while detecting location)
      ActivityIndicator (color: accent)
      Text ("Finding nearby gyms...", text-base text-secondary, mt-2)

    ErrorState (shown if no gym found / location unavailable)
      Text ("Could not detect nearby gym", text-base text-secondary)
      Button (variant: "primary", full-width, "Browse gyms on map")
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Icon` | MapPin, 48px | Large location icon reinforcing the geo-detection concept |
| `Text` | Various sizes | Gym name in accent-light bold, address in secondary |
| `Button` | variant: "primary" | "Yes, start session!" confirmation button |
| `Button` | variant: "ghost" | "No, choose another gym" secondary action |
| `ActivityIndicator` | color: accent | Shown while location is being detected |

#### Interactions

| Element | Action | Result |
|---|---|---|
| "Yes, start session!" | Tap | Creates a new climbing session at the detected gym. Navigates to Gym Main Page with active session indicator, or directly to Gym Routes. |
| "No, choose another gym" | Tap | Navigates to Map Browse so the user can pick a different gym |
| "Browse gyms on map" (error state) | Tap | Navigates to Map Browse |
| Back gesture / close modal | Swipe down | Dismisses the modal, returns to previous screen |

#### Navigation

| Trigger | Destination |
|---|---|
| "Yes, start session!" | `app/gym/[id].tsx` (Gym Main Page) with active session at the detected gym |
| "No, choose another gym" | `app/(tabs)/map.tsx` (Map Browse) |
| "Browse gyms on map" (error) | `app/(tabs)/map.tsx` (Map Browse) |
| Dismiss modal | Previous screen |

#### Design Note

The old design used cascading dropdowns (Country -> City -> Gym) which required three
sequential taps. The new location-based approach leverages the device's GPS to detect the
closest gym and present a single confirmation prompt. This is a much faster flow for the
common case (the climber is already at or near the gym they want to log for). If the
detection is wrong or the user wants a different gym, the "No" path redirects to Map Browse
where all gyms are visible and selectable.

---

### 8. Gym Main Page

**File:** `app/gym/[id].tsx`
**Purpose:** Hub for everything about a specific gym -- location, hours, social links -- and
provide navigation to the gym's routes, leaderboards, and style analysis. Also serves as
the launch point for starting a session at this gym.
**Mockup:** `Documentation/mockups/Gym Browse.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, pt-4)
    GymHeader (flex-row, items-start, gap-4)
      Avatar (size: "lg", source: gym logo, rounded square)
        // The gym logo is a rounded square, not fully circular
      HeaderInfo (flex-1)
        Row (flex-row, items-center, gap-2)
          Text (gymName, text-2xl font-bold text-white)  // "Sao Rock"
          IconButton (Star, outline, toggle favorite)
        Row (flex-row, items-center, gap-1, mt-1)
          Icon (MapPin, 16px, text-secondary)
          Text (address, text-sm text-secondary)         // "Rua de Godim 312"
        Row (flex-row, items-center, gap-1, mt-1)
          Icon (Clock, 16px, text-secondary)
          Text (hours, text-sm text-secondary)           // "Monday: 16:00 - 22:00"
          View (w-2 h-2 rounded-full bg-error, ml-1)    // Red dot = currently closed
        Text (socialHandle, text-sm text-accent-light, mt-1)
          // "@saorockclimbing"

    StartSessionButton (mt-6, px-4)
      Button (variant: "primary", full-width, size: "lg",
              "Start Session", leftIcon: Play)
        // Large prominent button to start a climbing session at this gym.
        // This is the primary call-to-action on the Gym Main Page.

    NavigationCards (mt-6, gap-4)
      Card (variant: "pressable", p-5)
        Row (flex-row, justify-between, items-center)
          Text ("Routes", text-xl font-semibold text-white)
          Icon (ChevronRight, text-white)

      Card (variant: "pressable", p-5)
        Row (flex-row, justify-between, items-center)
          Text ("Leaderboards", text-xl font-semibold text-white)
          Icon (ChevronRight, text-white)

      Card (variant: "pressable", p-5)
        Row (flex-row, justify-between, items-center)
          Text ("Style Analysis", text-xl font-semibold text-white)
          Icon (ChevronRight, text-white)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Avatar` | size: "lg", rounded square variant | Gym logo -- note this is a rounded square, not circular like user avatars |
| `IconButton` | Star, toggleable | Favorite/unfavorite this gym |
| `Icon` | MapPin, Clock (16px, text-secondary) | Small metadata icons for location and hours |
| `Button` | variant: "primary", size: "lg", leftIcon: Play | Large "Start Session" button -- the primary CTA on this screen |
| `Card` | variant: "pressable" | Three large navigation cards with text and chevron |

#### Visual Details

- **Red dot indicator:** Next to the hours text, a small red circle indicates the gym is
  currently closed. When open, this would be green (`bg-success`). This is a real-time status
  indicator calculated from the gym's operating hours and the user's current time.
- **Social handle:** Displayed in `accent-light` color, suggesting it is tappable (could open
  the gym's social media profile).
- **Start Session button:** Large, full-width purple button with a Play icon. Visually
  distinguished from the navigation cards below to indicate it is the primary action on
  this screen.

#### Interactions

| Element | Action | Result |
|---|---|---|
| Star icon | Tap | Toggle gym as favorite |
| Social handle | Tap | Open external link to gym's social media profile |
| "Start Session" button | Tap | Starts a climbing session at this gym, navigates to Gym Routes with active session indicator |
| "Routes" card | Tap | Navigate to Gym Routes for this gym |
| "Leaderboards" card | Tap | Navigate to Gym Leaderboards list for this gym |
| "Style Analysis" card | Tap | Navigate to style analysis for this gym |
| Back gesture | Swipe right | Return to previous screen |

#### Navigation

| Trigger | Destination |
|---|---|
| "Start Session" button | Active session started; navigate to `app/gym/[id]/routes.tsx` (Gym Routes) |
| "Routes" card | `app/gym/[id]/routes.tsx` (Gym Routes) |
| "Leaderboards" card | `app/gym/[id]/leaderboards.tsx` (Gym Leaderboards) |
| "Style Analysis" card | `app/gym/[id]/style-analysis.tsx` (Gym Style Analysis, future) |
| Back | Previous screen (Map Browse or Home) |

---

### 9. Map Browse

**File:** `app/(tabs)/map.tsx`
**Purpose:** Discover nearby climbing gyms on an interactive map. The map shows pin markers for
each gym, and a bottom sheet reveals the gym count with a list.
**Mockup:** `Documentation/mockups/Map Browse.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  SearchHeader (px-4, pt-4, position: absolute, top, z-10)
    TextInput (variant: "search", leftIcon: Search,
               placeholder: "Climbing Gyms")
    IconButton (Star, toggle favorites filter, mt-2)

  MapView (flex-1, full-screen behind search)
    MapMarker (for each gym, blue pin icon at lat/lng coordinates)
    MapMarker ...

  BottomSheet (position: absolute, bottom, above tab bar)
    SheetHandle (w-10 h-1 bg-border rounded-full, mx-auto, mb-2)
    Text ("5 gyms", text-base font-semibold text-white, text-center)
    // Expandable: pulling up reveals full gym list

  TabBar (fixed bottom, Map tab active with filled MapPin icon)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `TextInput` | search variant | Search bar overlaid on top of the map |
| `IconButton` | Star, toggleable | Filter to show only favorited gyms on the map |
| `MapView` | react-native-maps or expo MapView | Full-screen interactive map |
| `MapMarker` | Custom pin component | Blue/white pin icons at gym coordinates |
| `BottomSheet` | Expandable from bottom | Shows gym count in collapsed state; gym list when expanded |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Search bar | Type | Filters gym markers on the map and in the bottom sheet list |
| Star filter | Tap | Shows only favorited gyms |
| Map | Pinch/spread | Zoom in/out |
| Map | Pan/drag | Move to different area |
| Map marker | Tap | Highlights the gym and scrolls the bottom sheet to that gym's entry, or navigates to Gym Main Page |
| Bottom sheet | Swipe up | Expands to show full gym list |
| Bottom sheet gym entry | Tap | Navigate to Gym Main Page for that gym |

#### Navigation

| Trigger | Destination |
|---|---|
| Tap map marker or gym in list | `app/gym/[id].tsx` (Gym Main Page) |

#### Design Note

The map tab icon in the tab bar changes when active: it uses a filled `MapPin` with the
`accent` color, while inactive it uses an outline version in `text-muted`. The active map tab
in the mockup shows a distinct orange/amber tinted pin icon -- this may be a variant or could
be the accent purple appearing warm due to mockup rendering.

---

### 10. Leaderboard Detail

**File:** `app/gym/[gymId]/leaderboard/[leaderboardId].tsx`
**Purpose:** Display ranked climbers for a specific gym competition. Shows prizes, rules, and a
scrollable ranked list with special styling for the top 3 positions.
**Mockup:** `Documentation/mockups/Leaderboard.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, pt-4)
    TitleSection
      Text ("Sao Rock Leaderboards:", text-2xl font-bold text-white)

    CompetitionSelector (mt-4)
      TextInput (variant: "dropdown", rightIcon: ChevronDown,
                 value: "Sao Comp Dec 2025")

    PrizesSection (mt-4)
      Text ("Prizes:", text-base font-semibold text-white, mb-2)
      BulletList
        Text ("* La Sportiva Solution Comp", text-sm text-secondary)
        Text ("* Organic Chalk Bucket", text-sm text-secondary)
        Text ("* Chalkd Chalk Bag", text-sm text-secondary)

    RulesLink (mt-2)
      Button (variant: "ghost", "Rules", border border-accent,
              rounded-full, px-4)
        // Outlined button style for the "Rules" link

    RankedList (mt-6, gap-2)
      // Rank #1 -- Gold highlight
      RankRow (bg-gold/20, border border-gold, rounded-md, p-3,
               flex-row, items-center)
        Avatar (sm, user photo)
        Text (name, text-base font-bold text-white, flex-1, ml-3)
          // "Alex Honnold"
        Text (points, text-base font-bold font-mono text-white)
          // "57 points"

      // Rank #2 -- Silver/distinct styling
      RankRow (bg-surface-elevated, rounded-md, p-3, flex-row, items-center)
        Avatar (sm)
        Text ("Magnus Midtbe", flex-1, ml-3, font-semibold)
        Text ("54 points", font-mono)

      // Rank #3 -- Bronze/distinct styling
      RankRow (bg-surface-elevated, rounded-md, p-3, flex-row, items-center)
        Avatar (sm)
        Text ("Chris Sharma", flex-1, ml-3, font-semibold)
        Text ("52 points", font-mono)

      // Rank #4+ -- Standard styling
      RankRow (bg-surface, rounded-md, p-3, flex-row, items-center)
        Text (rank, text-base text-muted, w-8)   // "4"
        Avatar (sm)
        Text (name, flex-1, ml-3)
        Text (points, font-mono)

      RankRow ...  (repeats for all ranked climbers)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `TextInput` | dropdown variant | Competition selector to switch between different leaderboard events |
| `Button` | variant: "ghost" with border | "Rules" button has an outlined/bordered style |
| `Avatar` | size: "sm" | User photos next to each ranked entry |
| `Card` / `View` | Various backgrounds per rank | Top 3 have special styling; #1 gets gold gradient/border |

#### Podium Styling (Top 3)

The leaderboard mockup uses distinct visual treatment for the top 3:

| Rank | Background | Border | Text Weight | Notes |
|---|---|---|---|---|
| #1 (Gold) | Gold gradient overlay (`gold` at ~20% opacity) | `border-gold` | Bold | Most visually prominent row. In the mockup, the entire row has a warm golden tint. |
| #2 (Silver) | `surface-elevated` | Subtle or none | Semibold | Slightly elevated from standard rows |
| #3 (Bronze) | `surface-elevated` | Subtle or none | Semibold | Same as #2 but could have a bronze tint |
| #4+ | `surface` | None | Normal | Standard list rows with rank number on the left |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Competition dropdown | Tap | Opens picker to select a different competition/season at this gym. Leaderboard data reloads. |
| "Rules" button | Tap | Opens rules detail (modal or new screen) for the selected competition |
| Rank row | Tap | Navigate to that climber's profile |
| Scroll | Swipe up/down | Scroll through the ranked list |

#### Navigation

| Trigger | Destination |
|---|---|
| Tap rank row | `app/profile/[userId].tsx` (Profile Other User) for that climber |
| "Rules" button | Competition rules screen/modal (future) |
| Back | Previous screen (Gym Leaderboards, Enrolled Leaderboards, or Home feed) |

---

### 11. Profile (Own)

**File:** `app/(tabs)/profile.tsx`
**Purpose:** Display the current user's profile -- avatar, personal info, Pro status, streaks,
earned achievements, enrolled leaderboards, and activity history. This is the user's
"home base" in the app.
**Mockup:** `Documentation/mockups/Profile.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, pt-4, items-center)
    TopBar (flex-row, justify-end, w-full, mb-2)
      Button (variant: "ghost", "Edit", leftIcon: Pencil, text-accent-light)
        // Edit profile button in the top-right corner

    AvatarSection (items-center, mb-4)
      Avatar (size: "xl", source: user photo, badge: crown/rank overlay)
        // Large profile photo with optional achievement badge overlay
        // Mockup shows a small crown icon on top-left of avatar

    InfoSection (items-center, mb-4)
      Row (flex-row, items-center, gap-2)
        Text (name, text-3xl font-bold text-white)        // "Alex Honnold"
        ProBadge (bg-accent, rounded-full, px-2, py-0.5)
          Text ("PRO", text-xs font-bold text-white)
          // Only shown if user has Pro subscription
      Text ("Age: 40", text-sm text-secondary, mt-1)
      Text ("Favorite gym: Sao Rock", text-sm text-secondary, mt-1)

    StreaksSection (w-full, mb-6)
      Text ("Streaks", text-xl font-semibold text-white, mb-3)
      StreakRow (flex-row, justify-around)
        StreakItem (items-center)
          Icon (Flame, 24px, text-warning)
          Text ("12", text-lg font-bold text-white)
          Text ("Current", text-xs text-secondary)
        StreakItem (items-center)
          Icon (Flame, 24px, text-accent-light)
          Text ("34", text-lg font-bold text-white)
          Text ("Longest", text-xs text-secondary)
        StreakItem (items-center)
          Icon (Calendar, 24px, text-secondary)
          Text ("87", text-lg font-bold text-white)
          Text ("Total days", text-xs text-secondary)

    AchievementsSection (w-full, mb-6)
      Text ("Achievements", text-xl font-semibold text-white, mb-4)
        // Note: mockup has typo "Achievments" -- implementation should use "Achievements"
      AchievementRow (flex-row, justify-around)
        AchievementBadge (items-center)
          View (achievement icon, ~64x64, styled badge shape)
            // Hexagonal or shield-shaped badge with icon inside
          Text ("Conqueror", text-xs text-secondary, mt-1)
        AchievementBadge
          View (achievement icon)
          Text ("Full Control", text-xs text-secondary, mt-1)
        AchievementBadge
          View (achievement icon)
          Text ("Early Bird", text-xs text-secondary, mt-1)

    LeaderboardsSection (w-full, mb-6)
      Text ("Currently enrolled Leaderboards", text-xl font-semibold text-white, mb-4)
      LeaderboardList (gap-3)
        LeaderboardRow (flex-row, items-center, p-3)
          Avatar (size: "sm", source: gym logo)
          Text (competitionName, text-base text-white, flex-1, ml-3)
            // "Sao Comp Dec 2025"
          Text (rank, text-base font-bold font-mono text-accent-light)
            // "#1"

        LeaderboardRow ...
          // "TNW Season 15" -- #3
        LeaderboardRow ...
          // "Proa Contest v14" -- #3
        LeaderboardRow ...
          // "In the Zone 10" -- #7

    ActivityHistorySection (w-full, mb-6)
      Text ("Activity History", text-xl font-semibold text-white, mb-4)
      ActivityList (gap-3)
        ActivityItem (flex-row, items-start, gap-3, bg-surface, rounded-lg, p-3)
          DateColumn (items-center, w-10)
            Text (day, text-lg font-bold text-muted)
            Text (month, text-xs text-muted)
          ContentColumn (flex-1)
            Text (description, text-sm text-secondary)
              // e.g., "Sent route #14 (V5) at Sao Rock"
              // e.g., "Completed 3 routes in a session at Sao Rock"

        ActivityItem ...  (repeats, with pagination or "Load more")

  TabBar (fixed bottom, Profile tab active)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Avatar` | size: "xl", badge overlay | Large profile photo (~96x96) with optional crown/badge icon overlay |
| `Button` | variant: "ghost", leftIcon: Pencil | Edit profile button in the top-right area |
| `ProBadge` | Custom inline badge | Small purple "PRO" pill next to name, only shown for Pro subscribers |
| `Icon` | Flame, Calendar | Streak display icons |
| `AchievementBadge` | Custom component | Hexagonal or shield-shaped badge with icon + label. Color varies by achievement type. |
| `Avatar` | size: "sm" | Gym logos next to each leaderboard entry |
| `Card` / `View` | Leaderboard rows, activity items | Each enrolled competition shown as a row with gym logo, name, and rank |

#### Interactions

| Element | Action | Result |
|---|---|---|
| "Edit" button | Tap | Navigate to Edit Profile screen |
| Avatar | Tap | Open avatar editor / photo picker (future) |
| Achievement badge | Tap | Show achievement detail (name, description, date earned) in a modal or toast |
| Leaderboard row | Tap | Navigate to that leaderboard |
| Activity item | Tap | Navigate to route detail or session detail (if applicable) |
| Pull down | Swipe | Refresh profile data |

#### Navigation

| Trigger | Destination |
|---|---|
| "Edit" button | `app/profile/edit.tsx` (Edit Profile) |
| Tap leaderboard row | `app/gym/[gymId]/leaderboard/[leaderboardId].tsx` (Leaderboard Detail) |
| Tap achievement | Achievement detail modal (future, Phase 8) |
| Tap favorite gym | `app/gym/[id].tsx` (Gym Main Page) |

---

### 12. Enrolled Leaderboards

**File:** `app/(tabs)/leaderboards.tsx`
**Purpose:** Quick-access tab showing all leaderboards the user is currently participating in.
This replaces the old Routes tab and gives competitive climbers a one-tap path to check
their standings across all gyms.
**Mockup:** Mockup: TBD

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  HeaderSection (px-4, pt-4)
    Text ("My Leaderboards", text-2xl font-bold text-white)
    Text ("Competitions you're enrolled in", text-sm text-secondary, mt-1)

  LeaderboardList (FlatList, px-4, gap-3, mt-4)
    LeaderboardCard (Card variant: "pressable", p-4)
      Row (flex-row, items-center)
        Avatar (size: "sm", source: gym logo)
        ContentColumn (flex-1, ml-3)
          Text (competitionName, text-base font-semibold text-white)
            // "Sao Comp Dec 2025"
          Text (gymName, text-sm text-secondary)
            // "Sao Rock"
        RankColumn (items-center)
          Text (rank, text-xl font-bold font-mono text-accent-light)
            // "#1"
          Text (points, text-xs text-secondary)
            // "57 pts"
      StatusRow (flex-row, items-center, mt-2)
        Badge (variant: "success", "Active")
          // or variant: "warning", "Ending soon"
          // or variant: "info", "Just ended"
        Text (timeRemaining, text-xs text-muted, ml-2)
          // "12 days left" or "Ended 2 days ago"

    LeaderboardCard ...  (repeats for each enrolled leaderboard)

    EmptyState (shown when user has no enrolled leaderboards)
      Icon (Trophy, 48px, text-muted)
      Text ("No leaderboards yet", text-lg text-secondary, mt-4)
      Text ("Join a competition at your gym to see it here",
            text-sm text-muted, mt-1)
      Button (variant: "primary", "Find gyms", mt-4)

  TabBar (fixed bottom, Leaderboards tab active)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Card` | variant: "pressable" | Each enrolled leaderboard is a tappable card |
| `Avatar` | size: "sm" | Gym logo for each leaderboard |
| `Badge` | variant: "success" / "warning" / "info" | Status indicator for the leaderboard's lifecycle |
| `Icon` | Trophy, 48px | Empty state illustration icon |
| `Button` | variant: "primary" | CTA in empty state to discover gyms |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Leaderboard card | Tap | Navigate to the Leaderboard Detail for that competition |
| "Find gyms" (empty state) | Tap | Navigate to Map Browse to discover gyms with competitions |
| Pull down | Swipe | Refresh leaderboard data |
| Scroll | Swipe up/down | Scrolls through leaderboard list |

#### Navigation

| Trigger | Destination |
|---|---|
| Tap leaderboard card | `app/gym/[gymId]/leaderboard/[leaderboardId].tsx` (Leaderboard Detail) |
| "Find gyms" (empty state) | `app/(tabs)/map.tsx` (Map Browse) |

---

### 13. Gym Leaderboards

**File:** `app/gym/[id]/leaderboards.tsx`
**Purpose:** List all leaderboards for a specific gym. By default shows active and recently
ended leaderboards. A toggle reveals retired/archived leaderboards.
**Mockup:** Mockup: TBD

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  HeaderSection (px-4, pt-4)
    Row (flex-row, items-center, gap-2)
      IconButton (ArrowLeft, back to Gym Main Page)
      Text (gymName + " Leaderboards", text-xl font-bold text-white)
        // e.g., "Sao Rock Leaderboards"

  FilterSection (px-4, mt-4)
    SegmentedControl (flex-row, bg-surface, rounded-lg, p-1)
      Segment ("Active", selected by default)
      Segment ("Just Ended")
      Segment ("Retired")
        // Retired segment is a toggle that shows archived/completed leaderboards

  LeaderboardList (FlatList, px-4, gap-3, mt-4)
    LeaderboardCard (Card variant: "pressable", p-4)
      Row (flex-row, items-center)
        Icon (Trophy, 24px, text-accent-light)
        ContentColumn (flex-1, ml-3)
          Text (leaderboardName, text-base font-semibold text-white)
            // "Sao Comp Dec 2025"
          Text (dateRange, text-sm text-secondary)
            // "Nov 1 - Dec 31, 2025"
        StatusColumn (items-end)
          Badge (variant: "success", "Active")
            // or "Ended" / "Retired"
          Text (participantCount, text-xs text-muted, mt-1)
            // "42 climbers"

    LeaderboardCard ...  (repeats)

    EmptyState (shown if no leaderboards match the selected filter)
      Text ("No leaderboards found", text-base text-secondary)
      Text ("Check back later for new competitions",
            text-sm text-muted, mt-1)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `IconButton` | ArrowLeft | Back button navigating to Gym Main Page |
| `SegmentedControl` | Custom component, 3 segments | Filter tabs for leaderboard lifecycle state |
| `Card` | variant: "pressable" | Each leaderboard is a tappable card |
| `Icon` | Trophy, 24px | Decorative icon for each leaderboard entry |
| `Badge` | variant varies by status | Status indicator (Active, Ended, Retired) |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Back button | Tap | Returns to Gym Main Page |
| Segment ("Active") | Tap | Filters list to show only active leaderboards |
| Segment ("Just Ended") | Tap | Filters to recently ended leaderboards (within last ~2 weeks) |
| Segment ("Retired") | Tap | Shows archived/long-ended leaderboards |
| Leaderboard card | Tap | Navigate to Leaderboard Detail for that competition |
| Pull down | Swipe | Refresh leaderboard list |

#### Navigation

| Trigger | Destination |
|---|---|
| Tap leaderboard card | `app/gym/[gymId]/leaderboard/[leaderboardId].tsx` (Leaderboard Detail) |
| Back button | `app/gym/[id].tsx` (Gym Main Page) |

---

### 14. Profile (Other User)

**File:** `app/profile/[userId].tsx`
**Purpose:** View another user's profile. Same layout as own profile but with a Follow button
instead of an Edit button, and without editing capabilities.
**Mockup:** Mockup: TBD

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, pt-4, items-center)
    TopBar (flex-row, justify-between, w-full, mb-2)
      IconButton (ArrowLeft, back)
      Button (variant: "primary", "Follow", px-4, rounded-full)
        // or "Following" with variant: "secondary" if already following

    AvatarSection (items-center, mb-4)
      Avatar (size: "xl", source: user photo, badge: crown/rank overlay)

    InfoSection (items-center, mb-4)
      Row (flex-row, items-center, gap-2)
        Text (name, text-3xl font-bold text-white)
        ProBadge (bg-accent, rounded-full, px-2, py-0.5)
          Text ("PRO", text-xs font-bold text-white)
          // Only shown if this user has Pro subscription
      Text ("Age: 40", text-sm text-secondary, mt-1)
      Text ("Favorite gym: Sao Rock", text-sm text-secondary, mt-1)

    StreaksSection (w-full, mb-6)
      Text ("Streaks", text-xl font-semibold text-white, mb-3)
      StreakRow (flex-row, justify-around)
        StreakItem (items-center)
          Icon (Flame, 24px, text-warning)
          Text (currentStreak, text-lg font-bold text-white)
          Text ("Current", text-xs text-secondary)
        StreakItem (items-center)
          Icon (Flame, 24px, text-accent-light)
          Text (longestStreak, text-lg font-bold text-white)
          Text ("Longest", text-xs text-secondary)
        StreakItem (items-center)
          Icon (Calendar, 24px, text-secondary)
          Text (totalDays, text-lg font-bold text-white)
          Text ("Total days", text-xs text-secondary)

    AchievementsSection (w-full, mb-6)
      Text ("Achievements", text-xl font-semibold text-white, mb-4)
      AchievementRow (flex-row, justify-around)
        AchievementBadge (items-center)
          View (achievement icon, ~64x64, styled badge shape)
          Text (achievementName, text-xs text-secondary, mt-1)
        AchievementBadge ...
        AchievementBadge ...

    LeaderboardsSection (w-full, mb-6)
      Text ("Currently enrolled Leaderboards", text-xl font-semibold text-white, mb-4)
      LeaderboardList (gap-3)
        LeaderboardRow (flex-row, items-center, p-3)
          Avatar (size: "sm", source: gym logo)
          Text (competitionName, text-base text-white, flex-1, ml-3)
          Text (rank, text-base font-bold font-mono text-accent-light)

        LeaderboardRow ...

    ActivityHistorySection (w-full, mb-6)
      Text ("Activity History", text-xl font-semibold text-white, mb-4)
      ActivityList (gap-3)
        ActivityItem (flex-row, items-start, gap-3, bg-surface, rounded-lg, p-3)
          DateColumn (items-center, w-10)
            Text (day, text-lg font-bold text-muted)
            Text (month, text-xs text-muted)
          ContentColumn (flex-1)
            Text (description, text-sm text-secondary)

        ActivityItem ...
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `IconButton` | ArrowLeft | Back button |
| `Button` | variant: "primary" / "secondary" | "Follow" / "Following" toggle button |
| `Avatar` | size: "xl", badge overlay | Large profile photo |
| `ProBadge` | Custom inline badge | "PRO" pill, shown only for Pro subscribers |
| `Icon` | Flame, Calendar | Streak display icons |
| `AchievementBadge` | Custom component | Same as own profile |
| `Avatar` | size: "sm" | Gym logos next to leaderboard entries |

#### Interactions

| Element | Action | Result |
|---|---|---|
| "Follow" button | Tap | Toggles follow state. Button changes from "Follow" (primary) to "Following" (secondary). Optimistic update. |
| Achievement badge | Tap | Show achievement detail in a modal or toast |
| Leaderboard row | Tap | Navigate to that leaderboard |
| Favorite gym link | Tap | Navigate to that gym's main page |
| Activity item | Tap | Navigate to route detail or session detail (if applicable) |
| Back button | Tap | Return to previous screen |

#### Navigation

| Trigger | Destination |
|---|---|
| Tap leaderboard row | `app/gym/[gymId]/leaderboard/[leaderboardId].tsx` (Leaderboard Detail) |
| Tap favorite gym | `app/gym/[id].tsx` (Gym Main Page) |
| Back | Previous screen (leaderboard, home feed, etc.) |

---

### 15. Edit Profile

**File:** `app/profile/edit.tsx`
**Purpose:** Edit the current user's profile information -- name, age, avatar photo, favorite
gym, and preferred grade system.
**Mockup:** Mockup: TBD

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  HeaderBar (px-4, pt-4, flex-row, justify-between, items-center)
    Button (variant: "ghost", "Cancel", text-secondary)
    Text ("Edit Profile", text-lg font-semibold text-white)
    Button (variant: "ghost", "Save", text-accent-light)

  ScrollView (px-4, mt-4)
    AvatarEditSection (items-center, mb-6)
      Avatar (size: "xl", source: user photo)
      Button (variant: "ghost", "Change Photo", text-accent-light, mt-2)

    FormSection (gap-5)
      TextInput (label: "Display Name", value: currentName,
                 placeholder: "Your display name")
      TextInput (label: "Username", value: currentUsername,
                 leftIcon: AtSign, placeholder: "@username")
      TextInput (label: "Age", value: currentAge,
                 keyboardType: "numeric", placeholder: "Your age")
      DropdownField
        Text ("Favorite Gym", text-base font-semibold text-white, mb-2)
        TextInput (variant: "dropdown", rightIcon: ChevronDown,
                   value: currentFavoriteGym)
      DropdownField
        Text ("Preferred Grade System", text-base font-semibold text-white, mb-2)
        TextInput (variant: "dropdown", rightIcon: ChevronDown,
                   value: currentGradeSystem)
          // Options: V-Scale, Font, YDS
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Button` | variant: "ghost" | "Cancel" and "Save" header buttons |
| `Avatar` | size: "xl" | Editable profile photo |
| `TextInput` | Various configs | Form fields for name, username, age |
| `TextInput` | dropdown variant | Pickers for favorite gym and grade system |

#### Interactions

| Element | Action | Result |
|---|---|---|
| "Change Photo" | Tap | Opens camera/gallery picker for new avatar |
| Display name input | Type | Updates display name |
| Username input | Type | Updates username (validates uniqueness on blur) |
| Age input | Type | Updates age (numeric keyboard) |
| Favorite gym dropdown | Tap | Opens gym picker (list of all gyms) |
| Grade system dropdown | Tap | Opens picker: V-Scale, Font, YDS |
| "Save" button | Tap | Validates form -> updates profile via service -> navigates back to Profile |
| "Cancel" button | Tap | Discards changes and returns to Profile (with confirmation if form is dirty) |

#### Navigation

| Trigger | Destination |
|---|---|
| "Save" (successful) | `app/(tabs)/profile.tsx` (Profile) -- data refreshed |
| "Cancel" | `app/(tabs)/profile.tsx` (Profile) |
| Camera/gallery picker | Native OS media picker (returns to form with selected media) |

---

## Navigation Flow

This section describes how screens connect to each other. Understanding navigation flow is
essential because in Expo Router, **the file system determines the URL structure**, and
navigation between screens uses `router.push()`, `router.back()`, and `router.replace()`.

### Screen Relationship Diagram

```
                        +---------------------+
                        |     Auth Gate        |
                        |  (auth)/_layout.tsx  |
                        +------+--------------+
                               |
                    +----------+----------+
                    |                     |
              +-----v-----+       +-------v-------+
              |   Login    |<---->|    Sign Up     |
              |  (auth)/   |      |   (auth)/      |
              | login.tsx  |      |  register.tsx  |
              +-----+------+      +-------+--------+
                    |  (on auth success)  |
                    +----------+----------+
                               |
                    +----------v--------------+
                    |      Tab Navigator      |
                    |    (tabs)/_layout.tsx    |
                    +----------+--------------+
                               |
        +----------+-----------+-----------+----------+
        |          |           |           |          |
  +-----v--+ +----v-----+ +---v----+ +----v------+ +-v--------+
  |  Home  | |Map Browse| | FAB:   | |Enrolled   | | Profile  |
  | (Feed) | |          | |Start   | |Leaderb.   | | (Own)    |
  |index   | |map       | |Session | |leaderb.   | |profile   |
  +---+----+ +----+-----+ +---+----+ +----+------+ +----+-----+
      |           |            |           |             |
      |      +----v--------+  |      +----v--------+    |
      |      |Gym Main Page|  |      |Leaderboard  |    |
      |      |gym/[id]     |<-+      |Detail        |   |
      |      +--+-+--+-----+        |gym/[gymId]/  |    |
      |         | |  |              |leaderboard/  |    |
      |         | |  |              |[lbId]        |<---+
      |    +----+ |  +-----+        +------+-------+
      |    |      |        |               |
      | +--v-------+ +-----v--------+ +---v-----------+
      | |Gym Routes | |Gym Leader-  | |Profile (Other)|
      | |gym/[id]/  | |boards       | |profile/       |
      | |routes     | |gym/[id]/    | |[userId]       |
      | +--+--------+ |leaderboards | +---------------+
      |    |           +-----+-------+
      | +--v--------------+  |
      | |Route Detail      |  |
      | |gym/[gymId]/      |  |
      | |route/[routeId]   |  |
      | +--+--+------------+  |
      |    |  |               |
      | +--v--v--------+      |
      | |Ascent Form   |      |
      | |gym/[gymId]/   |     |
      | |route/[rId]/   |     |
      | |ascent         |     |
      | +---------------+     |
      |                       |
      +--->  (Home feed links to Gym Main Page,
              Leaderboard Detail, Profile Other User)

  Additional screens:
    +-- Edit Profile: app/profile/edit.tsx (from Profile Own)
    +-- Gym Style Analysis: app/gym/[id]/style-analysis.tsx (from Gym Main Page)
    +-- Route Style Analysis: app/gym/[gymId]/route/[routeId]/style-analysis.tsx (from Route Detail)
    +-- Start Session modal: app/start-session.tsx (from FAB)
```

### Primary Navigation Paths

These are the most common user journeys through the app:

#### Path 1: Browse and Log an Ascent

```
Home -> Gym name in feed -> Gym Main Page -> "Routes" card -> Gym Routes -> Tap route card -> Route Details -> "Add Ascent" -> Ascent Form -> Submit -> Route Details (updated)
```

This is the core loop of the app: find a route, climb it, log it.

#### Path 2: Quick-Start a Session

```
FAB (+ button) -> Start Session modal -> "Yes, start session!" -> Gym Main Page (session active) -> Gym Routes -> Route Details -> "Add Ascent" -> Ascent Form
```

The FAB is always visible in the tab bar, providing a one-tap shortcut to start logging.
Location detection eliminates the old Country -> City -> Gym cascade.

#### Path 3: Discover Gyms on Map

```
Map Browse tab -> Tap pin marker -> Gym Main Page -> "Routes" card -> Gym Routes -> Route Details
```

This path is for exploring new gyms while traveling or trying a new local gym.

#### Path 4: Check Competitive Standing

```
Enrolled Leaderboards tab -> Tap leaderboard -> Leaderboard Detail -> Tap climber -> Profile (Other User)
```

or

```
Home feed -> "Check the leaderboard!" link -> Leaderboard Detail -> Tap climber -> Profile (Other User)
```

or

```
Profile tab -> Tap enrolled leaderboard -> Leaderboard Detail
```

This path is for climbers tracking their ranking in competitions.

#### Path 5: Browse Gym Leaderboards

```
Map Browse -> Gym Main Page -> "Leaderboards" card -> Gym Leaderboards list -> Tap leaderboard -> Leaderboard Detail
```

This path is for discovering new competitions at a gym.

#### Path 6: View and Follow Other Climbers

```
Home feed -> Tap friend in feed -> Profile (Other User) -> "Follow" button
```

or

```
Leaderboard Detail -> Tap rank row -> Profile (Other User)
```

#### Path 7: Edit Own Profile

```
Profile tab -> "Edit" button -> Edit Profile -> "Save" -> Profile (updated)
```

### Navigation Behavior Rules

| Rule | Explanation |
|---|---|
| **Tab bar is persistent** | Visible on all `(tabs)/` screens. Tapping a tab resets that tab's navigation stack to the root screen. |
| **Detail screens use stack navigation** | Screens outside `(tabs)/` (like `gym/[id]`, `gym/[gymId]/route/[routeId]`, `gym/[gymId]/leaderboard/[leaderboardId]`) push onto the stack. The user can swipe right (iOS) or press the back button (Android) to return. |
| **Auth screens are gated** | `(auth)/` screens are shown only when the user is not authenticated. After login/signup, they are replaced (not pushed) with the tab navigator, so the user cannot "go back" to the login screen. |
| **Start Session is a modal** | The Start Session screen slides up from the bottom as a modal overlay. Dismissing it returns to the previous context. |
| **Modals slide up** | Screens like the Ascent Form and Start Session may be presented as modals (slide up from bottom) rather than stack pushes, depending on implementation. This gives a sense of "overlaying" the current context. |
| **Deep links** | Each screen has a deterministic URL path (e.g., `/gym/7/route/42`, `/gym/7/leaderboard/3`, `/profile/123`). This enables sharing links and notification deep-linking in later phases. |

---

## Appendix: Mockup-to-Screen Traceability

This table maps each mockup file to its screen spec and Expo Router file path for quick reference.

| Mockup File | Screen Name | File Path | Section |
|---|---|---|---|
| `Login.png` | Login | `app/(auth)/login.tsx` | [1. Login](#1-login) |
| `Sign Up.png` | Sign Up | `app/(auth)/register.tsx` | [2. Sign Up](#2-sign-up) |
| `Home.png` | Home / Activity Feed | `app/(tabs)/index.tsx` | [3. Home / Activity Feed](#3-home--activity-feed) |
| `Route Browse.png` | Gym Routes | `app/gym/[id]/routes.tsx` | [4. Gym Routes](#4-gym-routes) |
| `Route Browse-1.png` | Gym Routes (alt) | `app/gym/[id]/routes.tsx` | [4. Gym Routes](#4-gym-routes) |
| `Route Details.png` | Route Details | `app/gym/[gymId]/route/[routeId].tsx` | [5. Route Details](#5-route-details) |
| `Route Details-1.png` | Route Details (alt) | `app/gym/[gymId]/route/[routeId].tsx` | [5. Route Details](#5-route-details) |
| `Ascent.png` | Ascent Form | `app/gym/[gymId]/route/[routeId]/ascent.tsx` | [6. Ascent Form](#6-ascent-form) |
| `Start Activity.png` | Start Session | `app/start-session.tsx` | [7. Start Session](#7-start-session) |
| `Gym Browse.png` | Gym Main Page | `app/gym/[id].tsx` | [8. Gym Main Page](#8-gym-main-page) |
| `Map Browse.png` | Map Browse | `app/(tabs)/map.tsx` | [9. Map Browse](#9-map-browse) |
| `Leaderboard.png` | Leaderboard Detail | `app/gym/[gymId]/leaderboard/[leaderboardId].tsx` | [10. Leaderboard Detail](#10-leaderboard-detail) |
| `Profile.png` | Profile (Own) | `app/(tabs)/profile.tsx` | [11. Profile (Own)](#11-profile-own) |
| TBD | Enrolled Leaderboards | `app/(tabs)/leaderboards.tsx` | [12. Enrolled Leaderboards](#12-enrolled-leaderboards) |
| TBD | Gym Leaderboards | `app/gym/[id]/leaderboards.tsx` | [13. Gym Leaderboards](#13-gym-leaderboards) |
| TBD | Profile (Other User) | `app/profile/[userId].tsx` | [14. Profile (Other User)](#14-profile-other-user) |
| TBD | Edit Profile | `app/profile/edit.tsx` | [15. Edit Profile](#15-edit-profile) |
