/**
 * Dashboard Service Tests (Step 15.1)
 *
 * Tests the thin Supabase wrappers that power the admin dashboard:
 *   - Active route count (status = 'active')
 *   - Retiring-soon route count (status = 'retiring_soon')
 *   - Total ascent count for the gym
 *   - Recent activity feed (ascents with route + climber info)
 *
 * Mock strategy: mock @/lib/supabase with chain mocks (same as
 * billing.service.test.ts). Each test verifies the correct PostgREST
 * query chain is built with the right arguments.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { dashboardService } from '../dashboard.service';

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>('@/lib/supabase');

describe('dashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getActiveRouteCount ───────────────────────────────────────────

  describe('getActiveRouteCount', () => {
    it('counts routes with active status for a gym', async () => {
      // The dashboard shows how many routes are currently climbable.
      // Uses head:true + count:'exact' for an efficient COUNT-only query.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      // The last .eq() in the chain resolves the promise
      chainMock.eq
        .mockReturnValueOnce(chainMock) // .eq('gym_id', ...)
        .mockResolvedValueOnce({ count: 12, data: null, error: null }); // .eq('status', 'active')

      supabase.from.mockReturnValueOnce(chainMock);

      const result = await dashboardService.getActiveRouteCount('gym-1');

      expect(supabase.from).toHaveBeenCalledWith('routes');
      expect(chainMock.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
      expect(chainMock.eq).toHaveBeenCalledWith('gym_id', 'gym-1');
      expect(chainMock.eq).toHaveBeenCalledWith('status', 'active');
      expect(result.count).toBe(12);
    });
  });

  // ── getRetiringRouteCount ─────────────────────────────────────────

  describe('getRetiringRouteCount', () => {
    it('counts routes with retiring_soon status for a gym', async () => {
      // "Retiring Soon" replaces the spec's "Sets in progress" since
      // no draft status exists. Shows routes about to be taken down.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      chainMock.eq
        .mockReturnValueOnce(chainMock)
        .mockResolvedValueOnce({ count: 3, data: null, error: null });

      supabase.from.mockReturnValueOnce(chainMock);

      const result = await dashboardService.getRetiringRouteCount('gym-2');

      expect(supabase.from).toHaveBeenCalledWith('routes');
      expect(chainMock.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
      expect(chainMock.eq).toHaveBeenCalledWith('gym_id', 'gym-2');
      expect(chainMock.eq).toHaveBeenCalledWith('status', 'retiring_soon');
      expect(result.count).toBe(3);
    });
  });

  // ── getTotalAscentCount ───────────────────────────────────────────

  describe('getTotalAscentCount', () => {
    it('counts all ascents for routes belonging to a gym', async () => {
      // Uses !inner join on routes to filter ascents by gym_id.
      // The count gives the dashboard a "Total Ascents" metric.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValueOnce({ count: 245, data: null, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await dashboardService.getTotalAscentCount('gym-3');

      expect(supabase.from).toHaveBeenCalledWith('route_ascents');
      expect(chainMock.select).toHaveBeenCalledWith(
        'id, route:routes!inner(gym_id)',
        { count: 'exact', head: true }
      );
      expect(chainMock.eq).toHaveBeenCalledWith('route.gym_id', 'gym-3');
      expect(result.count).toBe(245);
    });
  });

  // ── getRecentActivity ─────────────────────────────────────────────

  describe('getRecentActivity', () => {
    it('fetches recent ascents with route and climber info', async () => {
      // The activity feed shows who climbed what, with grade and status.
      // Joins routes (for name/grade) and profiles (for climber name).
      const mockActivity = [
        {
          id: 'asc-1',
          status: 'send',
          attempts: 2,
          created_at: '2026-02-18T10:00:00Z',
          route: { name: 'Crimpy Corner', gym_id: 'gym-4', canonical_grade: 12 },
          climber: { display_name: 'Alice' },
        },
      ];

      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce({ data: mockActivity, error: null }),
      };
      supabase.from.mockReturnValueOnce(chainMock);

      const result = await dashboardService.getRecentActivity('gym-4');

      expect(supabase.from).toHaveBeenCalledWith('route_ascents');
      expect(chainMock.select).toHaveBeenCalledWith(
        'id, status, attempts, created_at, route:routes!inner(name, gym_id, canonical_grade), climber:profiles!user_id(display_name)'
      );
      expect(chainMock.eq).toHaveBeenCalledWith('route.gym_id', 'gym-4');
      expect(chainMock.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chainMock.limit).toHaveBeenCalledWith(20);
      expect(result.data).toEqual(mockActivity);
    });
  });
});
