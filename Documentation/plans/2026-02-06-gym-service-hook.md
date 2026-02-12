# Gym Service & Hook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a gym service (`gymService`) and TanStack Query hooks (`useGyms`, `useGym`, `useSetHomeGym`) that let screens browse gyms, view gym details, and set a user's home gym.

**Architecture:** Three-layer pattern matching routes: service builds PostgREST queries → hooks wrap with `useQuery`/`useMutation` for caching and loading states → screens consume `{ data, isLoading, error }`. The `setHomeGym` operation uses `useMutation` (not `useQuery`) because it's a write operation — it updates the user's profile and invalidates the auth cache so `useAuth().user.homeGymId` stays fresh.

**Tech Stack:** TanStack Query v5 (`useQuery`, `useMutation`, `useQueryClient`), TypeScript, Jest + `@testing-library/react-native` (`renderHook`)

---

### Task 1: Write Failing Service Tests

**Files:**
- Create: `services/__tests__/gyms.service.test.ts`

**Step 1: Write the test file**

```typescript
/**
 * Gym Service Tests
 *
 * These tests verify that gymService methods correctly build Supabase
 * PostgREST query chains for fetching and managing gyms. We mock
 * `@/lib/supabase` so tests run without a real database.
 *
 * Gyms are the organizational unit in Beta Breaker — climbers set a
 * "home gym" and browse routes within it. The service needs to support:
 *   - Listing all gyms (for the gym directory / picker)
 *   - Fetching a single gym by ID (for gym detail screen)
 *   - Setting the user's home gym (updates profile's home_gym_id)
 *
 * Mock strategy: Same as routes.service.test.ts — mock `supabase.from()`
 * to return chain objects, with terminal methods resolving to test data.
 */

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { gymService } from "../gyms.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("gymService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getGyms ─────────────────────────────────────────────────────

  describe("getGyms", () => {
    it("fetches all gyms ordered by name", async () => {
      // The gym directory shows all gyms alphabetically. This is the
      // simplest query: select all columns, order by name ascending.
      // `.order()` is the terminal method that fires the request.
      const mockGyms = [
        { id: "gym-1", name: "Ape Index", default_grade_system: "v-scale" },
        { id: "gym-2", name: "Summit Gym", default_grade_system: "font" },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: mockGyms,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gymService.getGyms();

      expect(supabase.from).toHaveBeenCalledWith("gyms");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      // Alphabetical order makes the directory scannable
      expect(chainMock.order).toHaveBeenCalledWith("name", {
        ascending: true,
      });
      expect(result.data).toEqual(mockGyms);
      expect(result.error).toBeNull();
    });
  });

  // ── getGymById ──────────────────────────────────────────────────

  describe("getGymById", () => {
    it("fetches a single gym by ID", async () => {
      // The gym detail screen needs all gym info. `.single()` enforces
      // exactly-one-row semantics — gym IDs are unique primary keys.
      const mockGym = {
        id: "gym-1",
        name: "Ape Index",
        address: "123 Climb St",
        latitude: 40.7128,
        longitude: -74.006,
        social_links: { instagram: "@apeindex" },
        default_grade_system: "v-scale",
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: mockGym,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gymService.getGymById("gym-1");

      expect(supabase.from).toHaveBeenCalledWith("gyms");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenCalledWith("id", "gym-1");
      expect(chainMock.single).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(mockGym);
      expect(result.error).toBeNull();
    });
  });

  // ── setHomeGym ──────────────────────────────────────────────────

  describe("setHomeGym", () => {
    it("updates the user profile with the new home gym ID", async () => {
      // Setting a home gym writes to the profiles table, not the gyms
      // table. The profile's `home_gym_id` FK points to the gym.
      // RLS ensures users can only update their own profile.
      //
      // Chain: from('profiles') → update({ home_gym_id }) → eq('id', userId)
      // `.eq()` is the terminal method here — it fires the UPDATE request.
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gymService.setHomeGym("user-1", "gym-1");

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(chainMock.update).toHaveBeenCalledWith({
        home_gym_id: "gym-1",
      });
      expect(chainMock.eq).toHaveBeenCalledWith("id", "user-1");
      expect(result.error).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- services/__tests__/gyms.service.test.ts`
Expected: FAIL — `../gyms.service` module doesn't exist yet.

---

### Task 2: Implement Gym Service

**Files:**
- Create: `services/gyms.service.ts`
- Modify: `services/index.ts`

**Step 1: Create the service file**

```typescript
/**
 * Gym Service — Thin Wrapper Around Supabase Gym Queries
 *
 * This service builds PostgREST query chains for fetching and managing gyms.
 * Gyms are the organizational unit in Beta Breaker — every route belongs to
 * a gym, and users set a "home gym" to customize their experience.
 *
 * Methods:
 *   getGyms()              — list all gyms (for directory / picker screens)
 *   getGymById(id)         — fetch a single gym (for gym detail screen)
 *   setHomeGym(userId, id) — set the user's home gym (updates profile)
 *
 * Same thin-wrapper pattern as routeService — no business logic, no
 * validation, no state management. RLS handles authorization.
 */

import { supabase } from "@/lib/supabase";

export const gymService = {
  /**
   * Fetch all gyms, alphabetically sorted.
   *
   * Used by the gym directory and the home gym picker. Returns every gym
   * in the system — RLS allows all authenticated users to read gyms.
   * Alphabetical sort makes the list scannable for users.
   *
   * Chain: from('gyms') → select('*') → order('name', ascending)
   */
  getGyms() {
    return supabase
      .from("gyms")
      .select("*")
      .order("name", { ascending: true });
  },

  /**
   * Fetch a single gym by its UUID.
   *
   * Used by the gym detail screen to show address, social links, grade
   * system, and other info. `.single()` enforces exactly-one-row — if
   * the ID doesn't exist, Supabase returns an error (PGRST116).
   *
   * Chain: from('gyms') → select('*') → eq('id', gymId) → single()
   */
  getGymById(gymId: string) {
    return supabase
      .from("gyms")
      .select("*")
      .eq("id", gymId)
      .single();
  },

  /**
   * Set the user's home gym by updating their profile.
   *
   * This writes to the `profiles` table (not `gyms`) because `home_gym_id`
   * is a column on profiles — it's the user's preference, not a gym property.
   * RLS ensures users can only update their own profile (id = auth.uid()).
   *
   * The hook layer passes `session.user.id` as userId, so the RLS check
   * always passes for the current user.
   *
   * Chain: from('profiles') → update({ home_gym_id }) → eq('id', userId)
   *
   * @param userId — the auth user's UUID (from session)
   * @param gymId — the gym UUID to set as home gym
   */
  setHomeGym(userId: string, gymId: string) {
    return supabase
      .from("profiles")
      .update({ home_gym_id: gymId })
      .eq("id", userId);
  },
};
```

**Step 2: Add to barrel export**

Add to `services/index.ts`:

```typescript
// gymService — fetches gym directory, gym details, and sets home gym.
export { gymService } from "./gyms.service";
```

**Step 3: Run service tests to verify they pass**

Run: `npm test -- services/__tests__/gyms.service.test.ts`
Expected: ALL PASS (3 tests).

---

### Task 3: Write Failing Hook Tests

**Files:**
- Create: `hooks/__tests__/useGyms.test.tsx`

**Step 1: Write the test file**

```typescript
/**
 * useGyms / useGym / useSetHomeGym Hook Tests
 *
 * These hooks wrap gymService methods with TanStack Query, adding
 * caching for gym lists and details, plus a mutation for setting
 * the user's home gym.
 *
 * The setHomeGym mutation is the first useMutation in the codebase.
 * Unlike useQuery (read), useMutation handles write operations and
 * lets us invalidate related caches after the write succeeds — so
 * the auth profile refreshes to show the new homeGymId.
 *
 * Mock strategy: We mock the SERVICE layer (gymService), not Supabase.
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock gymService ──────────────────────────────────────────────
jest.mock("@/services/gyms.service", () => ({
  gymService: {
    getGyms: jest.fn(),
    getGymById: jest.fn(),
    setHomeGym: jest.fn(),
  },
}));

import { useGyms, useGym, useSetHomeGym } from "../useGyms";

const { gymService } = jest.requireMock<{
  gymService: {
    getGyms: jest.Mock;
    getGymById: jest.Mock;
    setHomeGym: jest.Mock;
  };
}>("@/services/gyms.service");

// ── Test wrapper ─────────────────────────────────────────────────

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

// ── Fixtures ─────────────────────────────────────────────────────

const mockGyms = [
  { id: "gym-1", name: "Ape Index", default_grade_system: "v-scale" },
  { id: "gym-2", name: "Summit Gym", default_grade_system: "font" },
];

const mockGymDetail = {
  id: "gym-1",
  name: "Ape Index",
  address: "123 Climb St",
  latitude: 40.7128,
  longitude: -74.006,
  social_links: { instagram: "@apeindex" },
  default_grade_system: "v-scale",
};

describe("useGyms", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Before the query resolves, isLoading should be true.
    gymService.getGyms.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useGyms(),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns gyms data after fetch", async () => {
    // The service returns { data, error } — the hook unwraps it.
    gymService.getGyms.mockResolvedValueOnce({
      data: mockGyms,
      error: null,
    });

    const { result } = renderHook(
      () => useGyms(),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockGyms);
  });
});

describe("useGym", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches a single gym by ID", async () => {
    // The detail hook fetches one gym for the gym detail screen.
    gymService.getGymById.mockResolvedValueOnce({
      data: mockGymDetail,
      error: null,
    });

    const { result } = renderHook(
      () => useGym("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockGymDetail);
    expect(gymService.getGymById).toHaveBeenCalledWith("gym-1");
  });
});

describe("useSetHomeGym", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls gymService.setHomeGym with userId and gymId", async () => {
    // The mutation hook wraps the service's setHomeGym method.
    // useMutation exposes a `mutateAsync` function that the screen
    // calls when the user taps "Set as Home Gym".
    gymService.setHomeGym.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(
      () => useSetHomeGym(),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        gymId: "gym-1",
      });
    });

    expect(gymService.setHomeGym).toHaveBeenCalledWith("user-1", "gym-1");
  });

  it("sets error state on failure", async () => {
    // When the service returns an error, the mutation's error state
    // should be set so the screen can show a failure message.
    gymService.setHomeGym.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(
      () => useSetHomeGym(),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      try {
        await result.current.mutateAsync({
          userId: "user-1",
          gymId: "gym-1",
        });
      } catch {
        // Expected — mutateAsync throws on error
      }
    });

    expect(result.current.error).toBeTruthy();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- hooks/__tests__/useGyms.test.tsx`
Expected: FAIL — `../useGyms` module doesn't exist yet.

---

### Task 4: Implement Gym Hooks

**Files:**
- Create: `hooks/useGyms.ts`
- Modify: `hooks/index.ts`

**Step 1: Create the hooks file**

```typescript
/**
 * Gym Hooks — TanStack Query Wrappers for Gym Data
 *
 * These hooks are the primary API screens use to fetch gym data and
 * set the user's home gym. They wrap gymService methods with TanStack
 * Query's useQuery (reads) and useMutation (writes).
 *
 * QUERY KEYS:
 *   ["gyms"]          — all gyms list (gym directory)
 *   ["gyms", gymId]   — single gym detail
 *
 * MUTATIONS:
 *   useSetHomeGym — writes to profiles table, then invalidates the
 *   "auth" cache so useAuth().user.homeGymId updates automatically.
 *
 * Why useMutation for setHomeGym?
 * useQuery is for reads — it caches and refetches. useMutation is for
 * writes — it doesn't cache the result, but it lets us run side effects
 * (like cache invalidation) after the write succeeds. This is the
 * standard TanStack Query pattern for POST/PUT/DELETE operations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gymService } from "@/services/gyms.service";

/**
 * Fetch the list of all gyms.
 *
 * Used by the gym directory screen and home gym picker. Cached under
 * the ["gyms"] key — the gym list rarely changes, so TanStack Query's
 * default staleTime keeps it fresh without excessive refetches.
 */
export function useGyms() {
  return useQuery({
    queryKey: ["gyms"],
    queryFn: async () => {
      const result = await gymService.getGyms();
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Fetch a single gym by ID.
 *
 * Used by the gym detail screen. Cached per gymId so navigating back
 * to the same gym is instant.
 */
export function useGym(gymId: string) {
  return useQuery({
    queryKey: ["gyms", gymId],
    queryFn: async () => {
      const result = await gymService.getGymById(gymId);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Mutation hook to set the user's home gym.
 *
 * After a successful write, we invalidate the "auth" query cache.
 * This makes useAuth() refetch the user's profile, which picks up
 * the new home_gym_id. Without this invalidation, the UI would show
 * stale homeGymId until the next full auth refresh.
 *
 * Usage in a screen:
 *   const setHomeGym = useSetHomeGym();
 *   const handlePress = () => {
 *     setHomeGym.mutate({ userId: session.user.id, gymId: "gym-1" });
 *   };
 */
export function useSetHomeGym() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, gymId }: { userId: string; gymId: string }) => {
      const result = await gymService.setHomeGym(userId, gymId);
      if (result.error) throw result.error;
      return result.data;
    },
    // After setting home gym, invalidate auth-related caches so the
    // profile refreshes with the new homeGymId value.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}
```

**Step 2: Add to barrel export**

Add to `hooks/index.ts`:

```typescript
// useGyms — fetches gym directory via TanStack Query.
// useGym — fetches a single gym's details.
// useSetHomeGym — mutation to update the user's home gym.
export { useGyms, useGym, useSetHomeGym } from "./useGyms";
```

**Step 3: Run hook tests to verify they pass**

Run: `npm test -- hooks/__tests__/useGyms.test.tsx`
Expected: ALL PASS (5 tests).

**Step 4: Run full test suite + type check**

Run: `npm test`
Expected: All 249+ tests pass.

Run: `npx tsc --noEmit`
Expected: No new errors.

---

### Task 5: Commit and Update Docs

**Step 1: Commit**

```bash
git add services/gyms.service.ts services/__tests__/gyms.service.test.ts services/index.ts hooks/useGyms.ts hooks/__tests__/useGyms.test.tsx hooks/index.ts
git commit -m "feat: add gym service and hooks with TanStack Query"
```

**Step 2: Update DevelopmentPlan.md**

Mark Step 4.3 complete:

```
> **Implementation notes (2026-02-06):**
> - Created `services/gyms.service.ts` with `getGyms()`, `getGymById(id)`, `setHomeGym(userId, gymId)`
> - Created `hooks/useGyms.ts` with `useGyms()`, `useGym(id)`, `useSetHomeGym()`
> - useSetHomeGym uses `useMutation` + invalidates ["auth"] cache on success
> - 3 service tests + 5 hook tests = 8 new tests
> - Total unit tests: 254
```

**Step 3: Commit docs**

```bash
git add Documentation/DevelopmentPlan.md
git commit -m "docs: mark Step 4.3 complete with implementation notes"
```
