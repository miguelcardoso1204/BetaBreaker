# Route Card Component Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `RouteCard` component that displays a route's name, grade, status, color swatch, style tags, and sent indicator — used in the route list (FlatList) on the home tab.

**Architecture:** RouteCard composes existing UI primitives (`Card`, `Badge`) with new inline elements (color swatch, status dot, checkmark). It receives a `route` object, `userGradeSystem`, and `isSent` flag as props — no data fetching, no hooks, purely presentational. Grade display uses `canonicalToDisplay()` from `utils/grades.ts`.

**Tech Stack:** React Native, NativeWind v4, TypeScript, Jest + `@testing-library/react-native`

---

### Task 1: Write Failing Tests

**Files:**
- Create: `components/routes/__tests__/RouteCard.test.tsx`

**Step 1: Write the test file**

```typescript
/**
 * RouteCard Component Tests
 *
 * RouteCard is a presentational component that displays a single climbing
 * route in the route list. It shows the route's name, grade (converted to
 * the user's preferred system), status indicator, hold color swatch, style
 * tags, and a "sent" checkmark if the user has completed the route.
 *
 * Test strategy: We test behavior (what the user sees and interacts with),
 * not implementation. We use getByText, getByTestId, and queryByTestId to
 * verify content is rendered, and fireEvent.press to verify tap behavior.
 *
 * Mock strategy: We mock `canonicalToDisplay` so tests don't depend on
 * the grade table, and `expo-router` for navigation assertions.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock grade conversion — return a predictable string so tests don't
// depend on the actual grade table mapping.
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn(() => "V4"),
}));

// Mock lucide icons — Jest can't process the SVG transforms.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Check: (props: Record<string, unknown>) => <View testID="check-icon" {...props} />,
    ChevronRight: (props: Record<string, unknown>) => <View testID="chevron-icon" {...props} />,
  };
});

import { RouteCard } from "../RouteCard";
import type { RouteCardProps } from "../RouteCard";

const { canonicalToDisplay } = jest.requireMock<{
  canonicalToDisplay: jest.Mock;
}>("@/utils/grades");

// ── Fixtures ─────────────────────────────────────────────────────

const baseRoute: RouteCardProps["route"] = {
  id: "route-1",
  name: "Crimpy McSlab",
  canonical_grade: 12,
  status: "active",
  color: "#EF4444",
  style_tags: ["Crimps", "Slab"],
};

const defaultProps: RouteCardProps = {
  route: baseRoute,
  userGradeSystem: "v-scale",
  onPress: jest.fn(),
};

describe("RouteCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canonicalToDisplay.mockReturnValue("V4");
  });

  it("renders route name", () => {
    render(<RouteCard {...defaultProps} />);
    expect(screen.getByText("Crimpy McSlab")).toBeOnTheScreen();
  });

  it("renders grade using canonicalToDisplay", () => {
    // The component should call canonicalToDisplay with the route's
    // canonical grade and the user's preferred grade system.
    render(<RouteCard {...defaultProps} />);

    expect(canonicalToDisplay).toHaveBeenCalledWith(12, "v-scale");
    expect(screen.getByText("V4")).toBeOnTheScreen();
  });

  it("shows green status dot for active routes", () => {
    render(<RouteCard {...defaultProps} />);

    const dot = screen.getByTestId("status-dot");
    expect(dot).toBeOnTheScreen();
  });

  it("shows amber status dot for retiring_soon routes", () => {
    const route = { ...baseRoute, status: "retiring_soon" as const };
    render(<RouteCard {...defaultProps} route={route} />);

    const dot = screen.getByTestId("status-dot");
    expect(dot).toBeOnTheScreen();
  });

  it("shows gray status dot for archived routes", () => {
    const route = { ...baseRoute, status: "archived" as const };
    render(<RouteCard {...defaultProps} route={route} />);

    const dot = screen.getByTestId("status-dot");
    expect(dot).toBeOnTheScreen();
  });

  it("renders color swatch when route has a color", () => {
    render(<RouteCard {...defaultProps} />);

    const swatch = screen.getByTestId("color-swatch");
    expect(swatch).toBeOnTheScreen();
  });

  it("does not render color swatch when color is null", () => {
    const route = { ...baseRoute, color: null };
    render(<RouteCard {...defaultProps} route={route} />);

    expect(screen.queryByTestId("color-swatch")).toBeNull();
  });

  it("renders style tag chips", () => {
    render(<RouteCard {...defaultProps} />);

    expect(screen.getByText("Crimps")).toBeOnTheScreen();
    expect(screen.getByText("Slab")).toBeOnTheScreen();
  });

  it("handles empty style_tags array", () => {
    const route = { ...baseRoute, style_tags: [] };
    render(<RouteCard {...defaultProps} route={route} />);

    // Should render without crashing, just no tag chips
    expect(screen.getByText("Crimpy McSlab")).toBeOnTheScreen();
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    render(<RouteCard {...defaultProps} onPress={onPress} />);

    fireEvent.press(screen.getByTestId("route-card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows checkmark when isSent is true", () => {
    render(<RouteCard {...defaultProps} isSent />);

    expect(screen.getByTestId("sent-indicator")).toBeOnTheScreen();
  });

  it("does not show checkmark when isSent is false", () => {
    render(<RouteCard {...defaultProps} isSent={false} />);

    expect(screen.queryByTestId("sent-indicator")).toBeNull();
  });

  it("handles route with null name gracefully", () => {
    // Some routes might not have names — just an ID and grade.
    const route = { ...baseRoute, name: null };
    render(<RouteCard {...defaultProps} route={route} />);

    // Should still render the grade and not crash
    expect(screen.getByText("V4")).toBeOnTheScreen();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- components/routes/__tests__/RouteCard.test.tsx`
Expected: FAIL — `../RouteCard` module doesn't exist yet.

---

### Task 2: Implement RouteCard Component

**Files:**
- Create: `components/routes/RouteCard.tsx`
- Create: `components/routes/index.ts`

**Step 1: Create the RouteCard component**

```typescript
/**
 * RouteCard — Displays a single climbing route in a list.
 *
 * This is the primary card component for the route browse screen (home tab).
 * It shows all the key info a climber needs at a glance:
 *   - Route name and grade (converted to the user's preferred system)
 *   - Status dot (green = active, amber = retiring soon, gray = archived)
 *   - Color swatch (the hold color on the wall, helps identify the route)
 *   - Style tags (climbing style chips like "Crimps", "Slab", "Overhang")
 *   - Sent indicator (checkmark if the user has completed this route)
 *
 * This is a PRESENTATIONAL component — it receives all data as props and
 * renders it. No hooks, no data fetching, no side effects. The parent
 * screen is responsible for fetching routes and passing them in.
 *
 * The component composes existing UI primitives:
 *   - Card (from components/ui) for the pressable container
 *   - Badge (from components/ui) for style tag chips
 *   - canonicalToDisplay() for grade conversion
 */

import React from "react";
import { View, Text } from "react-native";
import { Check, ChevronRight } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { canonicalToDisplay } from "@/utils/grades";
import type { GradeSystem } from "@/lib/constants";
import type { RouteStatus } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────────────

/** The route data shape this card expects. Matches the columns from
 *  the routes table plus style tags resolved from the junction table. */
export interface RouteCardRoute {
  id: string;
  name: string | null;
  canonical_grade: number;
  status: RouteStatus;
  color: string | null;
  style_tags: string[];
}

export interface RouteCardProps {
  /** The route data to display. */
  route: RouteCardRoute;
  /** The user's preferred grade system (v-scale, font, yds). */
  userGradeSystem: GradeSystem;
  /** Callback when the card is tapped. Parent handles navigation. */
  onPress: () => void;
  /** Whether the current user has sent (completed) this route. */
  isSent?: boolean;
}

// ── Status dot color mapping ─────────────────────────────────────
// Maps each route lifecycle status to a NativeWind background color.
// Active routes are green (good to climb), retiring_soon is amber
// (climb it before it's gone!), archived is gray (no longer on wall).
const statusDotClass: Record<RouteStatus, string> = {
  active: "bg-success",
  retiring_soon: "bg-warning",
  archived: "bg-muted",
};

/**
 * RouteCard — a pressable card showing one route's key info.
 *
 * Usage:
 * ```tsx
 * <RouteCard
 *   route={route}
 *   userGradeSystem="v-scale"
 *   onPress={() => router.push(`/routes/${route.id}`)}
 *   isSent={sentRouteIds.has(route.id)}
 * />
 * ```
 */
export function RouteCard({
  route,
  userGradeSystem,
  onPress,
  isSent = false,
}: RouteCardProps) {
  // Convert the canonical integer grade to a human-readable string
  // in the user's preferred system (e.g., 12 → "V4" for v-scale).
  const gradeDisplay = canonicalToDisplay(route.canonical_grade, userGradeSystem);

  return (
    <Card onPress={onPress} testID="route-card" className="mb-3">
      <View className="flex-row items-center gap-3">
        {/* Color swatch — a small circle showing the route's hold color.
            This helps climbers identify routes on the wall by color.
            Only rendered when the route has a color assigned. */}
        {route.color && (
          <View
            testID="color-swatch"
            className="w-10 h-10 rounded-full"
            style={{ backgroundColor: route.color }}
          />
        )}

        {/* Main content — route name, grade, and status */}
        <View className="flex-1">
          {/* Top row: name + status dot */}
          <View className="flex-row items-center gap-2">
            {/* Status dot — small colored circle indicating route lifecycle */}
            <View
              testID="status-dot"
              className={`w-2 h-2 rounded-full ${statusDotClass[route.status]}`}
            />
            <Text className="text-white font-bold text-base" numberOfLines={1}>
              {route.name ?? "Unnamed Route"}
            </Text>
          </View>

          {/* Grade display */}
          <Text className="text-secondary text-sm mt-0.5">
            {gradeDisplay}
          </Text>

          {/* Style tags — rendered as small Badge chips */}
          {route.style_tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1 mt-1.5">
              {route.style_tags.map((tag) => (
                <Badge key={tag} label={tag} variant="tag" color="#4B5563" />
              ))}
            </View>
          )}
        </View>

        {/* Right side: sent indicator + chevron */}
        <View className="flex-row items-center gap-2">
          {isSent && (
            <View testID="sent-indicator">
              <Check size={18} className="text-success" />
            </View>
          )}
          <ChevronRight size={20} className="text-muted" />
        </View>
      </View>
    </Card>
  );
}
```

**Step 2: Create barrel export**

Create `components/routes/index.ts`:

```typescript
// Route domain components — UI for browsing and displaying climbing routes.
export { RouteCard } from "./RouteCard";
export type { RouteCardProps, RouteCardRoute } from "./RouteCard";
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- components/routes/__tests__/RouteCard.test.tsx`
Expected: ALL PASS (13 tests).

**Step 4: Run full test suite + type check**

Run: `npm test`
Expected: All 267+ tests pass.

Run: `npx tsc --noEmit`
Expected: No new errors.

---

### Task 3: Commit and Update Docs

**Step 1: Commit**

```bash
git add components/routes/RouteCard.tsx components/routes/index.ts components/routes/__tests__/RouteCard.test.tsx
git commit -m "feat: add RouteCard component with grade, status, tags, and sent indicator"
```

**Step 2: Update DevelopmentPlan.md**

Mark Step 4.4 complete:

```
> **Implementation notes (2026-02-06):**
> - Created `components/routes/RouteCard.tsx` — presentational card composing Card + Badge
> - Props: route (RouteCardRoute), userGradeSystem, onPress, isSent
> - Status dot: green (active), amber (retiring_soon), gray (archived)
> - Color swatch: inline backgroundColor from route.color
> - Style tags: Badge chips with "tag" variant
> - 13 component tests in `components/routes/__tests__/RouteCard.test.tsx`
> - Total unit tests: 267
```

**Step 3: Commit docs**

```bash
git add Documentation/DevelopmentPlan.md
git commit -m "docs: mark Step 4.4 complete with implementation notes"
```
