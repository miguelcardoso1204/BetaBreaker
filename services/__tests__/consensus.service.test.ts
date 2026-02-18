/**
 * Consensus Service Tests (Step 15.4)
 *
 * Tests the thin Supabase RPC wrappers for grade consensus:
 *   - getRoutesGradeConsensus: calls get_routes_grade_consensus RPC
 *   - getGradeSubmissions: calls get_grade_submissions RPC
 *
 * Mock strategy: mock @/lib/supabase with supabase.rpc as jest.fn().
 * Each test verifies the correct RPC name and parameters are passed.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

import { consensusService } from '../consensus.service';

const { supabase } = jest.requireMock<{
  supabase: { rpc: jest.Mock };
}>('@/lib/supabase');

describe('consensusService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getRoutesGradeConsensus ──────────────────────────────────────

  describe('getRoutesGradeConsensus', () => {
    it('calls get_routes_grade_consensus RPC with gym id', async () => {
      // The RPC returns routes with computed consensus fields (divergence,
      // submission_count) in a single round-trip — PostgREST can't do GROUP BY.
      const mockData = [
        { route_id: 'r1', name: 'Alpha', divergence: 3 },
      ];
      supabase.rpc.mockResolvedValue({ data: mockData, error: null });

      const result = await consensusService.getRoutesGradeConsensus('gym-1');

      expect(supabase.rpc).toHaveBeenCalledWith('get_routes_grade_consensus', {
        p_gym_id: 'gym-1',
      });
      expect(result.data).toEqual(mockData);
    });

    it('passes through Supabase errors', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: new Error('DB error'),
      });

      const result = await consensusService.getRoutesGradeConsensus('gym-1');

      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });
  });

  // ── getGradeSubmissions ──────────────────────────────────────────

  describe('getGradeSubmissions', () => {
    it('calls get_grade_submissions RPC with route id', async () => {
      // Returns the distribution of perceived_grade votes for drill-down view.
      const mockData = [
        { perceived_grade: 14, submission_count: 3 },
        { perceived_grade: 16, submission_count: 2 },
      ];
      supabase.rpc.mockResolvedValue({ data: mockData, error: null });

      const result = await consensusService.getGradeSubmissions('route-1');

      expect(supabase.rpc).toHaveBeenCalledWith('get_grade_submissions', {
        p_route_id: 'route-1',
      });
      expect(result.data).toEqual(mockData);
    });

    it('passes through Supabase errors', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: new Error('Not found'),
      });

      const result = await consensusService.getGradeSubmissions('route-1');

      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });
  });
});
