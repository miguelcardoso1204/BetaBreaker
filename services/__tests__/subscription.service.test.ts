/**
 * Subscription Service Tests (Step 13.1)
 *
 * Tests for the thin Supabase wrappers that read subscription events and
 * update the user's tier. The service doesn't contain business logic — it
 * just builds PostgREST query chains. Tests verify the correct chain is built.
 *
 * Mock strategy: mock @/lib/supabase (same as media.service.test.ts),
 * configure chain mocks per test to verify method call order and arguments.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { subscriptionService } from '../subscription.service';

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>('@/lib/supabase');

describe('subscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getEvents ───────────────────────────────────────────────────

  describe('getEvents', () => {
    it('fetches all subscription events for a user, ordered newest-first', async () => {
      // The subscription history screen shows all events in reverse
      // chronological order — newest purchase/renewal at the top.
      const mockEvents = [
        { id: 'evt-1', event_type: 'purchase', created_at: '2026-02-16T00:00:00Z' },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({ data: mockEvents, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await subscriptionService.getEvents('user-123');

      expect(supabase.from).toHaveBeenCalledWith('subscription_events');
      expect(chainMock.select).toHaveBeenCalledWith('*');
      expect(chainMock.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(chainMock.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result.data).toEqual(mockEvents);
    });
  });

  // ── getLatestActive ─────────────────────────────────────────────

  describe('getLatestActive', () => {
    it('fetches the latest active subscription event (purchase/renewal/restore)', async () => {
      // To determine if a user currently has an active subscription,
      // we look for the most recent purchase, renewal, or restore event.
      // Cancellation and expiration events don't grant access.
      const mockEvent = {
        id: 'evt-2',
        event_type: 'renewal',
        expires_at: '2026-03-16T00:00:00Z',
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({ data: mockEvent, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await subscriptionService.getLatestActive('user-123');

      expect(supabase.from).toHaveBeenCalledWith('subscription_events');
      expect(chainMock.select).toHaveBeenCalledWith('*');
      expect(chainMock.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(chainMock.in).toHaveBeenCalledWith('event_type', ['purchase', 'renewal', 'restore']);
      expect(chainMock.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chainMock.limit).toHaveBeenCalledWith(1);
      expect(result.data).toEqual(mockEvent);
    });
  });

  // ── updateTier ──────────────────────────────────────────────────

  describe('updateTier', () => {
    it('updates the user profile tier column', async () => {
      // After verifying a receipt, the Edge Function calls this to flip
      // the user's tier from 'free' to 'pro' (or vice versa on expiration).
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({ data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await subscriptionService.updateTier('user-123', 'pro');

      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(chainMock.update).toHaveBeenCalledWith({ tier: 'pro' });
      expect(chainMock.eq).toHaveBeenCalledWith('id', 'user-123');
      expect(result.error).toBeNull();
    });
  });
});
