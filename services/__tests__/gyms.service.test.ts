/**
 * Gym Service Tests
 *
 * These tests verify that gymService methods correctly build Supabase
 * PostgREST query chains for fetching and managing gyms. We mock
 * `@/lib/supabase` so tests run without a real database.
 *
 * Gyms are the organizational unit in Beta Breaker — climbers can
 * favorite multiple gyms and browse routes within them. The service supports:
 *   - Listing all gyms (for the gym directory / picker screens)
 *   - Fetching a single gym by ID (for gym detail screen)
 *   - Fetching the user's favorite gyms (from favorite_gyms join table)
 *   - Adding a gym to favorites (insert into favorite_gyms)
 *   - Removing a gym from favorites (delete from favorite_gyms)
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

  // ── getFavoriteGyms ─────────────────────────────────────────────

  describe("getFavoriteGyms", () => {
    it("fetches all favorite gyms for a user with gym data joined", async () => {
      // Queries the favorite_gyms join table and joins the full gym data
      // via FK. Returns rows like { gym_id, gyms: { id, name, ... } }.
      // RLS ensures users can only read their own favorites.
      //
      // Chain: from('favorite_gyms') → select('gym_id, gyms(*)') → eq('user_id', userId)
      const mockFavorites = [
        { gym_id: "gym-1", gyms: { id: "gym-1", name: "Ape Index" } },
        { gym_id: "gym-2", gyms: { id: "gym-2", name: "Summit Gym" } },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          data: mockFavorites,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gymService.getFavoriteGyms("user-1");

      expect(supabase.from).toHaveBeenCalledWith("favorite_gyms");
      expect(chainMock.select).toHaveBeenCalledWith("gym_id, gyms(*)");
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(result.data).toEqual(mockFavorites);
      expect(result.error).toBeNull();
    });
  });

  // ── addFavoriteGym ────────────────────────────────────────────

  describe("addFavoriteGym", () => {
    it("inserts a row into favorite_gyms", async () => {
      // Adding a favorite inserts into the favorite_gyms join table.
      // The composite PK (user_id, gym_id) prevents duplicates.
      //
      // Chain: from('favorite_gyms') → insert({ user_id, gym_id })
      const chainMock = {
        insert: jest.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gymService.addFavoriteGym("user-1", "gym-1");

      expect(supabase.from).toHaveBeenCalledWith("favorite_gyms");
      expect(chainMock.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        gym_id: "gym-1",
      });
      expect(result.error).toBeNull();
    });
  });

  // ── removeFavoriteGym ─────────────────────────────────────────

  describe("removeFavoriteGym", () => {
    it("deletes the row matching user_id and gym_id from favorite_gyms", async () => {
      // Removing a favorite deletes from the favorite_gyms join table.
      // DELETE is idempotent — if the row doesn't exist, count=0.
      //
      // Chain: from('favorite_gyms') → delete() → eq('user_id') → eq('gym_id')
      // The chain is: delete() → eq('user_id', ...) → eq('gym_id', ...).
      // First .eq() returns the chain (for further chaining), second .eq()
      // is the terminal that resolves the query.
      const eqMock = jest.fn();
      const chainMock = {
        delete: jest.fn().mockReturnValue({ eq: eqMock }),
      };
      // First .eq() returns { eq: eqMock } for chaining; second resolves.
      eqMock
        .mockReturnValueOnce({ eq: eqMock })
        .mockResolvedValueOnce({ data: null, error: null });

      supabase.from.mockReturnValueOnce(chainMock);

      const result = await gymService.removeFavoriteGym("user-1", "gym-1");

      expect(supabase.from).toHaveBeenCalledWith("favorite_gyms");
      expect(chainMock.delete).toHaveBeenCalledTimes(1);
      expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
      expect(eqMock).toHaveBeenCalledWith("gym_id", "gym-1");
    });
  });
});
