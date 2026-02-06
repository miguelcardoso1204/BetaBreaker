# Beta Breaker -- Design System

**Version:** 1.0 (MVP)
**Last updated:** 2026-02-06
**Source of truth:** Figma mockup screenshots in `Documentation/mockups/` (13 screens)
**Implementation:** NativeWind v4 (Tailwind CSS for React Native)

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Colors](#colors)
3. [Typography](#typography)
4. [Spacing](#spacing)
5. [Border Radius](#border-radius)
6. [Shadows & Elevation](#shadows--elevation)
7. [Motion Strategy](#motion-strategy)
8. [Iconography](#iconography)
9. [Dark Mode Strategy](#dark-mode-strategy)
10. [Component Inventory](#component-inventory)

---

## Design Philosophy

### Why Dark-First?

Beta Breaker is designed for indoor climbing gyms -- environments with dramatic overhead lighting, chalk dust, and climbers checking their phones between attempts. A dark-first UI was chosen for three practical reasons:

1. **Gym lighting.** Indoor climbing walls are brightly lit while surrounding areas are dim. A dark UI reduces eye strain when transitioning between looking at the wall and checking the app on a bench.
2. **OLED battery savings.** Most modern phones use OLED displays where true black pixels are turned off entirely, saving meaningful battery life during long climbing sessions.
3. **Visual hierarchy.** The deep dark backgrounds (`#0A0A0F`) make the purple accent (`#7C3AED`) and route photos pop with high contrast, drawing the climber's eye to the content that matters: routes, grades, and social activity.

### Why Purple Accent?

Purple sits between the energy of red and the calm of blue -- it conveys both ambition and community. In the mockups, the purple accent is used sparingly (primary buttons, the FAB, links) so it always commands attention when it appears. Purple also differentiates Beta Breaker from the green/orange palettes common in outdoor fitness apps.

### Design Principles

- **Content over chrome.** Route photos and climbing data should dominate the screen; UI elements recede into the dark background.
- **Progressive disclosure.** Show essential info (grade, route number) on browse screens; reveal details (style tags, video submissions, comments) only on drill-down.
- **Accessible by default.** All text/background combinations meet WCAG AA contrast ratios (4.5:1 for body text, 3:1 for large text).
- **Offline-aware.** Designs account for offline states -- components should degrade gracefully when data is unavailable.

---

## Colors

### Core Palette

These tokens are extracted directly from the mockup screenshots. Each token has a semantic name describing its purpose, not its visual appearance -- this makes the system resilient to future theme changes.

| Token Name | Hex (Dark) | Usage | Notes |
|---|---|---|---|
| `background` | `#0A0A0F` | Screen backgrounds | Near-black with a slight blue undertone, warmer than pure `#000` |
| `surface` | `#1C1C28` | Cards, input fields, list items | Visible in route cards, dropdown selectors, gym info cards |
| `surface-elevated` | `#252536` | Selected/highlighted cards, modals, bottom sheets | Seen on the selected route (#01) in Route Browse, the ascent form |
| `border` | `#2A2A3C` | Subtle borders on inputs, card edges, dividers | Visible on login form inputs, route card separators |
| `text-primary` | `#FFFFFF` | Headings, primary text, route numbers | "Welcome Back", route "#01", climber names |
| `text-secondary` | `#A0A0B8` | Subtitles, metadata, placeholder text | "Grade: 5", "Set on: 23 November", input placeholders |
| `text-muted` | `#6B6B80` | Disabled text, hints, tertiary info | "Forgot Password?", date stamps in home feed |
| `accent` | `#7C3AED` | Primary buttons, FAB background, active tab icon | "Sign in" button, central "+" FAB, active home icon |
| `accent-hover` | `#6D28D9` | Button pressed/active state | Slightly darker purple for press feedback |
| `accent-light` | `#8B5CF6` | Links, secondary accent highlights | "Check out the new routes!", "Style Analysis" link |
| `accent-glow` | `rgba(124, 58, 237, 0.3)` | FAB glow effect, button shadow | The soft purple halo around the FAB in all screens |

### Semantic Colors

| Token Name | Hex | Usage | Notes |
|---|---|---|---|
| `success` | `#22C55E` | Verified/send status badges, success states | Green checkmark on "Send Status" in route details |
| `warning` | `#F59E0B` | "New!" badges on routes, caution states | Yellow "New!" label on routes #02 and #03 |
| `error` | `#EF4444` | Error messages, destructive actions | Form validation errors, delete confirmations |
| `info` | `#3B82F6` | Informational badges, links | Blue tag color for style tags |

### Interactive Element Colors

| Token Name | Hex | Usage | Notes |
|---|---|---|---|
| `heart` | `#EF4444` | Filled heart/upvote icon | Red hearts on video submissions (57, 35, 28...) |
| `heart-outline` | `#A0A0B8` | Unfilled heart icon | Matches `text-secondary` for visual consistency |
| `star-filled` | `#FFD700` | Filled rating stars | Gold stars in the "Your rating" section of Ascent screen |
| `star-empty` | `#6B6B80` | Empty rating stars | Matches `text-muted` for unfilled stars |

### Leaderboard Podium Colors

These are used on the leaderboard screen for the top 3 positions. The gold/silver/bronze convention is universally understood, which reduces cognitive load for competitive features.

| Token Name | Hex | Usage | Notes |
|---|---|---|---|
| `gold` | `#FFD700` | 1st place row highlight | Gold gradient/highlight on Alex Honnold's row |
| `silver` | `#C0C0C0` | 2nd place row highlight | Silver tint on Magnus Midtbe's row |
| `bronze` | `#CD7F32` | 3rd place row highlight | Bronze tint on Chris Sharma's row |

### Climbing Style Tag Colors

Tags are color-coded by climbing style to help climbers quickly scan for their preferred training focus. Each color is chosen from a spread across the color wheel to maximize distinguishability, even for colorblind users when paired with the text label.

| Tag | Hex | Tailwind Class |
|---|---|---|
| Power | `#EF4444` | `bg-red-500` |
| Finger Strength | `#F59E0B` | `bg-amber-500` |
| Footwork | `#22C55E` | `bg-green-500` |
| Dynamic Movement | `#3B82F6` | `bg-blue-500` |
| Core Strength | `#A855F7` | `bg-purple-500` |
| Technique | `#14B8A6` | `bg-teal-500` |

---

## Typography

### Why System Fonts?

Beta Breaker uses the platform's default system font (San Francisco on iOS, Roboto on Android) for all UI text. This is intentional for three reasons:

1. **Familiarity.** Users already read system fonts all day -- there is zero cognitive adjustment needed.
2. **Performance.** No custom font files to download or bundle, reducing app size and eliminating font-loading flicker.
3. **Accessibility.** System fonts respect the user's OS-level font size and Dynamic Type settings automatically.

The only exception is `SpaceMono`, which is used for monospaced content like route IDs and grade numbers -- places where fixed-width alignment improves scanability.

### Font Families

| Token | Value | Usage |
|---|---|---|
| `font-sans` | System default (San Francisco / Roboto) | All body text, headings, labels, buttons |
| `font-mono` | `SpaceMono` | Route IDs (#01), grade numbers, code-like data, leaderboard scores |

### Type Scale

The scale follows a modular progression. Each step is roughly 1.2x the previous size (a "minor third" ratio), which creates a natural visual rhythm. Sizes are in logical pixels (dp/pt) -- React Native handles density scaling automatically.

| Token | Size | Line Height | Usage |
|---|---|---|---|
| `text-xs` | 12px | 16px | Timestamps, fine print, badge counts |
| `text-sm` | 14px | 20px | Metadata ("Grade: 5"), secondary labels, tag text |
| `text-base` | 16px | 24px | Body text, list items, input text |
| `text-lg` | 18px | 28px | Section headers ("Video Submissions:"), card titles |
| `text-xl` | 20px | 28px | Screen subtitles, prominent labels |
| `text-2xl` | 24px | 32px | Route numbers ("#01"), climber names on profile |
| `text-3xl` | 30px | 36px | Screen titles ("Welcome Back"), gym names |
| `text-4xl` | 36px | 40px | Hero text ("Miguel!"), large feature headings |

### Font Weights

| Token | Weight | Usage |
|---|---|---|
| `font-normal` | 400 | Body text, metadata, descriptions |
| `font-medium` | 500 | Labels, input text, secondary headings |
| `font-semibold` | 600 | Card titles, button text, navigation items |
| `font-bold` | 700 | Screen titles, hero text, emphasized data ("3rd place", "100 upvotes") |

### Typography Combinations (Common Patterns)

These are the most-used type combinations extracted from the mockups, provided as quick-reference for developers:

| Pattern | Classes | Example |
|---|---|---|
| Screen title | `text-3xl font-bold text-white` | "Welcome Back" on Home |
| Accent name | `text-4xl font-bold text-accent-light` | "Miguel!" on Home |
| Card title | `text-2xl font-bold text-white` | "#01" on Route Browse |
| Card subtitle | `text-sm text-secondary` | "Grade: 5" on Route Browse |
| Section heading | `text-lg font-semibold text-white` | "Video Submissions:" |
| Body text | `text-base text-secondary` | Feed items on Home |
| Link text | `text-sm text-accent-light` | "Check out the new routes!" |
| Muted text | `text-sm text-muted` | "Forgot Password?" |
| Button text | `text-base font-semibold text-white` | "Sign in", "Start Activity" |
| Input placeholder | `text-base text-muted` | "Username", "yourname@gmail.com" |

---

## Spacing

### Why a 4px Base Grid?

All spacing in Beta Breaker is built on a 4px base unit. This is the most common base in mobile design because:

- **Touch targets.** Mobile tap targets need to be at least 44px (Apple) or 48px (Material). With a 4px grid, 44px = 11 units and 48px = 12 units -- both clean multiples.
- **Consistency.** When every margin, padding, and gap is a multiple of 4, layouts align automatically. No more "3px here, 7px there" drift.
- **Tailwind alignment.** NativeWind/Tailwind's default spacing scale is already 4px-based (`p-1` = 4px, `p-2` = 8px, etc.), so our tokens map 1:1 with no custom overrides needed.

### Spacing Scale

| Token | Value | Tailwind | Common Usage |
|---|---|---|---|
| `space-0` | 0px | `p-0` / `m-0` | Reset, flush edges |
| `space-0.5` | 2px | `p-0.5` | Hairline gaps (e.g., between icon and badge count) |
| `space-1` | 4px | `p-1` | Tight padding inside tags, inline spacing |
| `space-1.5` | 6px | `p-1.5` | Compact internal padding |
| `space-2` | 8px | `p-2` | Inner padding of small elements (tags, badges) |
| `space-3` | 12px | `p-3` | Input internal padding, icon-to-text gap |
| `space-4` | 16px | `p-4` | Standard card padding, section spacing |
| `space-5` | 20px | `p-5` | Generous card padding on detail screens |
| `space-6` | 24px | `p-6` | Section gap between content blocks |
| `space-8` | 32px | `p-8` | Major section dividers, screen top padding |
| `space-10` | 40px | `p-10` | Large gaps (e.g., between form and social login) |
| `space-12` | 48px | `p-12` | Tab bar height, generous vertical spacing |
| `space-16` | 64px | `p-16` | Bottom safe area padding (above tab bar) |

### Layout Spacing Patterns

Extracted from the mockups -- these are the recurring spacing values that appear across screens:

| Pattern | Value | Where It Appears |
|---|---|---|
| Screen horizontal padding | 16px (`px-4`) | All screens use consistent horizontal margins |
| Card internal padding | 16px (`p-4`) | Route cards, gym info cards, form sections |
| List item gap | 12px (`gap-3`) | Route list, leaderboard entries, video submissions |
| Section vertical gap | 24px (`gap-6`) | Between "Achievements" and "Leaderboards" on Profile |
| Input vertical gap | 16px (`gap-4`) | Between form fields on Login/Sign Up |
| Tab bar height | 56px | Bottom navigation across all screens |
| FAB size | 56px | Central "+" floating action button |

---

## Border Radius

### Why These Specific Values?

Border radius choices communicate hierarchy: sharper corners feel more precise and data-like, while rounder corners feel more friendly and tappable. Beta Breaker uses a spectrum from subtle rounding on data containers to fully round on interactive elements.

| Token | Value | Tailwind | Usage |
|---|---|---|---|
| `rounded-sm` | 4px | `rounded-sm` | Tags, small badges, inline chips |
| `rounded` | 8px | `rounded` | Input fields, dropdown selectors |
| `rounded-lg` | 12px | `rounded-lg` | Route cards, gym info cards, form containers |
| `rounded-xl` | 16px | `rounded-xl` | Buttons ("Sign in", "Start Activity"), elevated cards, modals |
| `rounded-2xl` | 20px | `rounded-2xl` | Image thumbnails (route photos), profile avatar |
| `rounded-full` | 9999px | `rounded-full` | FAB, circular avatars, style tag pills |

### Radius Patterns from Mockups

| Element | Radius | Example |
|---|---|---|
| Primary buttons | `rounded-xl` (16px) | "Sign in", "Sign up", "Start Activity", "Add Ascent" |
| Input fields | `rounded` (8px) | Username, password, email inputs |
| Route cards | `rounded-md` (12px) | Cards on Route Browse screen |
| Route photo thumbnail | `rounded-xl` (24px) | Route image in Route Details |
| Climber avatars (list) | `rounded-full` | Circular avatars in video submissions, leaderboard |
| Profile avatar (large) | `rounded-2xl` (32px) | Profile screen hero avatar (slightly squared circle) |
| Achievement badges | `rounded-2xl` | Hexagonal-ish badge shapes on Profile |
| Tab bar container | `rounded-lg` (top only) | Slight rounding on tab bar's top edge |
| Style tags | `rounded-full` | "Power", "Finger Strength", etc. on Ascent screen |
| Dropdown selectors | `rounded` (8px) | Country/City/Gym pickers on Start Activity |

---

## Shadows & Elevation

### Elevation Model

React Native does not support CSS `box-shadow` natively. Instead, we use a combination of:
- **iOS:** `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius` (native shadow API)
- **Android:** `elevation` (Material Design elevation system)
- **NativeWind:** Uses `shadow-*` utilities that map to the correct platform API

The mockups show a subtle, layered elevation system where higher elements cast softer, more spread shadows. On the dark background, shadows are barely visible but create a sense of depth through contrast with `surface-elevated` colors.

### Shadow Scale

| Token | iOS Shadow | Android Elevation | Usage |
|---|---|---|---|
| `shadow-none` | No shadow | `elevation: 0` | Flat elements, default state |
| `shadow-sm` | `offset: {0, 1}`, opacity: 0.15, radius: 2 | `elevation: 2` | List items, subtle card lift |
| `shadow-card` | `offset: {0, 2}`, opacity: 0.2, radius: 4 | `elevation: 4` | Route cards, gym cards, form containers |
| `shadow-button` | `offset: {0, 4}`, opacity: 0.25, radius: 8 | `elevation: 6` | Primary buttons, "Add Ascent" |
| `shadow-fab` | `offset: {0, 6}`, opacity: 0.3, radius: 12 | `elevation: 8` | Central FAB ("+" button) |
| `shadow-modal` | `offset: {0, 8}`, opacity: 0.35, radius: 16 | `elevation: 12` | Bottom sheets, modals, overlay dialogs |

### The FAB Glow Effect

The floating action button in the mockups has a distinctive purple glow. This is achieved by layering:

1. A standard shadow (`shadow-fab`) for depth
2. A colored shadow using `accent-glow` (`rgba(124, 58, 237, 0.3)`) with a large blur radius

In NativeWind, this requires a custom style since Tailwind's shadow utilities don't support colored shadows. We define this as a reusable style in the FAB component:

```
shadowColor: '#7C3AED'
shadowOffset: { width: 0, height: 0 }
shadowOpacity: 0.5
shadowRadius: 16
elevation: 8
```

---

## Motion Strategy

### Philosophy

Motion in Beta Breaker serves three purposes: **orient** the user (where did I come from?), **focus** attention (what's new?), and **delight** (this feels polished). Motion should never block interaction or slow the user down -- climbers check the app in short bursts between attempts.

All animations use `react-native-reanimated` for 60fps native-thread performance. Layout animations use the `LayoutAnimation` API for list changes.

### Page Transitions

| Transition | Animation | Duration | Easing | When |
|---|---|---|---|---|
| Forward navigation | `SlideInRight` | 300ms | `ease-out` | Pushing a new screen (e.g., Route Browse -> Route Details) |
| Back navigation | `SlideOutRight` | 250ms | `ease-in` | Popping back to previous screen |
| Modal presentation | `SlideInUp` + `FadeIn` | 300ms | `ease-out` | Bottom sheets, ascent form overlay |
| Modal dismissal | `SlideOutDown` + `FadeOut` | 250ms | `ease-in` | Closing bottom sheets |
| Tab switch | `FadeIn` | 200ms | `ease-in-out` | Switching between tab bar sections |

### List & Content Animations

| Animation | Config | Usage |
|---|---|---|
| Staggered reveal | FadeInUp, 50ms delay per item | Route list on Route Browse, leaderboard entries, video submissions |
| Pull-to-refresh | Spring physics (damping: 15, stiffness: 150) | Refreshing any list screen |
| Item insertion | LayoutAnimation.configureNext() | New items appearing after sync |
| Item removal | FadeOut + SlideOutLeft, 200ms | Removing items from lists |

**Why staggered reveals over a single batch fade?** Staggered animations (each item fading in 50ms after the previous) create a "waterfall" effect that draws the eye downward through the list. This subtly guides the user to scroll and discover more content. A single batch fade gives no directional cue and feels less polished.

### Micro-Interactions

| Interaction | Animation | Duration | Usage |
|---|---|---|---|
| Button press | Scale to 0.97 | 100ms | All tappable buttons and cards |
| Button release | Scale back to 1.0 | 150ms (spring) | Return to rest state |
| Heart/upvote tap | Scale to 1.3 then bounce to 1.0 | 300ms (spring) | Heart icon on video submissions |
| Star rating tap | Scale to 1.2 with color fill | 200ms | Rating stars on Ascent screen |
| FAB press | Scale to 0.92 + glow pulse | 150ms | Central "+" button |
| Toggle/switch | Spring slide (damping: 20) | 200ms | Toggle switches in settings |
| Badge earned | BounceIn + particle burst | 500ms | Achievement unlock notification |

### Loading States

| State | Animation | Usage |
|---|---|---|
| Skeleton loading | Pulse shimmer (opacity 0.3 -> 0.7, 1.5s loop) | Card placeholders while data loads |
| Spinner | Rotate 360deg, 800ms linear loop | Inline loading indicators |
| Progress bar | Width animation with spring easing | Upload progress (video submissions) |
| Pull-to-refresh | Custom spring physics | List refresh indicator |

### Accessibility: Respecting `reduceMotion`

**This is critical.** Some users have vestibular disorders where motion can cause nausea or disorientation. Beta Breaker checks `useReducedMotion()` from `react-native-reanimated` and replaces all animations with instant state changes when the user has enabled "Reduce Motion" in their OS accessibility settings.

```typescript
// Example pattern for all animated components:
const reduceMotion = useReducedMotion();
const enteringAnimation = reduceMotion ? undefined : FadeInUp.delay(index * 50);
```

---

## Iconography

### Icon Library

Beta Breaker uses **lucide-react-native** as its primary icon set. Lucide was chosen over alternatives for these reasons:

- **Consistency.** All 1000+ icons follow the same 24x24 grid, 2px stroke width, and rounded cap style. This visual consistency across every screen is more important than having "the perfect icon" for each use case.
- **Tree-shakeable.** Only the icons actually imported are included in the bundle -- no bloated icon font file.
- **React Native native.** Built on `react-native-svg`, so icons are true vector graphics that render crisply at any size.
- **Open source.** MIT licensed, community maintained, actively updated.

### Icon Sizing

| Context | Size | Stroke Width | Usage |
|---|---|---|---|
| Inline with text | 16px | 2 | Small indicators next to labels |
| Default / standalone | 24px | 2 | Standard icons in lists, cards, actions |
| Tab bar | 28px | 2 | Bottom navigation tab icons |
| Feature icon | 32px | 1.5 | Empty states, onboarding illustrations |
| Hero / empty state | 48px | 1.5 | Large empty-state illustrations |

### Icon Color Rules

Icons inherit the text color of their context by default. Specific overrides:

| State | Color Token | Example |
|---|---|---|
| Default (in text context) | `text-secondary` (#A0A0B8) | Metadata icons, inactive tab icons |
| Active / selected | `accent` (#7C3AED) | Active tab icon, selected filter |
| Interactive | `text-primary` (#FFFFFF) | Chevron ">" on route cards, navigation arrows |
| Destructive | `error` (#EF4444) | Delete actions, error indicators |
| Success | `success` (#22C55E) | Checkmarks, verified badges |
| Filled heart | `heart` (#EF4444) | Upvoted video submissions |
| Unfilled heart | `heart-outline` (#A0A0B8) | Not-yet-upvoted submissions |

### Icon Inventory (Key Icons from Mockups)

| Icon | Lucide Name | Where Used |
|---|---|---|
| Home | `Home` | Tab bar |
| Map pin | `MapPin` | Tab bar (gym map), location indicators |
| Plus | `Plus` | FAB (central action button) |
| List | `List` / `Menu` | Tab bar (routes/activity) |
| User | `User` | Tab bar (profile) |
| Search | `Search` | Search bars on Route Browse, Map Browse |
| Star | `Star` | Route ratings, favorites |
| Heart | `Heart` | Video submission upvotes |
| Chevron right | `ChevronRight` | Navigation arrows on route cards, gym cards |
| Lock | `Lock` | Password field icon |
| Mail | `Mail` | Email field icon |
| User circle | `CircleUser` | Username field icon |
| Eye / Eye off | `Eye` / `EyeOff` | Password visibility toggle |
| Clock | `Clock` | Operating hours on Gym Browse |
| Calendar | `Calendar` | "Set on" dates in Route Details |
| Filter | `SlidersHorizontal` | Filter controls on Route Browse |
| Camera | `Camera` | "Add Beta Video" button |
| Trophy | `Trophy` | Leaderboard, competition icons |
| Award | `Award` | Achievement badges |
| QR code | `QrCode` | QR scanning feature |

---

## Dark Mode Strategy

### Dark is the Default

Unlike most apps that treat dark mode as an afterthought toggle, Beta Breaker is designed **dark-first**. The mockups were all created in dark mode, and the color tokens above represent the dark theme. This means:

1. All component development starts with dark mode styling
2. Dark mode is the default theme on first launch
3. Light mode is a derivative created by transforming the dark palette

### How Theme Switching Works

```
User's OS setting (useColorScheme())
         |
         v
  React Native provides "light" or "dark"
         |
         v
  NativeWind's `dark:` variant classes activate
         |
         v
  Components render with the appropriate palette
```

The theme is driven by `useColorScheme()` from React Native, which reads the user's OS-level appearance setting. No in-app toggle is needed for MVP -- the app respects the system preference. (An in-app override can be added in Phase 16: Profile & Settings.)

### NativeWind Dark Mode Configuration

In `tailwind.config.js`, dark mode is set to `class` strategy so NativeWind can toggle it:

```javascript
module.exports = {
  darkMode: 'class',
  // ...
};
```

Components use the `dark:` prefix for dark-mode values. Since dark is our primary design, we define dark colors as the `dark:` variants and light colors as the defaults:

```tsx
// Example: A card component
<View className="bg-white dark:bg-surface rounded-md p-4 border border-gray-200 dark:border-border">
  <Text className="text-gray-900 dark:text-primary">Route #01</Text>
  <Text className="text-gray-500 dark:text-secondary">Grade: 5</Text>
</View>
```

### Light Mode Color Mapping

The light palette inverts the luminance relationships while keeping the accent purple consistent. This ensures brand recognition across both themes.

| Token | Dark Value | Light Value | Notes |
|---|---|---|---|
| `background` | `#0A0A0F` | `#FFFFFF` | Pure white for max readability |
| `surface` | `#1C1C28` | `#F5F5F7` | Light gray cards |
| `surface-elevated` | `#252536` | `#FFFFFF` | White elevated cards with shadow |
| `border` | `#2A2A3C` | `#E5E5EA` | Standard light border gray |
| `text-primary` | `#FFFFFF` | `#1A1A1A` | Near-black for readability |
| `text-secondary` | `#A0A0B8` | `#6B6B80` | Medium gray |
| `text-muted` | `#6B6B80` | `#A0A0B8` | Swapped with secondary |
| `accent` | `#7C3AED` | `#7C3AED` | **Same** -- purple works on both |
| `accent-hover` | `#6D28D9` | `#6D28D9` | **Same** |
| `accent-light` | `#8B5CF6` | `#7C3AED` | Slightly darker on light for contrast |
| `accent-glow` | `rgba(124,58,237,0.3)` | `rgba(124,58,237,0.15)` | Reduced opacity on light backgrounds |
| `success` | `#22C55E` | `#16A34A` | Slightly darker green for contrast |
| `warning` | `#F59E0B` | `#D97706` | Slightly darker amber |
| `error` | `#EF4444` | `#DC2626` | Slightly darker red |

---

## Component Inventory

These are the base UI components needed to build every screen in the mockups. Each component is built with NativeWind, fully typed with TypeScript, and follows the design tokens defined above. Components live in `components/ui/`.

### Button

**Purpose:** Primary interactive element for form submissions and actions.
**Seen in:** Login ("Sign in"), Sign Up ("Sign up"), Start Activity ("Start Activity"), Ascent ("Add Ascent"), Route Details ("Add Ascent")

| Variant | Style | Usage |
|---|---|---|
| `primary` | `bg-accent rounded-full` with white text | Main CTAs: "Sign in", "Start Activity", "Add Ascent" |
| `secondary` | `bg-surface border border-border rounded-xl` | Secondary actions, cancel buttons |
| `ghost` | Transparent with `text-accent-light` | Inline text-like buttons, "Forgot Password?" |
| `destructive` | `bg-error rounded-full` with white text | Delete, destructive confirmations |

**Props:** `variant`, `size` (sm/md/lg), `disabled`, `loading`, `onPress`, `children`
**Behavior:** Press scales to 0.97; loading state shows spinner and disables press; disabled state reduces opacity to 0.5.

### TextInput

**Purpose:** Text entry fields for forms and search.
**Seen in:** Login (username, password), Sign Up (email, name, password), Route Browse (search), Map Browse (search), Start Activity (dropdowns)

**Structure:** Label above, input field with optional left icon and optional right icon (e.g., eye toggle for password).
**Style:** `bg-surface border border-border rounded p-3`, placeholder in `text-muted`, value in `text-primary`.
**Props:** `label`, `placeholder`, `value`, `onChangeText`, `leftIcon`, `rightIcon`, `error` (string), `secureTextEntry`
**Error state:** Red border (`border-error`) with error message text below in `text-error`.

### Card

**Purpose:** Container for grouped content with consistent padding and elevation.
**Seen in:** Route Browse (route cards), Gym Browse (gym info cards, menu items), Home (feed items), Profile (leaderboard enrollments)

| Variant | Style | Usage |
|---|---|---|
| `default` | `bg-surface rounded-md p-4 shadow-card` | Standard card container |
| `elevated` | `bg-surface-elevated rounded-md p-4 shadow-card border border-border` | Selected/highlighted cards |
| `pressable` | Same as `default` + press scale animation + chevron | Navigable cards (route cards, gym menu items) |

**Props:** `variant`, `onPress`, `children`

### Badge

**Purpose:** Small status indicators and labels.
**Seen in:** Route Browse ("New!" badges), Route Details ("Send Status" verified badge), Profile (achievement badges), Ascent (style tags)

| Variant | Style | Usage |
|---|---|---|
| `warning` | `bg-warning text-black rounded-sm px-2 py-0.5` | "New!" route badge |
| `success` | `bg-success text-white rounded-sm px-2 py-0.5` | Verified/send status |
| `tag` | `bg-{color} text-white rounded-full px-3 py-1` | Climbing style tags (Power, Footwork, etc.) |
| `rank` | `bg-gold/silver/bronze text-black rounded-sm px-2 py-0.5` | Leaderboard position |

**Props:** `variant`, `color` (for tags), `children`

### IconButton

**Purpose:** Tappable icon with optional label for toolbars and actions.
**Seen in:** Tab bar icons, filter icons on Route Browse, star rating, heart/upvote buttons

**Style:** 44x44px minimum touch target (Apple HIG), icon centered, optional circular background.
**Props:** `icon` (Lucide icon component), `size`, `color`, `onPress`, `active` (boolean for toggled state), `label` (accessibility)
**Behavior:** Press scales to 0.95; active state changes icon color to `accent`.

### Divider

**Purpose:** Visual separator between content sections.
**Seen in:** Between form fields and social login on Login/Sign Up, between sections on Profile

**Style:** `h-px bg-border` (1px line in `border` color), optional "or" text centered.
**Props:** `text` (optional centered label like "Or continue with")

### Avatar

**Purpose:** Circular user/gym profile image.
**Seen in:** Profile (large hero avatar), Leaderboard (small row avatars), Video Submissions (small row avatars), Gym Browse (gym logo)

| Size | Dimensions | Usage |
|---|---|---|
| `xs` | 24x24px | Inline with text |
| `sm` | 32x32px | List rows (leaderboard, video submissions) |
| `md` | 40x40px | Comment authors, gym logos |
| `lg` | 64x64px | Gym detail header |
| `xl` | 96x96px | Profile hero image |

**Style:** `rounded-full` with `border-2 border-border`, fallback to initials on colored background when no image available.
**Props:** `source` (image URI), `size`, `fallbackText` (for initials), `badge` (optional overlay like crown icon on Profile)

---

## Token Reference: Tailwind Config Mapping

This section shows how the design tokens above map to the `tailwind.config.js` `theme.extend` object. This is the source of truth for implementation in Step 3.4.

```javascript
// tailwind.config.js — theme.extend preview
// Full implementation will be in the actual config file
{
  colors: {
    background: '#0A0A0F',
    surface: {
      DEFAULT: '#1C1C28',
      elevated: '#252536',
    },
    border: '#2A2A3C',
    'text-primary': '#FFFFFF',
    'text-secondary': '#A0A0B8',
    'text-muted': '#6B6B80',
    accent: {
      DEFAULT: '#7C3AED',
      hover: '#6D28D9',
      light: '#8B5CF6',
      glow: 'rgba(124, 58, 237, 0.3)',
    },
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    heart: '#EF4444',
    'heart-outline': '#A0A0B8',
    gold: '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
  },
  fontFamily: {
    sans: ['System'],
    mono: ['SpaceMono'],
  },
  borderRadius: {
    sm: '4px',
    DEFAULT: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '32px',
    full: '9999px',
  },
}
```

---

## Appendix: Mockup-to-Token Traceability

This table maps each mockup screen to the primary tokens and components used, so developers can quickly reference which tokens apply where.

| Mockup | Key Tokens Used | Components Used |
|---|---|---|
| `Login.png` | background, surface, border, accent, text-primary, text-muted | TextInput, Button (primary, ghost), Divider, IconButton |
| `Sign Up.png` | background, surface, border, accent, success, text-secondary | TextInput, Button (primary), Divider |
| `Home.png` | background, text-primary, accent-light, text-secondary, text-muted | Card, Badge, Avatar |
| `Route Browse.png` | background, surface, surface-elevated, warning, text-primary | Card (pressable), Badge (warning), TextInput (search) |
| `Route Browse-1.png` | Same as Route Browse | Same as Route Browse |
| `Route Details.png` | background, surface-elevated, success, heart, text-secondary | Card (elevated), Avatar, IconButton (heart) |
| `Route Details-1.png` | background, accent, star-filled, surface-elevated, accent-light | Card, Button (primary), IconButton (star), Badge (tag) |
| `Ascent.png` | background, surface-elevated, star-filled, accent, tag colors | Card, Button, Badge (tag), IconButton (star, camera) |
| `Gym Browse.png` | background, surface, accent-light, text-secondary | Card (pressable), Avatar |
| `Map Browse.png` | background, accent, text-primary | TextInput (search), IconButton |
| `Start Activity.png` | background, surface, border, accent | TextInput (dropdown), Button (primary) |
| `Leaderboard.png` | background, gold, silver, bronze, surface, text-primary | Card, Avatar, Badge (rank) |
| `Profile.png` | background, text-primary, text-secondary, accent, gold | Avatar (xl), Badge, Card |
