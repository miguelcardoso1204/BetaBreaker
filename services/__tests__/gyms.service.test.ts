/**
 * Gym Service Tests
 *
 * These tests verify that gymService methods correctly build Supabase
 * PostgREST query chains for fetching and managing gyms. We mock
 * `@/lib/supabase` so tests run without a real database.
 *
 * Gyms are the organizational unit in Beta Breaker — climbers set a
 * "home gym" and browse routes within it. The service needs to support:
 *   - Listing all gyms (for the gym directory / picker screens)
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
