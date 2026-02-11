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

  // ── getNotifications ──────────────────────────────────────────────

  describe("getNotifications", () => {
    it("fetches notifications ordered by created_at desc with limit 50", async () => {
      // The notification center loads a paginated list of the user's
      // notifications, newest first. RLS ensures users only see their own.
      const mockNotifications = [
        {
          id: "notif-1",
          user_id: "user-1",
          type: "badge_earned",
          title: "New Badge!",
          body: "You earned First Flash",
          data: {},
          read: false,
          created_at: "2026-02-11T12:00:00Z",
        },
      ];

      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValueOnce({ data: mockNotifications, error: null }),
      };
      supabase.from.mockReturnValueOnce(chain);

      const result = await notificationsService.getNotifications("user-1");

      expect(supabase.from).toHaveBeenCalledWith("notifications");
      expect(chain.select).toHaveBeenCalledWith("*");
      expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(chain.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(result.data).toEqual(mockNotifications);
    });

    it("returns empty array when no notifications exist", async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValueOnce({ data: [], error: null }),
      };
      supabase.from.mockReturnValueOnce(chain);

      const result = await notificationsService.getNotifications("user-1");

      expect(result.data).toEqual([]);
    });
  });

  // ── getUnreadCount ────────────────────────────────────────────────

  describe("getUnreadCount", () => {
    it("uses head:true and count:'exact' for efficient counting", async () => {
      // Instead of fetching all unread rows, we ask Postgres for just
      // the count header — no row data transferred. This is the most
      // efficient way to get a count for the notification badge.
      const secondEq = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null, count: 5 });
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockReturnValueOnce({ eq: secondEq }),
      };
      supabase.from.mockReturnValueOnce(chain);

      const result = await notificationsService.getUnreadCount("user-1");

      expect(supabase.from).toHaveBeenCalledWith("notifications");
      expect(chain.select).toHaveBeenCalledWith("*", {
        count: "exact",
        head: true,
      });
      expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(secondEq).toHaveBeenCalledWith("read", false);
      expect(result.count).toBe(5);
    });

    it("returns count of 0 when all notifications are read", async () => {
      const secondEq = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null, count: 0 });
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockReturnValueOnce({ eq: secondEq }),
      };
      supabase.from.mockReturnValueOnce(chain);

      const result = await notificationsService.getUnreadCount("user-1");

      expect(result.count).toBe(0);
    });
  });

  // ── markAsRead ────────────────────────────────────────────────────

  describe("markAsRead", () => {
    it("updates a single notification's read flag to true", async () => {
      // When a user taps a notification in the list, we mark just that
      // one as read. Filtering by both id and user_id adds a safety
      // layer — RLS enforces ownership, but the explicit filter makes
      // the intent clear and would catch bugs if RLS were misconfigured.
      const secondEq = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chain = {
        update: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockReturnValueOnce({ eq: secondEq }),
      };
      supabase.from.mockReturnValueOnce(chain);

      await notificationsService.markAsRead("notif-1", "user-1");

      expect(supabase.from).toHaveBeenCalledWith("notifications");
      expect(chain.update).toHaveBeenCalledWith({ read: true });
      expect(chain.eq).toHaveBeenCalledWith("id", "notif-1");
      expect(secondEq).toHaveBeenCalledWith("user_id", "user-1");
    });
  });

  // ── markAllAsRead ─────────────────────────────────────────────────

  describe("markAllAsRead", () => {
    it("updates all unread notifications for the user", async () => {
      // The "Mark all read" button in the notification center header.
      // Only targets unread rows (read = false) to avoid unnecessary
      // writes on already-read notifications.
      const secondEq = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });
      const chain = {
        update: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockReturnValueOnce({ eq: secondEq }),
      };
      supabase.from.mockReturnValueOnce(chain);

      await notificationsService.markAllAsRead("user-1");

      expect(supabase.from).toHaveBeenCalledWith("notifications");
      expect(chain.update).toHaveBeenCalledWith({ read: true });
      expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(secondEq).toHaveBeenCalledWith("read", false);
    });
  });

  // ── getPreferences ────────────────────────────────────────────────

  describe("getPreferences", () => {
    it("fetches all notification preferences for a user", async () => {
      // The preferences screen needs all categories to show toggle state.
      // Missing rows mean "enabled" (opt-out model), so we only store
      // explicit preferences.
      const mockPrefs = [
        {
          id: "pref-1",
          user_id: "user-1",
          category: "friends",
          enabled: false,
          created_at: "2026-02-11T00:00:00Z",
        },
      ];

      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockResolvedValueOnce({ data: mockPrefs, error: null }),
      };
      supabase.from.mockReturnValueOnce(chain);

      const result = await notificationsService.getPreferences("user-1");

      expect(supabase.from).toHaveBeenCalledWith("notification_preferences");
      expect(chain.select).toHaveBeenCalledWith("*");
      expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(result.data).toEqual(mockPrefs);
    });

    it("returns empty array when user has no explicit preferences", async () => {
      // New users default to all notifications enabled — no rows needed.
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest
          .fn()
          .mockResolvedValueOnce({ data: [], error: null }),
      };
      supabase.from.mockReturnValueOnce(chain);

      const result = await notificationsService.getPreferences("user-1");

      expect(result.data).toEqual([]);
    });
  });

  // ── updatePreference ──────────────────────────────────────────────

  describe("updatePreference", () => {
    it("upserts a preference with onConflict for idempotent toggling", async () => {
      // When a user toggles a notification category, we upsert so the
      // first toggle creates the row and subsequent toggles update it.
      // The UNIQUE(user_id, category) constraint makes this safe.
      const chain = {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chain);

      await notificationsService.updatePreference(
        "user-1",
        "friends",
        false
      );

      expect(supabase.from).toHaveBeenCalledWith("notification_preferences");
      expect(chain.upsert).toHaveBeenCalledWith(
        { user_id: "user-1", category: "friends", enabled: false },
        { onConflict: "user_id,category" }
      );
    });

    it("can re-enable a previously disabled category", async () => {
      const chain = {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chain);

      await notificationsService.updatePreference(
        "user-1",
        "achievements",
        true
      );

      expect(chain.upsert).toHaveBeenCalledWith(
        { user_id: "user-1", category: "achievements", enabled: true },
        { onConflict: "user_id,category" }
      );
    });
  });
});
