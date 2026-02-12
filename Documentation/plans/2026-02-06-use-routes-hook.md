# useRoutes Hook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create TanStack Query hooks (`useRoutes` and `useRouteDetail`) that wrap the routes service with caching, loading states, and automatic refetch on filter changes.

**Architecture:** Two hooks that wrap `routeService` methods with `useQuery`. Query keys include the filter values so TanStack Query automatically refetches when filters change and caches results per-filter-combination. The hooks return the standard `{ data, isLoading, error }` shape that screens consume. No business logic — just cache orchestration.

**Tech Stack:** TanStack Query v5 (`useQuery`), TypeScript, Jest + `@testing-library/react-native` (`renderHook`)

---

### Task 1: Write Failing Tests

**Files:**
- Create: `hooks/__tests__/useRoutes.test.ts`

**Step 1: Write the test file**

The hook tests mock the service layer (not Supabase) and wrap renders in a `QueryClientProvider`. TanStack Query hooks require this provider context — without it, `useQuery` throws.

```typescript
/**
 * useRoutes / useRouteDetail Hook Tests
 *
 * These hooks wrap routeService methods with TanStack Query, adding:
 * - Caching: identical filter combos share one cache entry
 * - Loading/error states: screens get { data, isLoading, error }
 * - Auto-refetch: changing filters triggers a new query automatically
 *
 * Mock strategy: We mock the SERVICE layer (routeService), not Supabase.
 * The hook doesn't know or care about PostgREST chains — it just calls
 * routeService.getRoutes(filters) and lets TanStack Query manage the rest.
 *
 * TanStack Query setup: Hooks must render inside a QueryClientProvider.
 * We create a fresh QueryClient per test (with retry disabled) to prevent
 * cache leakage between tests and avoid flaky retry-related timing issues.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock routeService ─────────────────────────────────────────────
jest.mock("@/services/routes.service", () => ({
  routeService: {
    getRoutes: jest.fn(),
    getRouteById: jest.fn(),
  },
}));

import { useRoutes, useRouteDetail } from "../useRoutes";

const { routeService } = jest.requireMock<{
  routeService: {
    getRoutes: jest.Mock;
    getRouteById: jest.Mock;
  };
}>("@/services/routes.service");

// ── Test wrapper ──────────────────────────────────────────────────
// TanStack Query hooks must render inside a QueryClientProvider.
// We create a fresh client per test with retry disabled so failed
// queries don't retry and cause flaky test timing.

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// ── Fixtures ──────────────────────────────────────────────────────

const mockRoutes = [
  { id: "route-1", name: "Baby Steps", canonical_grade: 0, status: "active", gym_id: "gym-1" },
  { id: "route-2", name: "The Crimp", canonical_grade: 10, status: "active", gym_id: "gym-1" },
];

const mockRouteDetail = {
  id: "route-1",
  name: "Baby Steps",
  canonical_grade: 0,
  status: "active",
  gym_id: "gym-1",
  setter: { display_name: "Sam Setter", avatar_url: null },
};

describe("useRoutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Before the query resolves, isLoading should be true and data undefined.
    // This is the state screens use to show a loading spinner.
    routeService.getRoutes.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useRoutes({ gymId: "gym-1" }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns routes data after fetch", async () => {
    // The service returns { data, error } — the hook should expose
    // just the data array (unwrapped from the Supabase response shape).
    routeService.getRoutes.mockResolvedValueOnce({
      data: mockRoutes,
      error: null,
    });

    const { result } = renderHook(
      () => useRoutes({ gymId: "gym-1" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockRoutes);
    expect(routeService.getRoutes).toHaveBeenCalledWith({ gymId: "gym-1" });
  });

  it("returns error state on failure", async () => {
    // When the service returns an error, TanStack Query sets the error
    // state. Screens use this to show an error message.
    routeService.getRoutes.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(
      () => useRoutes({ gymId: "gym-1" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it("passes filters to the service", async () => {
    // When the user applies filters (grade range, search, etc.), the hook
    // should forward them to the service unchanged. TanStack Query uses
    // the filters as part of the query key, so changing filters triggers
    // a new fetch automatically.
    routeService.getRoutes.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const filters = { gymId: "gym-1", gradeMin: 8, gradeMax: 16, sortBy: "grade" as const };

    const { result } = renderHook(
      () => useRoutes(filters),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(routeService.getRoutes).toHaveBeenCalledWith(filters);
  });
});

describe("useRouteDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches a single route by ID", async () => {
    // The detail hook fetches one route with setter info for the
    // route detail screen. The service does the PostgREST join —
    // the hook just wraps it in useQuery for caching.
    routeService.getRouteById.mockResolvedValueOnce({
      data: mockRouteDetail,
      error: null,
    });

    const { result } = renderHook(
      () => useRouteDetail("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockRouteDetail);
    expect(routeService.getRouteById).toHaveBeenCalledWith("route-1");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- hooks/__tests__/useRoutes.test.ts`
Expected: FAIL — `../useRoutes` module doesn't exist yet.

---

### Task 2: Implement useRoutes and useRouteDetail

**Files:**
- Create: `hooks/useRoutes.ts`
- Modify: `hooks/index.ts`

**Step 1: Create the hooks file**

```typescript
/**
 * Route Hooks — TanStack Query Wrappers for Route Data
 *
 * These hooks are the primary API screens use to fetch route data.
 * They wrap routeService methods with TanStack Query's useQuery, which
 * provides automatic caching, loading/error states, and background refetch.
 *
 * WHY TanStack Query instead of plain useEffect + useState?
 * Without TanStack Query, every screen would need:
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState(null);
 *   useEffect(() => { fetchData().then(setData).catch(setError)... }, [deps]);
 * That's 10+ lines of boilerplate PER data fetch. TanStack Query replaces
 * all of it with one `useQuery()` call AND adds caching for free.
 *
 * QUERY KEYS:
 * TanStack Query identifies cache entries by "query keys" — arrays that
 * uniquely describe what data was fetched. When the key changes, TanStack
 * Query knows the old cache is for a different query and fetches fresh data.
 *
 * Our key structure:
 *   ["routes", { gymId, gradeMin, gradeMax, ... }]  — route list
 *   ["routes", routeId]                              — single route detail
 *
 * This means:
 *   - Two screens fetching routes for the same gym + filters share one cache
 *   - Changing a filter (e.g., gradeMin) creates a new cache entry and refetches
 *   - Route detail is cached per-route, so navigating back is instant
 */

import { useQuery } from "@tanstack/react-query";
import { routeService } from "@/services/routes.service";
import type { RouteFilters } from "@/services/routes.service";

/**
 * Fetch a filtered list of routes for a gym.
 *
 * @param filters — gymId (required) + optional grade, status, search, sort
 * @returns TanStack Query result: { data, isLoading, error, refetch, ... }
 *
 * The query key includes the entire filters object. When any filter value
 * changes (e.g., user selects a different grade range), TanStack Query
 * sees a different key and triggers a new fetch. The old data stays in
 * cache so switching back to previous filters is instant.
 */
export function useRoutes(filters: RouteFilters) {
  return useQuery({
    // Query key: ["routes", { gymId, gradeMin, ... }]
    // TanStack Query deeply compares objects in keys, so { gymId: "1" }
    // and { gymId: "1" } are treated as the same key (cache hit).
    queryKey: ["routes", filters],
    // queryFn: the async function that fetches the data.
    // routeService.getRoutes returns { data, error } from Supabase.
    // We unwrap it here: throw on error (so TanStack Query catches it),
    // return just the data array on success.
    queryFn: async () => {
      const result = await routeService.getRoutes(filters);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Fetch a single route by ID with setter profile info.
 *
 * @param routeId — the UUID of the route to fetch
 * @returns TanStack Query result: { data, isLoading, error, ... }
 *
 * Used by the route detail screen. The query is cached per routeId,
 * so navigating to the same route twice doesn't refetch (within staleTime).
 */
export function useRouteDetail(routeId: string) {
  return useQuery({
    queryKey: ["routes", routeId],
    queryFn: async () => {
      const result = await routeService.getRouteById(routeId);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}
```

**Step 2: Add to barrel export**

Add to `hooks/index.ts`:

```typescript
// useRoutes — fetches filtered route lists via TanStack Query.
// useRouteDetail — fetches a single route with setter info.
export { useRoutes, useRouteDetail } from "./useRoutes";
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- hooks/__tests__/useRoutes.test.ts`
Expected: ALL PASS (5 tests).

**Step 4: Run full test suite + type check**

Run: `npm test`
Expected: All 246+ tests pass.

Run: `npx tsc --noEmit`
Expected: No new errors.

---

### Task 3: Commit and Update Docs

**Step 1: Commit**

```bash
git add hooks/useRoutes.ts hooks/__tests__/useRoutes.test.ts hooks/index.ts
git commit -m "feat: add useRoutes and useRouteDetail hooks with TanStack Query"
```

**Step 2: Update DevelopmentPlan.md**

Mark Step 4.2 complete:

```
> **Implementation notes (2026-02-06):**
> - Created `hooks/useRoutes.ts` with `useRoutes(filters)` and `useRouteDetail(routeId)`
> - Query keys: ["routes", filters] for lists, ["routes", routeId] for detail
> - queryFn unwraps Supabase { data, error } — throws on error, returns data
> - 5 unit tests in `hooks/__tests__/useRoutes.test.ts`
> - Total unit tests: 246
```

**Step 3: Commit docs**

```bash
git add Documentation/DevelopmentPlan.md
git commit -m "docs: mark Step 4.2 complete with implementation notes"
```
