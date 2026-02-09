/**
 * Saved Routes Service Tests
 *
 * Tests the savedRoutesService methods that manage "favorite", "project",
 * and "wishlist" bookmarks on climbing routes. The saved_routes table is
 * a simple junction table: (user_id, route_id, save_type) → one row.
 *
 * We mock `@/lib/supabase` the same way as routes.service.test.ts —
 * each PostgREST method in the chain returns `this` for chaining, with
 * the terminal method resolving to { data, error }.
 *
 * Why a separate service instead of putting this in routeService?
 * saved_routes is a different table with different operations (CRUD on
 * bookmarks vs. read-only route queries). Keeping services per-table
 * makes each file small and focused, and aligns with the project's
 * "thin wrapper per table" convention.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
// Define the mock INSIDE the jest.mock factory because Jest hoists
// jest.mock() above all variable declarations (temporal dead zone).
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Import AFTER mock is defined — Jest replaces the real module with our mock.
import { savedRoutesService } from "../savedRoutes.service";

// Extract the mock so we can configure return values per-test.
const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("savedRoutesService", () => {
  // Clear all mock call history between tests to prevent leakage.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getSavedRoute ───────────────────────────────────────────────

  describe("getSavedRoute", () => {
    it("fetches a saved route by user, route, and save type", async () => {
      // getSavedRoute checks if a specific bookmark exists. This is used
      // by useIsFavorite to determine if the star icon should be filled.
      //
      // Chain: from('saved_routes') → select('*') → eq('user_id', ...)
      //   → eq('route_id', ...) → eq('save_type', ...) → maybeSingle()
      //
      // `.maybeSingle()` returns { data: row | null, error } — unlike
      // `.single()`, it does NOT error when zero rows match. This is
      // important because "not favorited" is a valid state, not an error.
      const mockSavedRoute = {
        id: "saved-1",
        user_id: "user-1",
        route_id: "route-1",
        save_type: "favorite",
        created_at: "2026-01-01T00:00:00Z",
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        // `.maybeSingle()` is the terminal method — it resolves the request.
        // Returns the row if found, or null if not (without error).
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: mockSavedRoute,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await savedRoutesService.getSavedRoute(
        "user-1",
        "route-1",
        "favorite"
      );

      // Verify the correct table and filters
      expect(supabase.from).toHaveBeenCalledWith("saved_routes");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      // Three .eq() calls — one for each part of the composite lookup
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(chainMock.eq).toHaveBeenCalledWith("route_id", "route-1");
      expect(chainMock.eq).toHaveBeenCalledWith("save_type", "favorite");
      expect(chainMock.maybeSingle).toHaveBeenCalledTimes(1);
      // Data should flow through untransformed
      expect(result.data).toEqual(mockSavedRoute);
      expect(result.error).toBeNull();
    });

    it("returns null data when no saved route exists", async () => {
      // When a user hasn't favorited a route, maybeSingle returns null
      // for data — this is the expected "not favorited" state.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await savedRoutesService.getSavedRoute(
        "user-1",
        "route-1",
        "favorite"
      );

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  // ── saveRoute ─────────────────────────────────────────────────────

  describe("saveRoute", () => {
    it("inserts a new saved route row", async () => {
      // When the user taps the star to favorite a route, we INSERT a row
      // into saved_routes. The composite unique constraint (user_id, route_id,
      // save_type) prevents duplicate favorites.
      //
      // Chain: from('saved_routes') → insert({ ... }) → select() → single()
      //
      // `.select()` after `.insert()` tells PostgREST to return the inserted
      // row (by default, INSERT returns nothing). `.single()` ensures exactly
      // one row is returned — since we're inserting one row, this is safe.
      const mockInserted = {
        id: "saved-1",
        user_id: "user-1",
        route_id: "route-1",
        save_type: "favorite",
        created_at: "2026-01-01T00:00:00Z",
      };

      const chainMock = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: mockInserted,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await savedRoutesService.saveRoute(
        "user-1",
        "route-1",
        "favorite"
      );

      expect(supabase.from).toHaveBeenCalledWith("saved_routes");
      expect(chainMock.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        route_id: "route-1",
        save_type: "favorite",
      });
      expect(chainMock.select).toHaveBeenCalledTimes(1);
      expect(chainMock.single).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(mockInserted);
      expect(result.error).toBeNull();
    });
  });

  // ── unsaveRoute ────────────────────────────────────────────────────

  describe("unsaveRoute", () => {
    it("deletes a saved route by user, route, and save type", async () => {
      // When the user un-favorites a route, we DELETE the matching row.
      // We use the same three-column filter as getSavedRoute to target
      // the exact bookmark.
      //
      // Chain: from('saved_routes') → delete() → eq('user_id', ...)
      //   → eq('route_id', ...) → eq('save_type', ...)
      //
      // DELETE doesn't return data by default — we just need to check
      // that no error occurred.
      //
      // Mock strategy for chained .eq() calls:
      // Each .eq() returns a new object with its own .eq(), forming a
      // nested chain. The last .eq() is the terminal method that resolves.
      const thirdEq = jest.fn().mockResolvedValueOnce({ data: null, error: null });
      const secondEq = jest.fn().mockReturnValueOnce({ eq: thirdEq });
      const firstEq = jest.fn().mockReturnValueOnce({ eq: secondEq });

      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: firstEq }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await savedRoutesService.unsaveRoute(
        "user-1",
        "route-1",
        "favorite"
      );

      // Verify the correct table is targeted and delete is called
      expect(supabase.from).toHaveBeenCalledWith("saved_routes");
      expect(chainMock.delete).toHaveBeenCalledTimes(1);
      // Verify the three filter columns
      expect(firstEq).toHaveBeenCalledWith("user_id", "user-1");
      expect(secondEq).toHaveBeenCalledWith("route_id", "route-1");
      expect(thirdEq).toHaveBeenCalledWith("save_type", "favorite");
      expect(result.error).toBeNull();
    });
  });
});
