# Routes Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a service layer for fetching climbing routes with filtering, sorting, and detail views.

**Architecture:** Thin wrapper around Supabase PostgREST queries following the existing `profileService` pattern. The service builds chainable queries with `.eq()`, `.gte()`, `.order()`, etc. and returns raw `{ data, error }`. No business logic — just query building. A `RouteFilters` type defines the filter contract. The hook layer (Step 4.2) will wrap this in TanStack Query.

**Tech Stack:** Supabase PostgREST query builder, TypeScript, Jest (unit tests with mocked supabase client)

---

### Task 1: Write Failing Tests — getRoutes (basic + gym filter)

**Files:**
- Create: `services/__tests__/routes.service.test.ts`

**Step 1: Write the test file with mock setup and first tests**

```typescript
/**
 * Routes Service Tests
 *
 * These tests verify that routeService methods correctly build Supabase
 * PostgREST query chains. We mock `@/lib/supabase` so tests run without
 * a real database — same pattern as profile.service.test.ts.
 *
 * Mock strategy: Supabase queries are method chains like
 *   supabase.from('routes').select('*').eq('gym_id', gymId).order(...)
 * We mock `from()` to return an object whose methods return `this`
 * (for chaining), with the terminal method resolving to mock data.
 *
 * Test categories:
 *   1. getRoutes — fetching route lists with various filters
 *   2. getRouteById — fetching a single route with related data
 */

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { routeService } from "../routes.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("routeService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getRoutes ──────────────────────────────────────────────────

  describe("getRoutes", () => {
    it("fetches routes for a gym with default filters", async () => {
      // Default behavior: fetch active routes for a gym, newest first.
      // Chain: from('routes').select('*').eq('gym_id', id)
      //        .in('status', ['active','retiring_soon']).order('created_at', desc)
      const mockRoutes = [
        { id: "route-1", gym_id: "gym-1", name: "Baby Steps", canonical_grade: 0, status: "active" },
        { id: "route-2", gym_id: "gym-1", name: "The Crimp", canonical_grade: 10, status: "active" },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockRoutes,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await routeService.getRoutes({ gymId: "gym-1" });

      expect(supabase.from).toHaveBeenCalledWith("routes");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenCalledWith("gym_id", "gym-1");
      // Default status filter: active + retiring_soon (not archived)
      expect(chainMock.in).toHaveBeenCalledWith("status", ["active", "retiring_soon"]);
      // Default sort: newest first
      expect(chainMock.order).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(result.data).toEqual(mockRoutes);
      expect(result.error).toBeNull();
    });

    it("filters by grade range when gradeMin and gradeMax provided", async () => {
      // When the user sets a grade filter (e.g., V3–V6), the service
      // adds .gte() and .lte() to the query chain.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({ data: [], error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getRoutes({ gymId: "gym-1", gradeMin: 8, gradeMax: 16 });

      expect(chainMock.gte).toHaveBeenCalledWith("canonical_grade", 8);
      expect(chainMock.lte).toHaveBeenCalledWith("canonical_grade", 16);
    });

    it("filters by specific status when provided", async () => {
      // Override the default status filter to show only a specific status.
      // Useful for setters who want to see archived routes.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({ data: [], error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getRoutes({ gymId: "gym-1", status: ["archived"] });

      // Should use the provided status array instead of the default
      expect(chainMock.in).toHaveBeenCalledWith("status", ["archived"]);
    });

    it("sorts by canonical_grade when sortBy is 'grade'", async () => {
      // The UI has sort options: "newest", "grade". When "grade" is
      // selected, routes are ordered by difficulty (ascending).
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({ data: [], error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getRoutes({ gymId: "gym-1", sortBy: "grade" });

      expect(chainMock.order).toHaveBeenCalledWith("canonical_grade", { ascending: true });
    });

    it("searches by name when search is provided", async () => {
      // Text search on route name — uses Postgres ilike for
      // case-insensitive partial matching.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({ data: [], error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getRoutes({ gymId: "gym-1", search: "crimp" });

      expect(chainMock.ilike).toHaveBeenCalledWith("name", "%crimp%");
    });
  });

  // ── getRouteById ────────────────────────────────────────────────

  describe("getRouteById", () => {
    it("fetches a single route with setter profile", async () => {
      // Single route detail view — fetch the route and join the setter's
      // profile (display_name, avatar_url) for display in the UI.
      // Uses Supabase's embedded select syntax for foreign key joins.
      const mockRoute = {
        id: "route-1",
        name: "Baby Steps",
        canonical_grade: 0,
        status: "active",
        setter: { display_name: "Sam Setter", avatar_url: null },
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: mockRoute,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await routeService.getRouteById("route-1");

      expect(supabase.from).toHaveBeenCalledWith("routes");
      // Select includes a joined sub-query for the setter's profile
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, setter:profiles!setter_id(display_name, avatar_url)"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("id", "route-1");
      expect(chainMock.single).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(mockRoute);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- services/__tests__/routes.service.test.ts`
Expected: FAIL — `../routes.service` module doesn't exist yet.

---

### Task 2: Implement routeService

**Files:**
- Create: `services/routes.service.ts`
- Modify: `services/index.ts`

**Step 1: Create the routes service**

```typescript
/**
 * Routes Service — Thin Wrapper Around Supabase Route Queries
 *
 * This service builds PostgREST queries for climbing routes. Each method
 * constructs a query chain with Supabase's fluent API and returns the raw
 * `{ data, error }` response. No business logic here — just query building.
 *
 * WHY CHAINABLE FILTERS?
 * Supabase's query builder works like SQL: each method adds a clause.
 *   supabase.from('routes').select('*').eq('gym_id', id).gte('canonical_grade', 8)
 * translates to:
 *   SELECT * FROM routes WHERE gym_id = $1 AND canonical_grade >= $2
 *
 * The filters are optional — if gradeMin isn't provided, the .gte() call
 * is skipped entirely, not added with a null value. This keeps the SQL clean.
 *
 * SORT OPTIONS:
 * - "newest" (default): ORDER BY created_at DESC — most recently set routes first
 * - "grade": ORDER BY canonical_grade ASC — easiest to hardest
 */

import { supabase } from "@/lib/supabase";
import type { RouteStatus } from "@/lib/constants";

/**
 * RouteFilters — the shape of filter options accepted by getRoutes().
 *
 * Only `gymId` is required — everything else is optional and applies
 * additional WHERE clauses to the query. This matches the UI's filter
 * panel where users can optionally narrow by grade, status, or search.
 */
export interface RouteFilters {
  /** Required — which gym's routes to fetch. */
  gymId: string;
  /** Minimum canonical grade (inclusive). Maps to .gte(). */
  gradeMin?: number;
  /** Maximum canonical grade (inclusive). Maps to .lte(). */
  gradeMax?: number;
  /** Route statuses to include. Defaults to ['active', 'retiring_soon']. */
  status?: RouteStatus[];
  /** Sort order. "newest" = created_at DESC, "grade" = canonical_grade ASC. */
  sortBy?: "newest" | "grade";
  /** Text search on route name (case-insensitive partial match). */
  search?: string;
}

export const routeService = {
  /**
   * Fetch routes for a gym with optional filters.
   *
   * Builds a query chain conditionally — each filter only adds a clause
   * when the filter value is provided. This avoids unnecessary WHERE
   * conditions and keeps the generated SQL minimal.
   *
   * Default behavior (no filters except gymId):
   * - Shows active + retiring_soon routes (not archived)
   * - Sorted by newest first (created_at DESC)
   */
  getRoutes(filters: RouteFilters) {
    // Start the query chain. Each subsequent call adds a clause.
    let query = supabase
      .from("routes")
      .select("*")
      .eq("gym_id", filters.gymId);

    // Status filter — defaults to active + retiring_soon so regular
    // climbers don't see archived routes cluttering the list.
    const statuses = filters.status ?? ["active", "retiring_soon"];
    query = query.in("status", statuses);

    // Grade range — only applied when the user has set a grade filter.
    // Uses >= and <= for inclusive range (e.g., V3 to V6 includes both).
    if (filters.gradeMin !== undefined) {
      query = query.gte("canonical_grade", filters.gradeMin);
    }
    if (filters.gradeMax !== undefined) {
      query = query.lte("canonical_grade", filters.gradeMax);
    }

    // Text search — uses PostgreSQL's ILIKE for case-insensitive
    // partial matching. The % wildcards match any characters before/after.
    if (filters.search) {
      query = query.ilike("name", `%${filters.search}%`);
    }

    // Sort — "grade" sorts easiest-to-hardest (ascending), everything
    // else defaults to newest-first (descending by created_at).
    if (filters.sortBy === "grade") {
      query = query.order("canonical_grade", { ascending: true });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    return query;
  },

  /**
   * Fetch a single route by ID with the setter's profile info.
   *
   * Uses Supabase's embedded select syntax to join the setter's profile:
   *   setter:profiles!setter_id(display_name, avatar_url)
   *
   * This translates to a LEFT JOIN on profiles via the setter_id foreign key.
   * The `!setter_id` hint tells PostgREST which FK to use (routes has two
   * FKs to different tables, and PostgREST needs the hint to pick the right one).
   *
   * The result shape is:
   *   { id, name, ..., setter: { display_name, avatar_url } | null }
   *
   * `setter` is null when the setter's profile has been deleted (ON DELETE SET NULL).
   */
  getRouteById(routeId: string) {
    return supabase
      .from("routes")
      .select("*, setter:profiles!setter_id(display_name, avatar_url)")
      .eq("id", routeId)
      .single();
  },
};
```

**Step 2: Add to barrel export**

Add to `services/index.ts`:

```typescript
// Routes service — fetches climbing routes with filtering, sorting, and detail views.
// Used by useRoutes hook (Step 4.2) to populate route list and detail screens.
export { routeService } from "./routes.service";
export type { RouteFilters } from "./routes.service";
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- services/__tests__/routes.service.test.ts`
Expected: ALL PASS (6 tests).

**Step 4: Run full test suite**

Run: `npm test`
Expected: All 235+ tests pass (no regressions).

**Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No new errors.

---

### Task 3: Commit

**Step 1: Stage and commit**

```bash
git add services/routes.service.ts services/__tests__/routes.service.test.ts services/index.ts
git commit -m "feat: add routes service with filtering, sorting, and detail queries"
```

---

### Task 4: Update Documentation

**Files:**
- Modify: `Documentation/DevelopmentPlan.md`

**Step 1: Mark Step 4.1 complete**

Add ✅ to the Step 4.1 heading and add implementation notes:

```
> **Implementation notes (2026-02-06):**
> - Created `services/routes.service.ts` with `getRoutes(filters)` and `getRouteById(id)`
> - `RouteFilters` type: gymId (required), gradeMin, gradeMax, status, sortBy, search
> - Default filters: active + retiring_soon, newest first
> - getRouteById joins setter profile via embedded select
> - 6 unit tests in `services/__tests__/routes.service.test.ts`
> - Total unit tests: 241
```

**Step 2: Commit docs**

```bash
git add Documentation/DevelopmentPlan.md
git commit -m "docs: mark Step 4.1 complete with implementation notes"
```
