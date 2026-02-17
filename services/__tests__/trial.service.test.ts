/**
 * Trial Service Tests (Step 13.2)
 *
 * Tests for the promo code redemption and trial status service.
 *
 * Mock strategy:
 * - `@/lib/supabase` is fully mocked — no real Supabase connection.
 *   The mock provides chainable query builder methods (.from/.select/.eq/.maybeSingle)
 *   and the functions.invoke method for Edge Function calls.
 *
 * Uses the same pattern as other service tests: jest.fn() in the mock factory,
 * then jest.requireMock to get typed references for assertions.
 */

// ── Mock Supabase client ─────────────────────────────────────────────
// Build a chainable mock that mirrors the Supabase query builder pattern:
// supabase.from('table').select('*').eq('col', val).maybeSingle()
jest.mock('@/lib/supabase', () => {
  const mockMaybeSingle = jest.fn();
  const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
  const mockSelect = jest.fn(() => ({ eq: mockEq }));
  const mockFrom = jest.fn(() => ({ select: mockSelect }));
  const mockInvoke = jest.fn();

  return {
    supabase: {
      from: mockFrom,
      functions: {
        invoke: mockInvoke,
      },
    },
    // Expose inner mocks for test assertions
    __mocks: { mockFrom, mockSelect, mockEq, mockMaybeSingle, mockInvoke },
  };
});

import { trialService } from '../trial.service';

// Get typed references to the mock functions for assertions
const { __mocks } = jest.requireMock<{
  __mocks: {
    mockFrom: jest.Mock;
    mockSelect: jest.Mock;
    mockEq: jest.Mock;
    mockMaybeSingle: jest.Mock;
    mockInvoke: jest.Mock;
  };
}>('@/lib/supabase');

const { mockFrom, mockSelect, mockEq, mockMaybeSingle, mockInvoke } = __mocks;

describe('trialService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getActiveTrial ─────────────────────────────────────────────────

  describe('getActiveTrial', () => {
    it('queries user_trials with the correct user ID', async () => {
      // Verify the query chain: from('user_trials').select('*').eq('user_id', id).maybeSingle()
      mockMaybeSingle.mockResolvedValueOnce({
        data: { user_id: 'user-123', status: 'active', expires_at: '2026-02-24' },
        error: null,
      });

      await trialService.getActiveTrial('user-123');

      expect(mockFrom).toHaveBeenCalledWith('user_trials');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockMaybeSingle).toHaveBeenCalled();
    });

    it('returns null data when user has no trial', async () => {
      // Users who have never redeemed a promo code have no user_trials row.
      // .maybeSingle() returns { data: null } instead of erroring.
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await trialService.getActiveTrial('user-no-trial');

      expect(result).toEqual({ data: null, error: null });
    });
  });

  // ── redeemPromoCode ────────────────────────────────────────────────

  describe('redeemPromoCode', () => {
    it('invokes the redeem-promo Edge Function with the code', async () => {
      // The Edge Function handles validation and DB writes.
      // We just pass the code through.
      mockInvoke.mockResolvedValueOnce({
        data: {
          success: true,
          tier: 'pro',
          trial_expires_at: '2026-02-24T00:00:00Z',
          duration_days: 7,
        },
        error: null,
      });

      const result = await trialService.redeemPromoCode('BETAFRIEND7');

      expect(mockInvoke).toHaveBeenCalledWith('redeem-promo', {
        body: { code: 'BETAFRIEND7' },
      });
      expect(result.data).toEqual({
        success: true,
        tier: 'pro',
        trial_expires_at: '2026-02-24T00:00:00Z',
        duration_days: 7,
      });
    });
  });
});
