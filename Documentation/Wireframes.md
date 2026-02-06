# Beta Breaker -- Wireframe Specifications

**Version:** 1.0 (MVP)
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
   - [4. Route Browse](#4-route-browse)
   - [5. Route Details](#5-route-details)
   - [6. Ascent Form](#6-ascent-form)
   - [7. Start Activity](#7-start-activity)
   - [8. Gym Browse](#8-gym-browse)
   - [9. Map Browse](#9-map-browse)
   - [10. Leaderboard](#10-leaderboard)
   - [11. Profile](#11-profile)
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

The tab bar is the persistent bottom navigation visible on all main screens (Home, Map,
Routes, Profile, and Start Activity). It is implemented by Expo Router's `(tabs)/_layout.tsx`.

### Structure

```
TabBar (fixed at bottom, bg-background, border-t border-border, h-14)
  ├── Tab: Home        (Home icon, 28px)          → app/(tabs)/index.tsx
  ├── Tab: Map         (MapPin icon, 28px)         → app/(tabs)/map.tsx
  ├── FAB: Center (+)  (Plus icon, purple circle)  → app/(tabs)/activity.tsx
  ├── Tab: Routes      (List icon, 28px)           → app/(tabs)/routes.tsx
  └── Tab: Profile     (User icon, 28px)           → app/(tabs)/profile.tsx
```

### Visual Details

- **5 slots** arranged in a horizontal row, evenly spaced.
- **Active tab:** Icon color changes to `accent` (#7C3AED). Inactive tabs use `text-muted` (#6B6B80).
- **FAB (Floating Action Button):** The center slot is not a standard tab -- it is a 56x56px
  circle with `bg-accent` and the `Plus` icon in white. It is elevated above the tab bar by
  approximately 12px, creating a "floating" effect. A purple glow (`accent-glow`) radiates
  behind it. This draws the user's eye to the primary action: starting a climbing session.
- **Why a FAB?** The "start activity" action is the most important thing a climber does in
  the app. Elevating it above the tab bar makes it instantly discoverable and reachable with
  a thumb, even on large phones. This is a common pattern in fitness and social apps (think
  Instagram's camera button or Strava's record button).

### Tab Bar Visibility

- **Visible on:** All `(tabs)/` screens (Home, Map, Routes, Profile, Start Activity).
- **Hidden on:** Auth screens (`(auth)/`), detail screens (`route/[id]`, `gym/[id]`,
  `leaderboard/[id]`), and modal overlays (ascent form).

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
                 placeholder: "••••••••", secureTextEntry: true)
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
                 placeholder: "••••••••", secureTextEntry: true)
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
**Purpose:** Welcome the user and show a chronological feed of events that happened since
their last visit -- new routes, leaderboard changes, video milestones, competition results.
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
            // e.g., "São Rock had new routesetting! 🧗"
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
| Link text (e.g., "Check out the new routes!") | Tap | Navigates to the relevant screen (routes list, leaderboard, video submission, etc.) |
| Pull down | Swipe | Refresh feed data |
| Feed item (full row) | Tap | Could also navigate to the relevant detail screen |

#### Navigation

| Trigger | Destination |
|---|---|
| "Check out the new routes!" | `app/(tabs)/routes.tsx` (Route Browse) filtered to new routes at that gym |
| "Check the leaderboard!" | `app/leaderboard/[id].tsx` (Leaderboard) for the mentioned competition |
| "Check the submission!" | Route detail or video submission detail |
| "Check them out!" | Video submissions list |
| "Check the results!" | Competition results / leaderboard |

---

### 4. Route Browse

**File:** `app/(tabs)/routes.tsx`
**Purpose:** Search, filter, and browse climbing routes at the selected gym. This is the
primary discovery screen where climbers find their next challenge.
**Mockup:** `Documentation/mockups/Route Browse.png`, `Route Browse-1.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  HeaderSection (px-4, pt-4)
    TextInput (variant: "search", leftIcon: Search,
               placeholder: "Route name/ID")

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

  TabBar (fixed bottom, with FAB center)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `TextInput` | search variant, leftIcon: Search | Search bar at top for filtering by route name or ID |
| `IconButton` | Star icon, toggleable | Filters list to show only favorited routes |
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
| Tap route card | `app/route/[id].tsx` (Route Details) |
| FAB (center +) | `app/(tabs)/activity.tsx` (Start Activity) |

---

### 5. Route Details

**File:** `app/route/[id].tsx`
**Purpose:** Show all information about a single climbing route -- grade, set date, send status,
rating, style analysis, and community video submissions.
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
        Text ("Rating: 4.2 ⭐", text-sm text-secondary)            // if rated
        Row (flex-row, items-center, gap-1)
          Text ("Send Status:", text-sm text-secondary)
          Badge (variant: "success", checkmark emoji)               // ✅ if sent
        Text ("Grade: 5", text-sm text-secondary)
        Text ("Set on: 23 November", text-sm text-secondary)
        Button (variant: "ghost", "Style Analysis >", text-accent-light)

    ActionSection (mt-6)
      Button (variant: "secondary", full-width, "Add Ascent",
              border-accent, text-accent)
        // Only shown if user has not yet logged an ascent,
        // or can log another attempt

    VideoSection (mt-8)
      Text ("Video Submissions:", text-lg font-semibold text-white, mb-4)
      VideoList (gap-3)
        VideoRow (flex-row, items-center)
          Avatar (sm, user photo)
          Text (userName, text-base text-white, flex-1, ml-3)
          Icon (Heart, filled, color: heart)
          Text (count, text-sm text-secondary, ml-1)  // "57"
          Icon (ChevronRight, text-white, ml-2)

        VideoRow ...  (repeats)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Image` | ~120x120, rounded-xl | Route photo, larger than the browse card thumbnail |
| `IconButton` | Star, toggleable | Favorite/unfavorite this route |
| `Badge` | variant: "success" | Green checkmark for "Send Status" when route is completed |
| `Button` | variant: "ghost" | "Style Analysis >" link navigates to style breakdown |
| `Button` | variant: "secondary" with accent border | "Add Ascent" button, outlined style with purple border and text |
| `Avatar` | size: "sm" | User photos next to video submission entries |
| `Icon` | Heart (filled, color: heart) | Red heart showing upvote count per video |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Star icon | Tap | Toggle route as favorite (optimistic update, synced to server) |
| "Style Analysis >" | Tap | Navigate to style analysis breakdown for this route |
| "Add Ascent" button | Tap | Navigate to Ascent Form for this route |
| Video submission row | Tap | Navigate to video player/detail for that submission |
| Heart icon (on video row) | Tap | Upvote/un-upvote the video (heart fills/unfills, count updates) |
| Back gesture / button | Swipe right / tap back | Return to Route Browse |

#### Navigation

| Trigger | Destination |
|---|---|
| "Add Ascent" button | `app/route/[id]/ascent.tsx` (Ascent Form) |
| "Style Analysis >" | Style analysis screen (future) |
| Video submission row | Video player screen (future, Phase 12) |
| Back | `app/(tabs)/routes.tsx` (Route Browse) |

---

### 6. Ascent Form

**File:** `app/route/[id]/ascent.tsx`
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
        Text ("Rating: 4.2 ⭐", text-sm text-secondary)
        Text ("Send Status: ✅", text-sm text-secondary)
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
| "Add Ascent" (successful submit) | `app/route/[id].tsx` (Route Details) -- data refreshed |
| Back | `app/route/[id].tsx` (Route Details) |
| Camera/gallery picker | Native OS media picker (returns to form with selected media) |

---

### 7. Start Activity

**File:** `app/(tabs)/activity.tsx`
**Purpose:** Select a gym to start a climbing session. This is a minimal screen -- the user
picks their location (country, city, gym) and taps "Start Activity" to begin logging ascents.
**Mockup:** `Documentation/mockups/Start Activity.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ContentArea (px-4, pt-8, flex-1)
    DropdownSection (gap-6)
      DropdownField
        Text ("Country:", text-base font-semibold text-white, mb-2)
        TextInput (variant: "dropdown", rightIcon: ChevronDown,
                   value: "Portugal", bg-surface)

      DropdownField
        Text ("City:", text-base font-semibold text-white, mb-2)
        TextInput (variant: "dropdown", rightIcon: ChevronDown,
                   value: "Porto", bg-surface)

      DropdownField
        Text ("Gym:", text-base font-semibold text-white, mb-2)
        TextInput (variant: "dropdown", rightIcon: ChevronDown,
                   value: "São Rock", bg-surface)

    Spacer (flex-1)

    ActionSection (mb-8)
      Button (variant: "primary", full-width, "Start Activity")

  TabBar (fixed bottom)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `TextInput` | dropdown variant, rightIcon: ChevronDown | Each selector appears as a text input with a dropdown arrow. Tapping opens a picker/bottom sheet. |
| `Button` | variant: "primary" | Purple "Start Activity" button, pushed toward the bottom of the screen |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Country dropdown | Tap | Opens country picker (bottom sheet or modal list). Selected value updates the city dropdown options. |
| City dropdown | Tap | Opens city picker, filtered by selected country. Selected value updates the gym dropdown options. |
| Gym dropdown | Tap | Opens gym picker, filtered by selected city. |
| "Start Activity" button | Tap | Creates a new climbing session for the selected gym. Navigates to the active session view (or Route Browse filtered to that gym). |

#### Navigation

| Trigger | Destination |
|---|---|
| "Start Activity" | Active session screen or `app/(tabs)/routes.tsx` filtered to the selected gym |

#### Design Note

This is intentionally a simple screen. The cascading dropdowns (Country -> City -> Gym) are a
**dependent selector** pattern: each selection constrains the next dropdown's options. This
prevents the user from selecting an invalid combination (e.g., a gym in Porto but city set to
Lisbon). The data for these dropdowns comes from the `gyms` table in Supabase, grouped by
location fields.

---

### 8. Gym Browse

**File:** `app/gym/[id].tsx`
**Purpose:** Show details about a specific gym -- location, hours, social links -- and provide
navigation to the gym's routes, leaderboards, and style analysis.
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
          Text (gymName, text-2xl font-bold text-white)  // "São Rock"
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

    NavigationCards (mt-8, gap-4)
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

  TabBar (fixed bottom)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Avatar` | size: "lg", rounded square variant | Gym logo -- note this is a rounded square, not circular like user avatars |
| `IconButton` | Star, toggleable | Favorite/unfavorite this gym |
| `Icon` | MapPin, Clock (16px, text-secondary) | Small metadata icons for location and hours |
| `Card` | variant: "pressable" | Three large navigation cards with text and chevron |

#### Visual Details

- **Red dot indicator:** Next to the hours text, a small red circle indicates the gym is
  currently closed. When open, this would be green (`bg-success`). This is a real-time status
  indicator calculated from the gym's operating hours and the user's current time.
- **Social handle:** Displayed in `accent-light` color, suggesting it is tappable (could open
  the gym's social media profile).

#### Interactions

| Element | Action | Result |
|---|---|---|
| Star icon | Tap | Toggle gym as favorite |
| Social handle | Tap | Open external link to gym's social media profile |
| "Routes" card | Tap | Navigate to Route Browse filtered to this gym |
| "Leaderboards" card | Tap | Navigate to Leaderboard list for this gym |
| "Style Analysis" card | Tap | Navigate to style analysis for this gym |
| Back gesture | Swipe right | Return to previous screen |

#### Navigation

| Trigger | Destination |
|---|---|
| "Routes" card | `app/(tabs)/routes.tsx` filtered to this gym, or `app/gym/[id]/routes.tsx` |
| "Leaderboards" card | `app/leaderboard/[id].tsx` for this gym |
| "Style Analysis" card | Style analysis screen for this gym (future) |
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
| Map marker | Tap | Highlights the gym and scrolls the bottom sheet to that gym's entry, or navigates to Gym Browse |
| Bottom sheet | Swipe up | Expands to show full gym list |
| Bottom sheet gym entry | Tap | Navigate to Gym Browse for that gym |

#### Navigation

| Trigger | Destination |
|---|---|
| Tap map marker or gym in list | `app/gym/[id].tsx` (Gym Browse) |

#### Design Note

The map tab icon in the tab bar changes when active: it uses a filled `MapPin` with the
`accent` color, while inactive it uses an outline version in `text-muted`. The active map tab
in the mockup shows a distinct orange/amber tinted pin icon -- this may be a variant or could
be the accent purple appearing warm due to mockup rendering.

---

### 10. Leaderboard

**File:** `app/leaderboard/[id].tsx`
**Purpose:** Display ranked climbers for a specific gym competition. Shows prizes, rules, and a
scrollable ranked list with special styling for the top 3 positions.
**Mockup:** `Documentation/mockups/Leaderboard.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, pt-4)
    TitleSection
      Text ("São Rock Leaderboards:", text-2xl font-bold text-white)

    CompetitionSelector (mt-4)
      TextInput (variant: "dropdown", rightIcon: ChevronDown,
                 value: "São Comp Dec 2025")

    PrizesSection (mt-4)
      Text ("Prizes:", text-base font-semibold text-white, mb-2)
      BulletList
        Text ("• La Sportiva Solution Comp", text-sm text-secondary)
        Text ("• Organic Chalk Bucket", text-sm text-secondary)
        Text ("• Chalkd Chalk Bag", text-sm text-secondary)

    RulesLink (mt-2)
      Button (variant: "ghost", "Rules", border border-accent,
              rounded-full, px-4)
        // Outlined button style for the "Rules" link

    RankedList (mt-6, gap-2)
      // Rank #1 — Gold highlight
      RankRow (bg-gold/20, border border-gold, rounded-md, p-3,
               flex-row, items-center)
        Avatar (sm, user photo)
        Text (name, text-base font-bold text-white, flex-1, ml-3)
          // "Alex Honnold"
        Text (points, text-base font-bold font-mono text-white)
          // "57 points"

      // Rank #2 — Silver/distinct styling
      RankRow (bg-surface-elevated, rounded-md, p-3, flex-row, items-center)
        Avatar (sm)
        Text ("Magnus Midtbe", flex-1, ml-3, font-semibold)
        Text ("54 points", font-mono)

      // Rank #3 — Bronze/distinct styling
      RankRow (bg-surface-elevated, rounded-md, p-3, flex-row, items-center)
        Avatar (sm)
        Text ("Chris Sharma", flex-1, ml-3, font-semibold)
        Text ("52 points", font-mono)

      // Rank #4+ — Standard styling
      RankRow (bg-surface, rounded-md, p-3, flex-row, items-center)
        Text (rank, text-base text-muted, w-8)   // "4"
        Avatar (sm)
        Text (name, flex-1, ml-3)
        Text (points, font-mono)

      RankRow ...  (repeats for all ranked climbers)

  TabBar (fixed bottom)
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
| Tap rank row | `app/(tabs)/profile.tsx` or `app/profile/[id].tsx` for that climber |
| "Rules" button | Competition rules screen/modal (future) |
| Back | Previous screen (Gym Browse or Home feed) |

---

### 11. Profile

**File:** `app/(tabs)/profile.tsx`
**Purpose:** Display the current user's profile -- avatar, personal info, earned achievements,
and leaderboard enrollments. This is the user's "home base" in the app.
**Mockup:** `Documentation/mockups/Profile.png`

#### Layout

```
Screen (SafeAreaView, bg-background, flex-1)
  ScrollView (px-4, pt-4, items-center)
    AvatarSection (items-center, mb-4)
      Avatar (size: "xl", source: user photo, badge: crown/rank overlay)
        // Large profile photo with optional achievement badge overlay
        // Mockup shows a small crown icon on top-left of avatar

    InfoSection (items-center, mb-6)
      Text (name, text-3xl font-bold text-white)        // "Alex Honnold"
      Text ("Age: 40", text-sm text-secondary, mt-1)
      Text ("Favorite gym: São Rock", text-sm text-secondary, mt-1)

    AchievementsSection (w-full, mb-6)
      Text ("Achievments", text-xl font-semibold text-white, mb-4)
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

    LeaderboardsSection (w-full)
      Text ("Currently enrolled Leaderboards", text-xl font-semibold text-white, mb-4)
      LeaderboardList (gap-3)
        LeaderboardRow (flex-row, items-center, p-3)
          Avatar (size: "sm", source: gym logo)
          Text (competitionName, text-base text-white, flex-1, ml-3)
            // "São Comp Dec 2025"
          Text (rank, text-base font-bold font-mono text-accent-light)
            // "#1"

        LeaderboardRow ...
          // "TNW Season 15" — #3
        LeaderboardRow ...
          // "Proa Contest v14" — #3
        LeaderboardRow ...
          // "In the Zone 10" — #7

  TabBar (fixed bottom, Profile tab active)
```

#### Components Used

| Component | Props / Config | Notes |
|---|---|---|
| `Avatar` | size: "xl", badge overlay | Large profile photo (~96x96) with optional crown/badge icon overlay |
| `AchievementBadge` | Custom component | Hexagonal or shield-shaped badge with icon + label. Color varies by achievement type. |
| `Avatar` | size: "sm" | Gym logos next to each leaderboard entry |
| `Card` / `View` | Leaderboard rows | Each enrolled competition shown as a row with gym logo, name, and rank |

#### Interactions

| Element | Action | Result |
|---|---|---|
| Avatar | Tap | Open avatar editor / photo picker (future) |
| Achievement badge | Tap | Show achievement detail (name, description, date earned) in a modal or toast |
| Leaderboard row | Tap | Navigate to that leaderboard |
| Pull down | Swipe | Refresh profile data |

#### Navigation

| Trigger | Destination |
|---|---|
| Tap leaderboard row | `app/leaderboard/[id].tsx` for that competition |
| Tap achievement | Achievement detail modal (future, Phase 8) |
| Edit profile (implied) | Profile edit screen (future, Phase 16) |

---

## Navigation Flow

This section describes how screens connect to each other. Understanding navigation flow is
essential because in Expo Router, **the file system determines the URL structure**, and
navigation between screens uses `router.push()`, `router.back()`, and `router.replace()`.

### Screen Relationship Diagram

```
                        ┌─────────────────────┐
                        │   Auth Gate          │
                        │  (auth)/_layout.tsx  │
                        └──────┬──────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────▼─────┐       ┌───────▼───────┐
              │   Login    │◄────►│    Sign Up     │
              │  (auth)/   │      │   (auth)/      │
              │ login.tsx  │      │  register.tsx  │
              └─────┬──────┘      └───────┬────────┘
                    │  (on auth success)  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────────┐
                    │     Tab Navigator       │
                    │   (tabs)/_layout.tsx     │
                    └──────────┬──────────────┘
                               │
          ┌────────┬───────────┼───────────┬──────────┐
          │        │           │           │          │
    ┌─────▼──┐ ┌───▼────┐ ┌───▼────┐ ┌────▼────┐ ┌──▼──────┐
    │  Home  │ │  Map   │ │Start   │ │ Routes  │ │ Profile │
    │index   │ │map     │ │Activity│ │routes   │ │profile  │
    └───┬────┘ └───┬────┘ └────────┘ └────┬────┘ └────┬────┘
        │          │                      │           │
        │     ┌────▼─────┐          ┌─────▼──────┐   │
        │     │Gym Browse│◄─────────│Route Detail│   │
        │     │gym/[id]  │          │route/[id]  │   │
        │     └────┬─────┘          └─────┬──────┘   │
        │          │                      │           │
        │     ┌────▼────────┐       ┌─────▼──────┐   │
        │     │Leaderboard  │◄──────│Ascent Form │   │
        │     │leaderboard/ │       │route/[id]/ │   │
        └────►│[id]         │◄──────│ascent      │   │
              └─────────────┘       └────────────┘   │
                    ▲                                 │
                    └─────────────────────────────────┘
```

### Primary Navigation Paths

These are the most common user journeys through the app:

#### Path 1: Browse and Log an Ascent

```
Home → Routes tab → Tap route card → Route Details → "Add Ascent" → Ascent Form → Submit → Route Details (updated)
```

This is the core loop of the app: find a route, climb it, log it.

#### Path 2: Discover Gyms on Map

```
Map tab → Tap pin marker → Gym Browse → "Routes" card → Route Browse (filtered) → Route Details
```

This path is for exploring new gyms while traveling or trying a new local gym.

#### Path 3: Check Competitive Standing

```
Home feed → "Check the leaderboard!" link → Leaderboard → Tap climber → Profile
```

or

```
Profile tab → Tap enrolled leaderboard → Leaderboard
```

This path is for climbers tracking their ranking in competitions.

#### Path 4: Start a Climbing Session

```
FAB (+ button) → Start Activity → Select gym → "Start Activity" → Route Browse (session active)
```

The FAB is always visible in the tab bar, providing a one-tap shortcut to start logging.

### Navigation Behavior Rules

| Rule | Explanation |
|---|---|
| **Tab bar is persistent** | Visible on all `(tabs)/` screens. Tapping a tab resets that tab's navigation stack to the root screen. |
| **Detail screens use stack navigation** | Screens outside `(tabs)/` (like `route/[id]`, `gym/[id]`, `leaderboard/[id]`) push onto the stack. The user can swipe right (iOS) or press the back button (Android) to return. |
| **Auth screens are gated** | `(auth)/` screens are shown only when the user is not authenticated. After login/signup, they are replaced (not pushed) with the tab navigator, so the user cannot "go back" to the login screen. |
| **Modals slide up** | Screens like the Ascent Form may be presented as modals (slide up from bottom) rather than stack pushes, depending on implementation. This gives a sense of "overlaying" the current context. |
| **Deep links** | Each screen has a deterministic URL path (e.g., `/route/42`, `/gym/7`, `/leaderboard/3`). This enables sharing links and notification deep-linking in later phases. |

---

## Appendix: Mockup-to-Screen Traceability

This table maps each mockup file to its screen spec and Expo Router file path for quick reference.

| Mockup File | Screen Name | File Path | Section |
|---|---|---|---|
| `Login.png` | Login | `app/(auth)/login.tsx` | [1. Login](#1-login) |
| `Sign Up.png` | Sign Up | `app/(auth)/register.tsx` | [2. Sign Up](#2-sign-up) |
| `Home.png` | Home / Activity Feed | `app/(tabs)/index.tsx` | [3. Home / Activity Feed](#3-home--activity-feed) |
| `Route Browse.png` | Route Browse | `app/(tabs)/routes.tsx` | [4. Route Browse](#4-route-browse) |
| `Route Browse-1.png` | Route Browse (alt) | `app/(tabs)/routes.tsx` | [4. Route Browse](#4-route-browse) |
| `Route Details.png` | Route Details | `app/route/[id].tsx` | [5. Route Details](#5-route-details) |
| `Route Details-1.png` | Route Details (alt) | `app/route/[id].tsx` | [5. Route Details](#5-route-details) |
| `Ascent.png` | Ascent Form | `app/route/[id]/ascent.tsx` | [6. Ascent Form](#6-ascent-form) |
| `Start Activity.png` | Start Activity | `app/(tabs)/activity.tsx` | [7. Start Activity](#7-start-activity) |
| `Gym Browse.png` | Gym Browse | `app/gym/[id].tsx` | [8. Gym Browse](#8-gym-browse) |
| `Map Browse.png` | Map Browse | `app/(tabs)/map.tsx` | [9. Map Browse](#9-map-browse) |
| `Leaderboard.png` | Leaderboard | `app/leaderboard/[id].tsx` | [10. Leaderboard](#10-leaderboard) |
| `Profile.png` | Profile | `app/(tabs)/profile.tsx` | [11. Profile](#11-profile) |
