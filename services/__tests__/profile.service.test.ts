/**
 * Profile Service Tests
 *
 * These tests verify that profileService methods correctly build Supabase
 * PostgREST queries. Like auth.service.test.ts, we mock `@/lib/supabase`
 * so tests run without a real database.
 *
 * The profile service fetches user profile data and gym roles — both needed
 * by the useAuth hook to build the full auth state (user info + permissions).
 *
 * Mock strategy: Each Supabase query is a method chain like
 *   `supabase.from('profiles').select('*').eq('id', userId).single()`
 * We mock `from()` to return an object whose methods return `this` (for
 * chaining), with the terminal method resolving to the expected data.
 */

jest.mock("@/lib/supabase", () => ({
  supabase: {
    // `from` is a jest.fn() so we can configure it per-test to return
    // different chain mocks depending on which table is being queried.
    from: jest.fn(),
  },
}));

import { profileService } from "../profile.service";

// Extract the mock so we can set up return values in each test.
const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("profileService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getById ────────────────────────────────────────────────────────

  describe("getById", () => {
    it("fetches a profile by user ID using .select().eq().single()", async () => {
      // Simulate a successful profile lookup. The chain is:
      //   from('profiles') → select('*') → eq('id', userId) → single()
      // `.single()` is the terminal call that returns { data, error }.
      const mockProfile = {
        id: "user-123",
        display_name: "TestClimber",
        avatar_url: null,
        preferred_grade_system: "v-scale",
        home_gym_id: null,
        onboarding_completed: false,
        tier: "free",
        created_at: "2026-01-01T00:00:00Z",
      };

      // Build the chain mock: each method returns `this` so calls can be
      // chained, and `.single()` is the async terminal that resolves data.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: mockProfile,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await profileService.getById("user-123");

      // Verify the correct table and chain were called
      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenCalledWith("id", "user-123");
      expect(chainMock.single).toHaveBeenCalledTimes(1);
      // Verify data flows through untransformed
      expect(result.data).toEqual(mockProfile);
      expect(result.error).toBeNull();
    });
  });

  // ── getRoles ───────────────────────────────────────────────────────

  describe("getRoles", () => {
    it("fetches all gym roles for a user using .select().eq() (no .single())", async () => {
      // getRoles returns multiple rows (one per gym assignment), so it
      // does NOT use `.single()`. The chain is:
      //   from('user_gym_roles') → select('role') → eq('user_id', userId)
      // `.eq()` is the terminal call here — PostgREST returns an array.
      const mockRoles = [{ role: "setter" }, { role: "gym_admin" }];

      // Unlike getById, there's no `.single()` at the end. The `.eq()`
      // call is terminal — it returns the Promise with { data, error }.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          data: mockRoles,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await profileService.getRoles("user-123");

      // Verify the correct table and columns are queried
      expect(supabase.from).toHaveBeenCalledWith("user_gym_roles");
      // Only select the 'role' column — we don't need gym_id or timestamps here
      expect(chainMock.select).toHaveBeenCalledWith("role");
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-123");
      // Verify the array of roles is returned
      expect(result.data).toEqual(mockRoles);
      expect(result.error).toBeNull();
    });
  });
});
