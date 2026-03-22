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
    // `rpc` is used by getProfileStats, exportData, and deleteAccount
    // to call Postgres functions directly.
    rpc: jest.fn(),
  },
}));

import { profileService } from "../profile.service";

// Extract the mock so we can set up return values in each test.
const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock; rpc: jest.Mock };
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
      //   from('user_gym_roles') → select('role, gym_id') → eq('user_id', userId)
      // `.eq()` is the terminal call here — PostgREST returns an array.
      // Both role and gym_id are needed: role for permission checks, gym_id
      // so admin screens can scope queries to the user's administered gym.
      const mockRoles = [
        { role: "setter", gym_id: "gym-1" },
        { role: "gym_admin", gym_id: "gym-2" },
      ];

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
      // Select both role and gym_id — gym_id is needed for admin gym scoping
      expect(chainMock.select).toHaveBeenCalledWith("role, gym_id");
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-123");
      // Verify the array of role + gym_id objects is returned
      expect(result.data).toEqual(mockRoles);
      expect(result.error).toBeNull();
    });
  });

  // ── updateProfile ──────────────────────────────────────────────────

  describe("updateProfile", () => {
    it("updates profile fields using .update().eq()", async () => {
      // updateProfile sends a partial update to the profiles table.
      // Chain: from('profiles') → update(fields) → eq('id', userId)
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const fields = { display_name: "NewName", avatar_url: "https://example.com/new.png" };
      const result = await profileService.updateProfile("user-123", fields);

      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(chainMock.update).toHaveBeenCalledWith(fields);
      expect(chainMock.eq).toHaveBeenCalledWith("id", "user-123");
      expect(result.error).toBeNull();
    });

    it("passes through partial fields (single field update)", async () => {
      // Users might only update one field at a time (e.g., just the name).
      // The service should forward whatever subset of fields it receives.
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await profileService.updateProfile("user-123", { preferred_grade_system: "font" });

      expect(chainMock.update).toHaveBeenCalledWith({ preferred_grade_system: "font" });
    });
  });

  // ── getProfileStats ────────────────────────────────────────────────

  describe("getProfileStats", () => {
    it("calls get_profile_stats RPC with the user ID", async () => {
      // getProfileStats uses supabase.rpc() to call the Postgres function.
      // The RPC returns { total_sends, max_grade }.
      const mockStats = { total_sends: 42, max_grade: 20 };
      supabase.rpc.mockResolvedValueOnce({ data: mockStats, error: null });

      const result = await profileService.getProfileStats("user-123");

      expect(supabase.rpc).toHaveBeenCalledWith("get_profile_stats", {
        p_user_id: "user-123",
      });
      expect(result.data).toEqual(mockStats);
      expect(result.error).toBeNull();
    });

    it("passes through errors from the RPC", async () => {
      // If the RPC fails (e.g., network error), the error should propagate.
      const mockError = { message: "connection failed" };
      supabase.rpc.mockResolvedValueOnce({ data: null, error: mockError });

      const result = await profileService.getProfileStats("user-123");

      expect(result.error).toEqual(mockError);
    });
  });

  // ── exportData ─────────────────────────────────────────────────────

  describe("exportData", () => {
    it("calls export_user_data RPC with no arguments", async () => {
      // exportData calls the SECURITY DEFINER RPC which scopes to auth.uid().
      // No arguments needed — the function reads the JWT internally.
      const mockExport = { profile: {}, ascents: [], badges: [], streaks: null };
      supabase.rpc.mockResolvedValueOnce({ data: mockExport, error: null });

      const result = await profileService.exportData();

      expect(supabase.rpc).toHaveBeenCalledWith("export_user_data");
      expect(result.data).toEqual(mockExport);
    });
  });

  // ── deleteAccount ──────────────────────────────────────────────────

  describe("deleteAccount", () => {
    it("calls delete_own_account RPC with no arguments", async () => {
      // deleteAccount calls the SECURITY DEFINER RPC which deletes auth.uid().
      // No arguments — the function reads the JWT internally.
      supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await profileService.deleteAccount();

      expect(supabase.rpc).toHaveBeenCalledWith("delete_own_account");
      expect(result.error).toBeNull();
    });
  });
});
