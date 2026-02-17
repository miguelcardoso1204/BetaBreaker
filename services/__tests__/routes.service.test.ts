/**
 * Route Service Tests
 *
 * These tests verify that routeService methods correctly build Supabase
 * PostgREST query chains for fetching climbing routes. We mock
 * `@/lib/supabase` so tests run without a real database — isolating the
 * service layer from network and database concerns.
 *
 * Routes are the core entity in Beta Breaker — every gym has routes that
 * climbers browse, filter, and log ascents against. The service layer
 * needs to support:
 *   - Listing routes for a gym (with filters for grade, status, search)
 *   - Sorting by date or grade
 *   - Fetching a single route with its setter's profile info
 *
 * Mock strategy: Supabase PostgREST queries are method chains like
 *   `supabase.from('routes').select('*').eq('gym_id', id).order('created_at')`
 * We mock `from()` to return a chain object whose methods return `this`
 * (for chaining), with the terminal method resolving to expected data.
 *
 * "Terminal method" = the last method in the chain that returns a Promise.
 * Intermediate methods return the query builder (chainable), but the
 * terminal one actually fires the HTTP request to PostgREST.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
// Define the mock INSIDE the jest.mock factory because Jest hoists
// jest.mock() above all variable declarations (temporal dead zone).
// We only need `from` — the rest of the chain is built per-test.
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Import AFTER mock is defined — Jest replaces the real module with our mock.
// This import will FAIL until we create routes.service.ts (TDD red phase).
import { routeService } from "../routes.service";

// Extract the mock so we can configure return values per-test.
// jest.requireMock returns the already-mocked module without re-running the factory.
const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("routeService", () => {
  // Clear all mock call history between tests so one test's setup
  // doesn't leak into the next. This is critical when using
  // mockReturnValueOnce — stale values would cause false passes.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getRoutes ───────────────────────────────────────────────────

  describe("getRoutes", () => {
    it("fetches routes for a gym with default filters", async () => {
      // When no filters are provided, getRoutes should:
      // 1. Query the "routes" table
      // 2. Select all columns
      // 3. Filter to the specified gym
      // 4. Default to showing "active" and "retiring_soon" routes
      //    (not "archived" or "draft" — climbers only see climbable routes)
      // 5. Sort newest-first so freshly set routes appear at the top
      //
      // The chain: from('routes') → select('*') → eq('gym_id', ...) →
      //   in('status', [...]) → order('created_at', { ascending: false })
      //
      // `.order()` is the terminal method — it returns the Promise.
      const mockRoutes = [
        { id: "route-1", name: "Crimpy McSlab", gym_id: "gym-1", canonical_grade: 12 },
        { id: "route-2", name: "The Overhang", gym_id: "gym-1", canonical_grade: 18 },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        // `.in()` filters a column against an array of allowed values.
        // PostgREST translates this to SQL `WHERE status IN ('active', 'retiring_soon')`.
        in: jest.fn().mockReturnThis(),
        // `.order()` is terminal here — it fires the request and returns { data, error }.
        order: jest.fn().mockResolvedValueOnce({
          data: mockRoutes,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await routeService.getRoutes({ gymId: "gym-1" });

      // Verify the full query chain was built correctly
      expect(supabase.from).toHaveBeenCalledWith("routes");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenCalledWith("gym_id", "gym-1");
      // Default filter: only show routes climbers can actually attempt
      expect(chainMock.in).toHaveBeenCalledWith("status", [
        "active",
        "retiring_soon",
      ]);
      // Default sort: newest first so fresh routes are prominent
      expect(chainMock.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      // Data should flow through untransformed — the service is a thin wrapper
      expect(result.data).toEqual(mockRoutes);
      expect(result.error).toBeNull();
    });

    it("filters by grade range when gradeMin and gradeMax provided", async () => {
      // Climbers want to filter routes to their ability level. Grades are
      // stored as canonical integers (0–30) so range filtering is simple
      // numeric comparison: `gte` (>=) and `lte` (<=).
      //
      // Example: gradeMin=8 (V3), gradeMax=16 (V7) shows only moderate routes.
      //
      // `.gte()` and `.lte()` are PostgREST range filters that map to
      // SQL `WHERE canonical_grade >= 8 AND canonical_grade <= 16`.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        // Grade range filters — chained before the terminal .order()
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getRoutes({
        gymId: "gym-1",
        gradeMin: 8,
        gradeMax: 16,
      });

      // Verify both bounds of the grade range are applied
      expect(chainMock.gte).toHaveBeenCalledWith("canonical_grade", 8);
      expect(chainMock.lte).toHaveBeenCalledWith("canonical_grade", 16);
    });

    it("filters by specific status when provided", async () => {
      // Gym admins or setters might want to see archived routes (e.g., to
      // re-activate one). When a status filter is explicitly provided, it
      // should override the default ["active", "retiring_soon"].
      //
      // This tests that the service doesn't hardcode the default — it uses
      // whatever status array the caller passes in.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getRoutes({
        gymId: "gym-1",
        status: ["archived"],
      });

      // Should use the provided status, NOT the default
      expect(chainMock.in).toHaveBeenCalledWith("status", ["archived"]);
    });

    it("sorts by canonical_grade when sortBy is 'grade'", async () => {
      // By default routes sort by `created_at` (newest first). But climbers
      // often want to sort by difficulty — easiest first makes sense when
      // browsing for warmups or projecting progression.
      //
      // `.order('canonical_grade', { ascending: true })` maps to
      // SQL `ORDER BY canonical_grade ASC` — easiest routes first.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getRoutes({ gymId: "gym-1", sortBy: "grade" });

      // Grade sorting is ascending — easiest first is the natural expectation
      expect(chainMock.order).toHaveBeenCalledWith("canonical_grade", {
        ascending: true,
      });
    });

    it("searches by name when search is provided", async () => {
      // Climbers can search routes by name (e.g., "crimp" to find all
      // crimpy routes). The service uses `.ilike()` for case-insensitive
      // pattern matching — this maps to SQL `WHERE name ILIKE '%crimp%'`.
      //
      // `.ilike()` wraps the search term in `%` wildcards so it matches
      // anywhere in the route name, not just at the start.
      //
      // `.ilike()` is chained BEFORE `.order()`, so `.order()` remains
      // the terminal method that fires the request.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        // `.ilike()` is an intermediate chainable method for pattern matching
        ilike: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({
          data: [{ id: "route-1", name: "Crimpy McSlab" }],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getRoutes({ gymId: "gym-1", search: "crimp" });

      // Verify case-insensitive search with wildcards on both sides
      expect(chainMock.ilike).toHaveBeenCalledWith("name", "%crimp%");
    });
  });

  // ── getCandidateRoutes ────────────────────────────────────────

  describe("getCandidateRoutes", () => {
    it("fetches routes with style tags in the grade range", async () => {
      // getCandidateRoutes queries active/retiring_soon routes for a gym,
      // filtered to a canonical grade range, with style tags embedded via
      // PostgREST's nested resource embedding:
      //   routes → route_style_tags → style_tags
      //
      // The nested tag data is flattened into a `tags: string[]` array
      // so the scoring algorithm gets a simple list of tag names.
      const mockRows = [
        {
          id: "route-1",
          name: "Crimpy Arete",
          canonical_grade: 10,
          color: "#EF4444",
          status: "active",
          route_style_tags: [
            { tag: { name: "crimpy" } },
            { tag: { name: "overhang" } },
          ],
        },
        {
          id: "route-2",
          name: "Slab Master",
          canonical_grade: 8,
          color: "#22C55E",
          status: "retiring_soon",
          route_style_tags: [{ tag: { name: "slab" } }],
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: mockRows,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await routeService.getCandidateRoutes("gym-1", 8, 12);

      // Verify query construction
      expect(supabase.from).toHaveBeenCalledWith("routes");
      expect(chainMock.select).toHaveBeenCalledWith(
        "id, name, canonical_grade, color, status, route_style_tags(tag:style_tags(name))"
      );
      expect(chainMock.eq).toHaveBeenCalledWith("gym_id", "gym-1");
      expect(chainMock.gte).toHaveBeenCalledWith("canonical_grade", 8);
      expect(chainMock.lte).toHaveBeenCalledWith("canonical_grade", 12);
      expect(chainMock.in).toHaveBeenCalledWith("status", [
        "active",
        "retiring_soon",
      ]);

      // Verify tag flattening — nested route_style_tags → flat string[]
      expect(result).toEqual([
        {
          id: "route-1",
          name: "Crimpy Arete",
          canonical_grade: 10,
          color: "#EF4444",
          status: "active",
          tags: ["crimpy", "overhang"],
        },
        {
          id: "route-2",
          name: "Slab Master",
          canonical_grade: 8,
          color: "#22C55E",
          status: "retiring_soon",
          tags: ["slab"],
        },
      ]);
    });

    it("clamps grade range to 0-30 bounds", async () => {
      // If gradeMin is negative or gradeMax exceeds 30, the service
      // should clamp to the valid canonical grade range (0-30).
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await routeService.getCandidateRoutes("gym-1", -2, 35);

      // Should be clamped to [0, 30]
      expect(chainMock.gte).toHaveBeenCalledWith("canonical_grade", 0);
      expect(chainMock.lte).toHaveBeenCalledWith("canonical_grade", 30);
    });

    it("handles routes with no style tags gracefully", async () => {
      // Some routes may not have any crowd-sourced style tags yet.
      // The service should return them with an empty tags array.
      const mockRows = [
        {
          id: "route-1",
          name: "New Route",
          canonical_grade: 10,
          color: null,
          status: "active",
          route_style_tags: [],
        },
        {
          id: "route-2",
          name: "Broken Route",
          canonical_grade: 8,
          color: null,
          status: "active",
          route_style_tags: [{ tag: null }], // Malformed tag
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: mockRows,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await routeService.getCandidateRoutes("gym-1", 8, 12);

      expect(result[0].tags).toEqual([]);
      expect(result[1].tags).toEqual([]);
    });

    it("throws when Supabase returns an error", async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: "Connection refused", code: "PGRST000" },
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await expect(
        routeService.getCandidateRoutes("gym-1", 8, 12)
      ).rejects.toEqual({ message: "Connection refused", code: "PGRST000" });
    });
  });

  // ── getRouteById ────────────────────────────────────────────────

  describe("getRouteById", () => {
    it("fetches a single route with setter profile", async () => {
      // When viewing a route's detail screen, we need the route data plus
      // the setter's display name and avatar. Supabase's PostgREST supports
      // "resource embedding" — a JOIN-like syntax in the `select` string:
      //
      //   select("*, setter:profiles!setter_id(display_name, avatar_url)")
      //
      // This tells PostgREST:
      //   - `*` — select all columns from routes
      //   - `setter:` — alias the joined data as "setter" in the response
      //   - `profiles!setter_id` — join the profiles table using the
      //     `setter_id` foreign key (not the default FK)
      //   - `(display_name, avatar_url)` — only fetch these two columns
      //     from profiles (no need for the full profile)
      //
      // `.single()` tells PostgREST we expect exactly one row. If zero
      // or multiple rows match, Supabase returns an error — this is a
      // safety check since route IDs are unique primary keys.
      const mockRoute = {
        id: "route-1",
        name: "Crimpy McSlab",
        gym_id: "gym-1",
        canonical_grade: 12,
        setter_id: "setter-1",
        setter: {
          display_name: "RouteSetterPro",
          avatar_url: "https://example.com/avatar.jpg",
        },
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        // `.single()` is the terminal method for single-row queries —
        // it returns { data, error } and enforces exactly-one-row semantics.
        single: jest.fn().mockResolvedValueOnce({
          data: mockRoute,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await routeService.getRouteById("route-1");

      // Verify the correct table is queried
      expect(supabase.from).toHaveBeenCalledWith("routes");
      // Verify the resource embedding select string for setter profile
      expect(chainMock.select).toHaveBeenCalledWith(
        "*, setter:profiles!setter_id(display_name, avatar_url)"
      );
      // Verify we filter by the specific route ID
      expect(chainMock.eq).toHaveBeenCalledWith("id", "route-1");
      // Verify .single() is called to enforce exactly-one-row semantics
      expect(chainMock.single).toHaveBeenCalledTimes(1);
      // Verify the nested setter object is included in the response
      expect(result.data).toEqual(mockRoute);
      expect(result.data?.setter?.display_name).toBe("RouteSetterPro");
      expect(result.error).toBeNull();
    });
  });
});
