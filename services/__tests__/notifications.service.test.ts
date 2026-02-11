/**
 * Notifications Service Tests
 *
 * Tests the notificationsService methods that manage push token registration —
 * the system for persisting Expo push tokens so the backend can send push
 * notifications to specific devices.
 *
 * DATA MODEL:
 *   push_tokens: { id, user_id, token, platform, created_at }
 *   UNIQUE(user_id, token) — prevents duplicate registrations
 *
 * KEY DESIGN DECISIONS:
 *   - registerPushToken does NOT use RETURNING — same RLS + INSERT RETURNING
 *     lesson as moderation service (see MEMORY.md). The SELECT policy restricts
 *     to own tokens, and while INSERT + RETURNING would work for the owner, we
 *     keep the pattern consistent across all services.
 *   - The UNIQUE constraint means re-registering the same token on app launch
 *     is harmless — Supabase returns a conflict error that the caller ignores.
 *   - unregisterPushToken filters by both user_id AND token to ensure users
 *     can only delete their own tokens (reinforced by RLS DELETE policy).
 *
 * Mock strategy: same as moderation.service.test.ts — mock @/lib/supabase
 * inside the jest.mock() factory, then configure chain mocks per test.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { notificationsService } from "../notifications.service";

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>("@/lib/supabase");

describe("notificationsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── registerPushToken ─────────────────────────────────────────────

  describe("registerPushToken", () => {
    it("inserts with user_id, token, and platform", async () => {
      // On app launch, after getting notification permissions and an Expo
      // push token, we persist it so the backend can target this device.
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await notificationsService.registerPushToken(
        "user-1",
        "ExponentPushToken[abc123]",
        "ios"
      );

      expect(supabase.from).toHaveBeenCalledWith("push_tokens");
      expect(chainMock.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        token: "ExponentPushToken[abc123]",
        platform: "ios",
      });
    });

    it("does not use RETURNING (no .select() or .single() chain)", async () => {
      // Per the RLS + INSERT RETURNING lesson: we avoid chaining .select()
      // after .insert() to keep behavior consistent and avoid potential
      // policy mismatches. The insert terminates at .insert().
      const chainMock = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await notificationsService.registerPushToken(
        "user-1",
        "ExponentPushToken[xyz789]",
        "android"
      );

      // insert() should be called but select/single should NOT be chained
      expect(chainMock.insert).toHaveBeenCalledTimes(1);
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });
  });

  // ── unregisterPushToken ───────────────────────────────────────────

  describe("unregisterPushToken", () => {
    it("deletes by user_id and token", async () => {
      // On logout or device removal, we delete the specific token.
      // Filtering by both user_id and token ensures we only remove one
      // device's token (a user might have multiple devices registered).
      const secondEq = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const firstEq = jest.fn().mockReturnValueOnce({ eq: secondEq });
      const chainMock = {
        delete: jest.fn().mockReturnValueOnce({ eq: firstEq }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      await notificationsService.unregisterPushToken(
        "user-1",
        "ExponentPushToken[abc123]"
      );

      expect(supabase.from).toHaveBeenCalledWith("push_tokens");
      expect(chainMock.delete).toHaveBeenCalled();
      expect(firstEq).toHaveBeenCalledWith("user_id", "user-1");
      expect(secondEq).toHaveBeenCalledWith(
        "token",
        "ExponentPushToken[abc123]"
      );
    });
  });

  // ── getPushTokens ─────────────────────────────────────────────────

  describe("getPushTokens", () => {
    it("selects all tokens for a given user", async () => {
      // Used in settings/debug to show which devices are registered for
      // push notifications. RLS ensures users only see their own tokens.
      const mockTokens = [
        {
          id: "tok-1",
          user_id: "user-1",
          token: "ExponentPushToken[abc123]",
          platform: "ios",
          created_at: "2026-02-11T00:00:00Z",
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({
          data: mockTokens,
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await notificationsService.getPushTokens("user-1");

      expect(supabase.from).toHaveBeenCalledWith("push_tokens");
      expect(chainMock.select).toHaveBeenCalledWith("*");
      expect(chainMock.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(result.data).toEqual(mockTokens);
    });
  });
});
