/**
 * Billing Service Tests (Step 13.3)
 *
 * Tests for the thin Supabase wrappers that read gym billing records and
 * call the get_gym_active_user_count RPC. The service doesn't contain
 * business logic — it just builds PostgREST query chains. Tests verify
 * the correct chain is built with the right arguments.
 *
 * Mock strategy: mock @/lib/supabase (same as subscription.service.test.ts),
 * configure chain mocks per test to verify method call order and arguments.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { billingService } from '../billing.service';

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock; rpc: jest.Mock };
}>('@/lib/supabase');

describe('billingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getGymBillingHistory ───────────────────────────────────────────

  describe('getGymBillingHistory', () => {
    it('fetches billing records for a gym, ordered newest-first', async () => {
      // The admin billing dashboard shows a reverse-chronological list
      // of billing records so the most recent month is at the top.
      const mockRecords = [
        { id: 'rec-1', period_start: '2026-02-01', active_user_count: 10 },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({ data: mockRecords, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await billingService.getGymBillingHistory('gym-123');

      expect(supabase.from).toHaveBeenCalledWith('gym_billing_records');
      expect(chainMock.select).toHaveBeenCalledWith('*');
      expect(chainMock.eq).toHaveBeenCalledWith('gym_id', 'gym-123');
      expect(chainMock.order).toHaveBeenCalledWith('period_start', { ascending: false });
      expect(result.data).toEqual(mockRecords);
    });
  });

  // ── getCurrentMonthActiveUsers ─────────────────────────────────────

  describe('getCurrentMonthActiveUsers', () => {
    it('calls the RPC with correct date range parameters', async () => {
      // The service computes the first of the current month and today's
      // date, then passes them to the Postgres function that counts
      // distinct active users in that range.
      supabase.rpc.mockResolvedValueOnce({ data: 5, error: null });

      const result = await billingService.getCurrentMonthActiveUsers('gym-456');

      expect(supabase.rpc).toHaveBeenCalledWith('get_gym_active_user_count', {
        p_gym_id: 'gym-456',
        // We can't predict the exact dates since they depend on when the
        // test runs, but we can verify the parameter shape is correct.
        p_period_start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        p_period_end: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(result.data).toBe(5);
    });
  });

  // ── getLatestBillingRecord ─────────────────────────────────────────

  describe('getLatestBillingRecord', () => {
    it('fetches the most recent billing record for a gym', async () => {
      // Used by the dashboard widget to show the latest invoice summary.
      const mockRecord = {
        id: 'rec-latest',
        period_start: '2026-01-01',
        active_user_count: 8,
        total_due_eur: 4.00,
        status: 'pending',
      };

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValueOnce({ data: mockRecord, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await billingService.getLatestBillingRecord('gym-789');

      expect(supabase.from).toHaveBeenCalledWith('gym_billing_records');
      expect(chainMock.select).toHaveBeenCalledWith('*');
      expect(chainMock.eq).toHaveBeenCalledWith('gym_id', 'gym-789');
      expect(chainMock.order).toHaveBeenCalledWith('period_start', { ascending: false });
      expect(chainMock.limit).toHaveBeenCalledWith(1);
      expect(result.data).toEqual(mockRecord);
    });
  });
});
