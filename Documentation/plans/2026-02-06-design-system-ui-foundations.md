# Step 3.4 — Design System & UI Foundations

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract a design system from the Figma mockups, populate the Tailwind config with real tokens, build base UI components with NativeWind, and remove legacy StyleSheet-based components.

**Architecture:** The mockups use a dark-first aesthetic: near-black backgrounds (#0A0A0F–#111118), purple accent (#7C3AED–#8B5CF6), white/gray text hierarchy, and rounded card surfaces (#1C1C28). We extract exact color, typography, spacing, and radius tokens into `tailwind.config.js`, document everything in `Documentation/DesignSystem.md` and `Documentation/Wireframes.md`, then build typed NativeWind components that replace the legacy `Themed.tsx`/`EditScreenInfo.tsx`/`StyledText.tsx` pattern. Tests use `@testing-library/react-native` for behavior (renders, accessibility roles, press handlers) — not NativeWind's `renderSimple` (which tests CSS compilation, not component logic).

**Tech Stack:** NativeWind v4 + Tailwind CSS 3.x, `@testing-library/react-native`, `lucide-react-native` (icons), `react-native-reanimated` (animation), Expo SDK 54.

---

## Design Token Extraction (from Mockups)

Before any code, here are the tokens extracted from analyzing all 13 mockup screenshots:

### Colors
| Token Name | Hex (Dark) | Usage |
|---|---|---|
| `background` | `#0A0A0F` | Screen backgrounds |
| `surface` | `#1C1C28` | Cards, input fields, list items |
| `surface-elevated` | `#252536` | Elevated cards (selected route), modals |
| `border` | `#2A2A3C` | Subtle borders on inputs, cards |
| `text-primary` | `#FFFFFF` | Headings, primary text |
| `text-secondary` | `#A0A0B8` | Subtitles, metadata, placeholders |
| `text-muted` | `#6B6B80` | Disabled text, hints |
| `accent` | `#7C3AED` | Primary buttons ("Sign in", "Sign up", "Add Ascent"), FAB |
| `accent-hover` | `#6D28D9` | Button pressed state |
| `accent-light` | `#8B5CF6` | Links ("Check out the new routes", "Style Analysis") |
| `accent-glow` | `rgba(124, 58, 237, 0.3)` | FAB glow, button shadow |
| `success` | `#22C55E` | "Send Status" checkmark, verified badges |
| `warning` | `#F59E0B` | "New!" badge on routes |
| `error` | `#EF4444` | Error states, destructive actions |
| `heart` | `#EF4444` | Filled heart icons (likes) |
| `heart-outline` | `#A0A0B8` | Unfilled heart icons |
| `gold` | `#FFD700` | 1st place highlight, leaderboard top row |
| `silver` | `#C0C0C0` | 2nd place |
| `bronze` | `#CD7F32` | 3rd place |
| `tag-power` | `#EF4444` | "Power" tag pill |
| `tag-finger` | `#F59E0B` | "Finger Strength" tag pill |
| `tag-footwork` | `#22C55E` | "Footwork" tag pill |
| `tag-dynamic` | `#3B82F6` | "Dynamic Movement" tag pill |
| `tag-core` | `#A855F7` | "Core Strength" tag pill |
| `tag-technique` | `#14B8A6` | "Technique" tag pill |

### Typography
| Token | Value | Usage |
|---|---|---|
| `font-sans` | System default (San Francisco / Roboto) | Body text |
| `font-mono` | `SpaceMono` | Grade numbers, stats |
| `text-xs` | 12px | Timestamps, metadata |
| `text-sm` | 14px | Secondary labels, tags |
| `text-base` | 16px | Body text, input text |
| `text-lg` | 18px | Card titles, section headings |
| `text-xl` | 20px | Screen subtitles |
| `text-2xl` | 24px | Screen titles ("Welcome Back!") |
| `text-3xl` | 30px | Large headings, route number (#01) |
| `text-4xl` | 36px | Hero text ("BB" logo area) |
| `font-normal` | 400 | Body |
| `font-medium` | 500 | Labels |
| `font-semibold` | 600 | Card titles, nav items |
| `font-bold` | 700 | Headings, emphasis |

### Spacing
Tailwind defaults (4px base): 0, 1 (4), 2 (8), 3 (12), 4 (16), 5 (20), 6 (24), 8 (32), 10 (40), 12 (48), 16 (64).

### Border Radius
| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | 4px | Tags, small pills |
| `rounded` | 8px | Inputs, small cards |
| `rounded-lg` | 12px | Cards, route cards |
| `rounded-xl` | 16px | Buttons, modals |
| `rounded-2xl` | 20px | Large cards, image containers |
| `rounded-full` | 9999px | Avatars, FAB, tag pills |

### Shadows
| Token | Usage |
|---|---|
| `shadow-card` | Card elevation: `0 2px 8px rgba(0,0,0,0.3)` |
| `shadow-button` | Button depth: `0 4px 12px rgba(124,58,237,0.4)` |
| `shadow-fab` | FAB glow: `0 4px 20px rgba(124,58,237,0.5)` |

---

## Task 1: Design System Documentation

**Files:**
- Create: `Documentation/DesignSystem.md`

### Step 1: Write the design system document

Write `Documentation/DesignSystem.md` containing all tokens from the extraction above, plus:

- **Color system**: Full palette table with hex values, CSS variable names, and usage notes. Dark mode is the primary theme. Light mode strategy: invert backgrounds to white/gray, keep accent purple, darken text.
- **Typography scale**: Font families, size scale, weight scale, line-height guidelines.
- **Spacing scale**: 4px-base grid, standard Tailwind values.
- **Border radius scale**: Table of radius tokens and when to use each.
- **Shadow/elevation**: Card shadow, button shadow, FAB glow definitions.
- **Motion strategy**: Page transitions use `react-native-reanimated` FadeIn/SlideInUp (300ms ease-out). List items use staggered reveals (50ms delay per item). Button press: scale to 0.97 over 100ms. Loading: pulse animation. No motion on accessibility `reduceMotion`.
- **Iconography**: `lucide-react-native` as primary icon set. Default size 24px, stroke width 2. Tab bar icons 28px.
- **Dark mode strategy**: Dark is default. Colors defined as Tailwind `dark:` variants. `useColorScheme()` from React Native drives the toggle.
- **Component inventory**: List of base components to build (Button, TextInput, Card, Badge, IconButton, Divider, Avatar) with brief usage descriptions.

```markdown
# Beta Breaker Design System

## Philosophy
Dark-first design reflecting indoor climbing gym environments...
[Full document with all sections above]
```

### Step 2: Commit

```bash
git add Documentation/DesignSystem.md
git commit -m "docs: add design system with tokens extracted from mockups"
```

---

## Task 2: Wireframes Documentation

**Files:**
- Create: `Documentation/Wireframes.md`

### Step 1: Write the wireframes document

Write `Documentation/Wireframes.md` with per-screen layout specs derived from the 13 mockup screenshots. For each screen:

- **Screen name** (matches file path in `app/`)
- **Layout**: Component hierarchy (what contains what)
- **Components used**: Which base UI components appear
- **Interactions**: What happens on tap/swipe
- **Navigation**: Where each action navigates to

Screens to document (from mockups):
1. **Login** (`app/(auth)/login.tsx`): BB logo → "Welcome Back!" heading → username input → password input → "Forgot Password?" link → "Sign in" button → "Or continue with" → social buttons (Google, Apple, Facebook)
2. **Sign Up** (`app/(auth)/register.tsx`): BB logo → "Sign up!" heading → email input → name input → password input (with strength indicator) → "Sign up" button → social buttons
3. **Home** (`app/(tabs)/index.tsx`): "Welcome Back [Name]!" heading → activity feed (timeline with date markers, each item: icon + text + link)
4. **Route Browse** (`app/(tabs)/routes.tsx`): Search bar → filter chips (New, Difficulty, Styles) → route card list (image + number + grade + "New!" badge + chevron)
5. **Route Details** (`app/route/[id].tsx`): Route image + number + metadata (rating, status, grade, date, style link) → "Add Ascent" button → Video Submissions list (avatar + name + hearts + count + chevron)
6. **Ascent Form** (`app/route/[id]/ascent.tsx`): Route header → star rating → "Add Beta Video" → comment textarea → tag pills (multi-select) → "Add Ascent" button
7. **Start Activity** (`app/(tabs)/activity.tsx`): Country/City/Gym dropdowns → "Start Activity" button
8. **Gym Browse** (`app/gym/[id].tsx`): Gym logo + name + star + address + hours + social → nav cards (Routes, Leaderboards, Style Analysis)
9. **Map Browse** (`app/(tabs)/map.tsx`): Search bar + star filter → full-screen map → bottom sheet "5 gyms"
10. **Leaderboard** (`app/leaderboard/[id].tsx`): Title → competition dropdown → prizes list → ranked user list (avatar + name + points, top 3 highlighted gold/silver/bronze)
11. **Profile** (`app/(tabs)/profile.tsx`): Avatar + name + age + favorite gym → achievements row (badge icons) → leaderboard enrollment list

Include navigation flow: Tab bar has 5 tabs: Home, Map, FAB (+), Routes/List, Profile.

### Step 2: Commit

```bash
git add Documentation/Wireframes.md
git commit -m "docs: add wireframe specs derived from mockup analysis"
```

---

## Task 3: Populate Tailwind Config with Design Tokens

**Files:**
- Modify: `tailwind.config.js`
- Modify: `constants/Colors.ts`

### Step 1: Write the failing type-check

Run `npx tsc --noEmit` to establish baseline. It should pass (modulo the known `ExternalLink.tsx` issue).

### Step 2: Update `tailwind.config.js` with real tokens

Replace the empty `theme.extend` with all extracted design tokens:

```javascript
/** @type {import('tailwindcss').Config} */

// tailwind.config.js — Tailwind CSS configuration for NativeWind v4.
// Populated with design tokens extracted from Figma mockups.
// These tokens define the visual language of Beta Breaker:
// colors, typography, spacing, border radii, and shadows.
// NativeWind converts these into React Native StyleSheet values at build time.
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // -- App backgrounds --
        background: "#0A0A0F",
        surface: "#1C1C28",
        "surface-elevated": "#252536",
        border: "#2A2A3C",

        // -- Text hierarchy --
        "text-primary": "#FFFFFF",
        "text-secondary": "#A0A0B8",
        "text-muted": "#6B6B80",

        // -- Brand accent (purple) --
        accent: {
          DEFAULT: "#7C3AED",
          hover: "#6D28D9",
          light: "#8B5CF6",
          glow: "rgba(124, 58, 237, 0.3)",
        },

        // -- Semantic colors --
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        heart: "#EF4444",
        "heart-outline": "#A0A0B8",

        // -- Podium colors (leaderboard) --
        gold: "#FFD700",
        silver: "#C0C0C0",
        bronze: "#CD7F32",

        // -- Climbing style tag colors --
        tag: {
          power: "#EF4444",
          finger: "#F59E0B",
          footwork: "#22C55E",
          dynamic: "#3B82F6",
          core: "#A855F7",
          technique: "#14B8A6",
        },
      },

      fontFamily: {
        // System sans-serif is the default on both iOS (SF Pro) and Android (Roboto).
        // SpaceMono is loaded via expo-font for monospace use (grades, stats).
        sans: ["System"],
        mono: ["SpaceMono"],
      },

      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },

      boxShadow: {
        card: "0 2px 8px rgba(0, 0, 0, 0.3)",
        button: "0 4px 12px rgba(124, 58, 237, 0.4)",
        fab: "0 4px 20px rgba(124, 58, 237, 0.5)",
      },
    },
  },
  plugins: [],
};
```

### Step 3: Update `constants/Colors.ts` to use the same tokens

Replace the old Colors constant with values that match the design system. This file is still used by React Navigation's `ThemeProvider` in `app/_layout.tsx`.

```typescript
// constants/Colors.ts — Centralized color tokens for non-NativeWind consumers.
// React Navigation's ThemeProvider and @expo/vector-icons use these.
// For NativeWind components, prefer Tailwind classes (e.g., `bg-accent`).
// These values mirror the design tokens in tailwind.config.js.

const Colors = {
  light: {
    text: "#1A1A2E",
    background: "#F5F5F7",
    tint: "#7C3AED",
    tabIconDefault: "#6B6B80",
    tabIconSelected: "#7C3AED",
    surface: "#FFFFFF",
    border: "#E5E5EA",
  },
  dark: {
    text: "#FFFFFF",
    background: "#0A0A0F",
    tint: "#8B5CF6",
    tabIconDefault: "#6B6B80",
    tabIconSelected: "#8B5CF6",
    surface: "#1C1C28",
    border: "#2A2A3C",
  },
} as const;

export default Colors;
```

### Step 4: Verify type-check passes

Run: `npx tsc --noEmit`
Expected: Same result as baseline (pass, or only the known `ExternalLink.tsx` error).

### Step 5: Verify existing tests pass

Run: `npm test`
Expected: All 155 unit tests pass.

### Step 6: Commit

```bash
git add tailwind.config.js constants/Colors.ts
git commit -m "feat: populate tailwind config with design tokens from mockups"
```

---

## Task 4: Button Component

**Files:**
- Create: `components/ui/Button.tsx`
- Create: `components/ui/__tests__/Button.test.tsx`

### Step 1: Write the failing tests

```typescript
// components/ui/__tests__/Button.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Button } from "../Button";

describe("Button", () => {
  // -- Rendering --

  it("renders with label text", () => {
    render(<Button label="Sign in" onPress={() => {}} />);
    expect(screen.getByText("Sign in")).toBeOnTheScreen();
  });

  it("has button accessibility role", () => {
    render(<Button label="Submit" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Submit" })).toBeOnTheScreen();
  });

  // -- Variants --

  it("renders primary variant by default", () => {
    render(<Button label="Primary" onPress={() => {}} />);
    // Primary variant should render without crashing
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  it("renders outline variant", () => {
    render(<Button label="Outline" variant="outline" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  it("renders ghost variant", () => {
    render(<Button label="Ghost" variant="ghost" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  // -- Sizes --

  it("renders small size", () => {
    render(<Button label="Small" size="sm" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  it("renders large size", () => {
    render(<Button label="Large" size="lg" onPress={() => {}} />);
    expect(screen.getByRole("button")).toBeOnTheScreen();
  });

  // -- Interaction --

  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    render(<Button label="Tap me" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const onPress = jest.fn();
    render(<Button label="Disabled" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("is marked as disabled for accessibility", () => {
    render(<Button label="Nope" onPress={() => {}} disabled />);
    expect(
      screen.getByRole("button", { name: "Nope", disabled: true })
    ).toBeOnTheScreen();
  });

  // -- Loading --

  it("shows loading indicator when loading", () => {
    render(<Button label="Save" onPress={() => {}} loading />);
    expect(screen.getByTestId("button-loading")).toBeOnTheScreen();
  });

  it("does not call onPress when loading", () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} loading />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm test -- components/ui/__tests__/Button.test.tsx`
Expected: FAIL — `Cannot find module '../Button'`

### Step 3: Write minimal implementation

```typescript
// components/ui/Button.tsx
//
// Primary action button for Beta Breaker.
// Built with NativeWind (Tailwind classes) for styling.
//
// Variants:
//   - "primary" (default): Solid purple background. Used for main CTAs
//     like "Sign in", "Add Ascent", "Start Activity".
//   - "outline": Transparent with purple border. Used for secondary actions.
//   - "ghost": No background or border. Used for tertiary/inline actions.
//
// Sizes: "sm" (compact), "md" (default), "lg" (full-width CTAs).
//
// The component uses Pressable (not TouchableOpacity) because Pressable
// gives us more control over pressed/disabled states via the `style`
// callback, and it's the recommended primitive in modern React Native.

import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/** Props for the Button component. */
export interface ButtonProps {
  /** Text displayed inside the button. */
  label: string;
  /** Called when the button is pressed. */
  onPress: () => void;
  /** Visual style variant. Defaults to "primary". */
  variant?: "primary" | "outline" | "ghost";
  /** Size preset. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  /** When true, the button is non-interactive and visually dimmed. */
  disabled?: boolean;
  /** When true, shows a spinner and prevents interaction. */
  loading?: boolean;
  /** Optional testID for testing. */
  testID?: string;
}

// Maps variant → NativeWind class string for the container.
// "primary" gets the solid accent background, "outline" gets a border,
// "ghost" gets nothing — just the text is styled.
const variantClasses = {
  primary: "bg-accent rounded-xl",
  outline: "border-2 border-accent rounded-xl",
  ghost: "",
} as const;

// Maps variant → text color class.
// Primary buttons have white text; outline/ghost use the accent color.
const variantTextClasses = {
  primary: "text-white",
  outline: "text-accent-light",
  ghost: "text-accent-light",
} as const;

// Maps size → padding/text-size classes.
const sizeClasses = {
  sm: "px-4 py-2",
  md: "px-6 py-3",
  lg: "px-8 py-4 w-full",
} as const;

const sizeTextClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
} as const;

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  testID,
}: ButtonProps) {
  // When disabled or loading, the button should not respond to presses.
  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !isInteractive }}
      testID={testID}
      className={`items-center justify-center ${variantClasses[variant]} ${sizeClasses[size]} ${
        !isInteractive ? "opacity-50" : ""
      }`}
    >
      {loading ? (
        <View testID="button-loading">
          <ActivityIndicator
            color={variant === "primary" ? "#FFFFFF" : "#7C3AED"}
            size="small"
          />
        </View>
      ) : (
        <Text
          className={`font-semibold ${variantTextClasses[variant]} ${sizeTextClasses[size]}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
```

### Step 4: Run tests to verify they pass

Run: `npm test -- components/ui/__tests__/Button.test.tsx`
Expected: 11 tests PASS

### Step 5: Commit

```bash
git add components/ui/Button.tsx components/ui/__tests__/Button.test.tsx
git commit -m "feat: add Button component with primary/outline/ghost variants"
```

---

## Task 5: TextInput Component

**Files:**
- Create: `components/ui/TextInput.tsx`
- Create: `components/ui/__tests__/TextInput.test.tsx`

### Step 1: Write the failing tests

```typescript
// components/ui/__tests__/TextInput.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { AppTextInput } from "../TextInput";

describe("AppTextInput", () => {
  it("renders with label", () => {
    render(<AppTextInput label="Email" onChangeText={() => {}} value="" />);
    expect(screen.getByText("Email")).toBeOnTheScreen();
  });

  it("renders the text input", () => {
    render(
      <AppTextInput
        label="Username"
        onChangeText={() => {}}
        value=""
        placeholder="Enter username"
      />
    );
    expect(screen.getByPlaceholderText("Enter username")).toBeOnTheScreen();
  });

  it("displays the current value", () => {
    render(
      <AppTextInput label="Name" onChangeText={() => {}} value="Alex" />
    );
    expect(screen.getByDisplayValue("Alex")).toBeOnTheScreen();
  });

  it("calls onChangeText when text changes", () => {
    const onChangeText = jest.fn();
    render(
      <AppTextInput
        label="Email"
        onChangeText={onChangeText}
        value=""
        placeholder="Email"
      />
    );
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
    expect(onChangeText).toHaveBeenCalledWith("test@example.com");
  });

  it("displays error message", () => {
    render(
      <AppTextInput
        label="Password"
        onChangeText={() => {}}
        value=""
        error="Password is required"
      />
    );
    expect(screen.getByText("Password is required")).toBeOnTheScreen();
  });

  it("hides error when not provided", () => {
    render(
      <AppTextInput label="Password" onChangeText={() => {}} value="" />
    );
    expect(screen.queryByText("Password is required")).not.toBeOnTheScreen();
  });

  it("supports secureTextEntry for passwords", () => {
    render(
      <AppTextInput
        label="Password"
        onChangeText={() => {}}
        value="secret"
        secureTextEntry
        placeholder="Password"
      />
    );
    // The input should exist and be renderable with secureTextEntry
    expect(screen.getByPlaceholderText("Password")).toBeOnTheScreen();
  });

  it("supports disabled state", () => {
    render(
      <AppTextInput
        label="Locked"
        onChangeText={() => {}}
        value="read only"
        editable={false}
        placeholder="Locked"
      />
    );
    expect(screen.getByPlaceholderText("Locked")).toBeOnTheScreen();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm test -- components/ui/__tests__/TextInput.test.tsx`
Expected: FAIL — `Cannot find module '../TextInput'`

### Step 3: Write minimal implementation

```typescript
// components/ui/TextInput.tsx
//
// Styled text input for Beta Breaker forms (login, register, search, etc.).
//
// Matches the mockup design: dark surface background (#1C1C28), subtle border,
// light placeholder text, white input text. Shows a red error message below
// the input when validation fails.
//
// Named "AppTextInput" to avoid collision with React Native's built-in
// TextInput export — this is a common pattern in RN projects.

import React from "react";
import { TextInput as RNTextInput, Text, View } from "react-native";

export interface AppTextInputProps {
  /** Label displayed above the input field. */
  label: string;
  /** Current text value (controlled component pattern). */
  value: string;
  /** Called when the user types. */
  onChangeText: (text: string) => void;
  /** Placeholder text shown when input is empty. */
  placeholder?: string;
  /** Hides the text for password fields. */
  secureTextEntry?: boolean;
  /** Validation error message. Shown in red below the input. */
  error?: string;
  /** Whether the input is interactive. */
  editable?: boolean;
  /** Keyboard type hint (e.g., "email-address", "numeric"). */
  keyboardType?: RNTextInput["props"]["keyboardType"];
  /** Auto-capitalize behavior. */
  autoCapitalize?: RNTextInput["props"]["autoCapitalize"];
  /** Optional testID for testing. */
  testID?: string;
}

export function AppTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  error,
  editable = true,
  keyboardType,
  autoCapitalize,
  testID,
}: AppTextInputProps) {
  return (
    <View className="mb-4" testID={testID}>
      {/* Label above the input — matches mockup's gray label text */}
      <Text className="text-text-secondary text-sm font-medium mb-1">
        {label}
      </Text>

      {/* The actual input field — dark surface bg, rounded corners, border */}
      <RNTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6B6B80"
        secureTextEntry={secureTextEntry}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        className={`bg-surface border ${
          error ? "border-error" : "border-border"
        } rounded-lg px-4 py-3 text-text-primary text-base ${
          !editable ? "opacity-50" : ""
        }`}
      />

      {/* Error message — only rendered when there's a validation error */}
      {error ? (
        <Text className="text-error text-xs mt-1">{error}</Text>
      ) : null}
    </View>
  );
}
```

### Step 4: Run tests to verify they pass

Run: `npm test -- components/ui/__tests__/TextInput.test.tsx`
Expected: 8 tests PASS

### Step 5: Commit

```bash
git add components/ui/TextInput.tsx components/ui/__tests__/TextInput.test.tsx
git commit -m "feat: add AppTextInput component with label, error, and secureTextEntry"
```

---

## Task 6: Card Component

**Files:**
- Create: `components/ui/Card.tsx`
- Create: `components/ui/__tests__/Card.test.tsx`

### Step 1: Write the failing tests

```typescript
// components/ui/__tests__/Card.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { Card } from "../Card";

describe("Card", () => {
  it("renders children", () => {
    render(
      <Card>
        <Text>Card content</Text>
      </Card>
    );
    expect(screen.getByText("Card content")).toBeOnTheScreen();
  });

  it("is pressable when onPress is provided", () => {
    const onPress = jest.fn();
    render(
      <Card onPress={onPress} testID="card">
        <Text>Pressable card</Text>
      </Card>
    );
    fireEvent.press(screen.getByTestId("card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is not pressable when onPress is not provided", () => {
    render(
      <Card testID="card">
        <Text>Static card</Text>
      </Card>
    );
    // Card should still render, just not be pressable
    expect(screen.getByText("Static card")).toBeOnTheScreen();
  });

  it("renders elevated variant", () => {
    render(
      <Card variant="elevated" testID="card">
        <Text>Elevated</Text>
      </Card>
    );
    expect(screen.getByText("Elevated")).toBeOnTheScreen();
  });

  it("renders outlined variant", () => {
    render(
      <Card variant="outlined" testID="card">
        <Text>Outlined</Text>
      </Card>
    );
    expect(screen.getByText("Outlined")).toBeOnTheScreen();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm test -- components/ui/__tests__/Card.test.tsx`
Expected: FAIL — `Cannot find module '../Card'`

### Step 3: Write minimal implementation

```typescript
// components/ui/Card.tsx
//
// Container component for grouping related content.
// Matches the mockup's card design: dark surface background (#1C1C28),
// rounded corners (12px), subtle padding.
//
// Variants:
//   - "default": Surface background, no border (route cards, gym nav cards).
//   - "elevated": Lighter surface (#252536) for emphasis (selected items).
//   - "outlined": Transparent with border (leaderboard entries, list items).
//
// Optionally pressable: when `onPress` is provided, the card wraps in
// a Pressable for tap handling (e.g., route cards that navigate to details).

import React from "react";
import { Pressable, View } from "react-native";

export interface CardProps {
  /** Card contents. */
  children: React.ReactNode;
  /** Visual variant. */
  variant?: "default" | "elevated" | "outlined";
  /** When provided, the card becomes pressable. */
  onPress?: () => void;
  /** Optional testID for testing. */
  testID?: string;
  /** Additional NativeWind classes. */
  className?: string;
}

const variantClasses = {
  default: "bg-surface rounded-lg",
  elevated: "bg-surface-elevated rounded-lg",
  outlined: "border border-border rounded-lg",
} as const;

export function Card({
  children,
  variant = "default",
  onPress,
  testID,
  className = "",
}: CardProps) {
  const baseClasses = `p-4 ${variantClasses[variant]} ${className}`;

  // If onPress is provided, wrap in Pressable for tap handling.
  // Otherwise, use a plain View (no unnecessary touch responders).
  if (onPress) {
    return (
      <Pressable onPress={onPress} testID={testID} className={baseClasses}>
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} className={baseClasses}>
      {children}
    </View>
  );
}
```

### Step 4: Run tests to verify they pass

Run: `npm test -- components/ui/__tests__/Card.test.tsx`
Expected: 5 tests PASS

### Step 5: Commit

```bash
git add components/ui/Card.tsx components/ui/__tests__/Card.test.tsx
git commit -m "feat: add Card component with default/elevated/outlined variants"
```

---

## Task 7: Badge Component

**Files:**
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/__tests__/Badge.test.tsx`

### Step 1: Write the failing tests

```typescript
// components/ui/__tests__/Badge.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders label text", () => {
    render(<Badge label="New!" />);
    expect(screen.getByText("New!")).toBeOnTheScreen();
  });

  it("renders default variant", () => {
    render(<Badge label="Default" />);
    expect(screen.getByText("Default")).toBeOnTheScreen();
  });

  it("renders success variant", () => {
    render(<Badge label="Verified" variant="success" />);
    expect(screen.getByText("Verified")).toBeOnTheScreen();
  });

  it("renders warning variant", () => {
    render(<Badge label="New!" variant="warning" />);
    expect(screen.getByText("New!")).toBeOnTheScreen();
  });

  it("renders error variant", () => {
    render(<Badge label="Failed" variant="error" />);
    expect(screen.getByText("Failed")).toBeOnTheScreen();
  });

  it("renders tag variant with custom color", () => {
    render(<Badge label="Power" variant="tag" color="#EF4444" />);
    expect(screen.getByText("Power")).toBeOnTheScreen();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm test -- components/ui/__tests__/Badge.test.tsx`
Expected: FAIL

### Step 3: Write minimal implementation

```typescript
// components/ui/Badge.tsx
//
// Small status/label pill used throughout the app:
//   - "New!" warning badge on recently set routes (Route Browse mockup)
//   - "Verified" success badge on send status
//   - Climbing style tags on the Ascent form ("Power", "Footwork", etc.)
//
// The "tag" variant accepts a custom `color` prop so each climbing style
// can have its own color from the tag palette in the design system.

import React from "react";
import { Text, View } from "react-native";

export interface BadgeProps {
  /** Text displayed inside the badge. */
  label: string;
  /** Visual variant. Defaults to "default" (accent purple). */
  variant?: "default" | "success" | "warning" | "error" | "tag";
  /** Custom background color for the "tag" variant. */
  color?: string;
  /** Optional testID. */
  testID?: string;
}

// Maps variant → background + text color classes.
const variantClasses = {
  default: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  tag: "", // Uses inline style for custom color
} as const;

export function Badge({
  label,
  variant = "default",
  color,
  testID,
}: BadgeProps) {
  // For the "tag" variant, we apply the custom color as an inline style
  // because the color comes from data (each climbing style has a unique color),
  // not from a fixed set of Tailwind classes.
  const useInlineColor = variant === "tag" && color;

  return (
    <View
      testID={testID}
      className={`px-2 py-1 rounded-full ${variantClasses[variant]}`}
      style={useInlineColor ? { backgroundColor: color } : undefined}
    >
      <Text className="text-white text-xs font-semibold">{label}</Text>
    </View>
  );
}
```

### Step 4: Run tests to verify they pass

Run: `npm test -- components/ui/__tests__/Badge.test.tsx`
Expected: 6 tests PASS

### Step 5: Commit

```bash
git add components/ui/Badge.tsx components/ui/__tests__/Badge.test.tsx
git commit -m "feat: add Badge component with semantic and tag variants"
```

---

## Task 8: IconButton Component

**Files:**
- Create: `components/ui/IconButton.tsx`
- Create: `components/ui/__tests__/IconButton.test.tsx`

### Step 1: Write the failing tests

```typescript
// components/ui/__tests__/IconButton.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { IconButton } from "../IconButton";

// Mock lucide-react-native — Jest can't process SVG transforms.
// We replace the icon with a simple Text element for testing.
jest.mock("lucide-react-native", () => ({
  Heart: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>HeartIcon</Text>;
  },
  Star: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>StarIcon</Text>;
  },
}));

describe("IconButton", () => {
  it("renders with an icon", () => {
    const { Heart } = require("lucide-react-native");
    render(<IconButton icon={Heart} label="Like" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Like" })).toBeOnTheScreen();
  });

  it("calls onPress when pressed", () => {
    const { Heart } = require("lucide-react-native");
    const onPress = jest.fn();
    render(<IconButton icon={Heart} label="Like" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const { Heart } = require("lucide-react-native");
    const onPress = jest.fn();
    render(
      <IconButton icon={Heart} label="Like" onPress={onPress} disabled />
    );
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("accepts different icons", () => {
    const { Star } = require("lucide-react-native");
    render(<IconButton icon={Star} label="Favorite" onPress={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Favorite" })
    ).toBeOnTheScreen();
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npm test -- components/ui/__tests__/IconButton.test.tsx`
Expected: FAIL

### Step 3: Write minimal implementation

```typescript
// components/ui/IconButton.tsx
//
// A button that displays only an icon (no text label).
// Used for: favorite/star toggles, share buttons, close buttons, etc.
//
// The `icon` prop accepts any Lucide icon component. Lucide icons are
// tree-shakeable SVGs — only the icons you import are bundled.
//
// `label` is required for accessibility (screen readers announce it)
// but is not visually displayed.

import React from "react";
import { Pressable } from "react-native";
import type { LucideIcon } from "lucide-react-native";

export interface IconButtonProps {
  /** Lucide icon component to render. */
  icon: LucideIcon;
  /** Accessibility label (required, but not visually shown). */
  label: string;
  /** Called when the button is pressed. */
  onPress: () => void;
  /** Icon size in pixels. Defaults to 24. */
  size?: number;
  /** Icon color. Defaults to white. */
  color?: string;
  /** Disables interaction. */
  disabled?: boolean;
  /** Optional testID. */
  testID?: string;
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = 24,
  color = "#FFFFFF",
  disabled = false,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      className={`p-2 rounded-full ${disabled ? "opacity-50" : ""}`}
    >
      <Icon size={size} color={color} strokeWidth={2} />
    </Pressable>
  );
}
```

### Step 4: Run tests to verify they pass

Run: `npm test -- components/ui/__tests__/IconButton.test.tsx`
Expected: 4 tests PASS

### Step 5: Commit

```bash
git add components/ui/IconButton.tsx components/ui/__tests__/IconButton.test.tsx
git commit -m "feat: add IconButton component for icon-only actions"
```

---

## Task 9: Divider and Avatar Components

**Files:**
- Create: `components/ui/Divider.tsx`
- Create: `components/ui/Avatar.tsx`
- Create: `components/ui/__tests__/Divider.test.tsx`
- Create: `components/ui/__tests__/Avatar.test.tsx`

### Step 1: Write the failing tests for Divider

```typescript
// components/ui/__tests__/Divider.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Divider } from "../Divider";

describe("Divider", () => {
  it("renders without crashing", () => {
    render(<Divider testID="divider" />);
    expect(screen.getByTestId("divider")).toBeOnTheScreen();
  });

  it("renders with custom className", () => {
    render(<Divider testID="divider" className="my-8" />);
    expect(screen.getByTestId("divider")).toBeOnTheScreen();
  });
});
```

### Step 2: Write the failing tests for Avatar

```typescript
// components/ui/__tests__/Avatar.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Avatar } from "../Avatar";

describe("Avatar", () => {
  it("renders with image URI", () => {
    render(
      <Avatar uri="https://example.com/photo.jpg" name="Alex" testID="avatar" />
    );
    expect(screen.getByTestId("avatar")).toBeOnTheScreen();
  });

  it("shows initials fallback when no URI", () => {
    render(<Avatar name="Alex Honnold" testID="avatar" />);
    // Should show "AH" (first letter of each word)
    expect(screen.getByText("AH")).toBeOnTheScreen();
  });

  it("shows single initial for single name", () => {
    render(<Avatar name="Alex" testID="avatar" />);
    expect(screen.getByText("A")).toBeOnTheScreen();
  });

  it("renders small size", () => {
    render(<Avatar name="Alex" size="sm" testID="avatar" />);
    expect(screen.getByTestId("avatar")).toBeOnTheScreen();
  });

  it("renders large size", () => {
    render(<Avatar name="Alex" size="lg" testID="avatar" />);
    expect(screen.getByTestId("avatar")).toBeOnTheScreen();
  });
});
```

### Step 3: Run tests to verify they fail

Run: `npm test -- components/ui/__tests__/Divider.test.tsx components/ui/__tests__/Avatar.test.tsx`
Expected: FAIL

### Step 4: Write Divider implementation

```typescript
// components/ui/Divider.tsx
//
// Horizontal line separator used between sections.
// Matches the mockup's subtle dark dividers between list items
// (activity feed entries, video submission rows, etc.).

import React from "react";
import { View } from "react-native";

export interface DividerProps {
  /** Additional NativeWind classes (e.g., margins). */
  className?: string;
  /** Optional testID. */
  testID?: string;
}

export function Divider({ className = "", testID }: DividerProps) {
  return (
    <View
      testID={testID}
      className={`h-px bg-border ${className}`}
      accessibilityRole="none"
    />
  );
}
```

### Step 5: Write Avatar implementation

```typescript
// components/ui/Avatar.tsx
//
// Circular user avatar with image or initials fallback.
// Used in: leaderboard rows, video submission lists, profile screen.
//
// When a `uri` is provided, displays the user's photo.
// When no image is available, shows the user's initials on a
// purple accent background — this avoids broken image placeholders.
//
// Uses expo-image (Image component) for optimized image loading
// with caching and progressive rendering.

import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";

export interface AvatarProps {
  /** Image URL for the user's photo. */
  uri?: string;
  /** User's display name (used to generate initials fallback). */
  name: string;
  /** Size preset. */
  size?: "sm" | "md" | "lg";
  /** Optional testID. */
  testID?: string;
}

// Maps size → dimensions (width/height) and text size for initials.
const sizeConfig = {
  sm: { dimension: 32, textClass: "text-xs" },
  md: { dimension: 40, textClass: "text-sm" },
  lg: { dimension: 64, textClass: "text-xl" },
} as const;

/**
 * Extracts initials from a name string.
 * "Alex Honnold" → "AH", "Alex" → "A", "" → "?"
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  uri,
  name,
  size = "md",
  testID,
}: AvatarProps) {
  const { dimension, textClass } = sizeConfig[size];

  return (
    <View
      testID={testID}
      className="rounded-full overflow-hidden items-center justify-center bg-accent"
      style={{ width: dimension, height: dimension }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: dimension, height: dimension }}
          contentFit="cover"
          accessibilityLabel={`${name}'s avatar`}
        />
      ) : (
        <Text className={`text-white font-bold ${textClass}`}>
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}
```

### Step 6: Run tests to verify they pass

Run: `npm test -- components/ui/__tests__/Divider.test.tsx components/ui/__tests__/Avatar.test.tsx`
Expected: 7 tests PASS

### Step 7: Commit

```bash
git add components/ui/Divider.tsx components/ui/Avatar.tsx components/ui/__tests__/Divider.test.tsx components/ui/__tests__/Avatar.test.tsx
git commit -m "feat: add Divider and Avatar components"
```

---

## Task 10: Component Index Barrel Export

**Files:**
- Create: `components/ui/index.ts`

### Step 1: Create the barrel export

```typescript
// components/ui/index.ts
//
// Barrel export for all base UI components.
// Allows importing multiple components from a single path:
//   import { Button, Card, Badge } from "@/components/ui";
//
// This keeps import statements clean and provides a single place
// to see what primitives are available in the design system.

export { Button } from "./Button";
export type { ButtonProps } from "./Button";

export { AppTextInput } from "./TextInput";
export type { AppTextInputProps } from "./TextInput";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { Badge } from "./Badge";
export type { BadgeProps } from "./Badge";

export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";

export { Divider } from "./Divider";
export type { DividerProps } from "./Divider";

export { Avatar } from "./Avatar";
export type { AvatarProps } from "./Avatar";

// Legacy component kept for compatibility (used by expo-router links).
// Will be removed once all screens are rebuilt with NativeWind components.
export { ExternalLink } from "./ExternalLink";
```

### Step 2: Verify type-check

Run: `npx tsc --noEmit`
Expected: Pass (or only the known `ExternalLink.tsx` error).

### Step 3: Commit

```bash
git add components/ui/index.ts
git commit -m "feat: add barrel export for UI component library"
```

---

## Task 11: Remove Legacy Components & Update Consumers

**Files:**
- Delete: `components/ui/Themed.tsx`
- Delete: `components/ui/StyledText.tsx`
- Delete: `components/ui/EditScreenInfo.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/two.tsx`
- Modify: `app/modal.tsx`
- Modify: `app/+not-found.tsx`

### Step 1: Rewrite the screen files to use NativeWind + plain RN

These are placeholder screens from the Expo template. They'll be fully replaced in later phases, but we need them to compile. Replace them with minimal NativeWind-based placeholders.

**`app/(tabs)/index.tsx`:**
```typescript
// app/(tabs)/index.tsx
//
// Home tab placeholder. Will be replaced with the activity feed
// in Phase 4+. For now, shows a centered title to verify the
// NativeWind design system is working.

import { Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-text-primary text-2xl font-bold">
        Beta Breaker
      </Text>
      <Text className="text-text-secondary text-base mt-2">
        Home screen coming soon
      </Text>
    </View>
  );
}
```

**`app/(tabs)/two.tsx`:**
```typescript
// app/(tabs)/two.tsx
//
// Second tab placeholder. Will be replaced with the route browse
// screen in Phase 4.

import { Text, View } from "react-native";

export default function ExploreScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-text-primary text-2xl font-bold">Explore</Text>
      <Text className="text-text-secondary text-base mt-2">
        Route browsing coming soon
      </Text>
    </View>
  );
}
```

**`app/modal.tsx`:**
```typescript
// app/modal.tsx
//
// Modal screen placeholder. Will be used for quick-log or
// confirmation dialogs in later phases.

import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { Text, View } from "react-native";

export default function ModalScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-text-primary text-xl font-bold">Modal</Text>
      <StatusBar style={Platform.OS === "ios" ? "light" : "auto"} />
    </View>
  );
}
```

**`app/+not-found.tsx`:**
```typescript
// app/+not-found.tsx
//
// 404 screen shown when a route doesn't match.
// Uses NativeWind classes and expo-router's Link for navigation.

import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View className="flex-1 items-center justify-center p-5 bg-background">
        <Text className="text-text-primary text-xl font-bold">
          This screen doesn&apos;t exist.
        </Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-accent-light text-sm">
            Go to home screen!
          </Text>
        </Link>
      </View>
    </>
  );
}
```

### Step 2: Delete legacy files

```bash
rm components/ui/Themed.tsx components/ui/StyledText.tsx components/ui/EditScreenInfo.tsx
```

### Step 3: Verify no remaining imports of deleted files

Run: `grep -r "Themed\|StyledText\|EditScreenInfo" app/ components/ --include="*.ts" --include="*.tsx"`
Expected: No output (all references removed).

### Step 4: Verify type-check

Run: `npx tsc --noEmit`
Expected: Pass (or only the known `ExternalLink.tsx` error).

### Step 5: Verify all tests pass

Run: `npm test`
Expected: All tests pass (unit count should be 155 + new component tests = ~191).

### Step 6: Commit

```bash
git add -A app/(tabs)/index.tsx app/(tabs)/two.tsx app/modal.tsx app/+not-found.tsx
git rm components/ui/Themed.tsx components/ui/StyledText.tsx components/ui/EditScreenInfo.tsx
git commit -m "refactor: replace legacy Themed/EditScreenInfo with NativeWind placeholders"
```

---

## Task 12: Final Verification & Dev Plan Update

**Files:**
- Modify: `Documentation/DevelopmentPlan.md`

### Step 1: Run full test suite

Run: `npm test`
Expected: All unit tests pass.

### Step 2: Run type-check

Run: `npx tsc --noEmit`
Expected: Pass (or only the known `ExternalLink.tsx` error).

### Step 3: Run linter

Run: `npm run lint`
Expected: No new errors.

### Step 4: Mark Step 3.4 as complete in DevelopmentPlan.md

Add `✅` and implementation notes (files created, test count, key decisions) to Step 3.4 in the development plan.

### Step 5: Commit

```bash
git add Documentation/DevelopmentPlan.md
git commit -m "docs: mark Step 3.4 complete with implementation notes"
```

---

## Summary

| Task | Component | Tests |
|---|---|---|
| 1 | `Documentation/DesignSystem.md` | — |
| 2 | `Documentation/Wireframes.md` | — |
| 3 | `tailwind.config.js` + `constants/Colors.ts` | type-check |
| 4 | `components/ui/Button.tsx` | 11 |
| 5 | `components/ui/TextInput.tsx` | 8 |
| 6 | `components/ui/Card.tsx` | 5 |
| 7 | `components/ui/Badge.tsx` | 6 |
| 8 | `components/ui/IconButton.tsx` | 4 |
| 9 | `components/ui/Divider.tsx` + `Avatar.tsx` | 7 |
| 10 | `components/ui/index.ts` barrel export | type-check |
| 11 | Remove legacy + update consumers | type-check + full suite |
| 12 | Final verification + docs | full suite + lint |

**Total new component tests: 41**
**Total unit tests after step: ~196** (155 existing + 41 new)
**Commits: 12**
