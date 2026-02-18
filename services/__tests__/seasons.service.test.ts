/**
 * Seasons Service Tests (Step 15.6)
 *
 * Tests the thin Supabase wrappers for season CRUD + route archival:
 *   - getSeasonsByGym: fetch all seasons for a gym, newest first
 *   - createSeason: INSERT a new season
 *   - closeSeason: UPDATE status to 'closed'
 *   - archiveGymRoutes: batch UPDATE active/retiring routes to archived
 *   - deleteSeason: DELETE by id
 *
 * Mock strategy: mock @/lib/supabase with chain mocks. Each test verifies
 * the correct PostgREST query chain is built with the right arguments.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { seasonsService } from '../seasons.service';

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>('@/lib/supabase');

describe('seasonsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getSeasonsByGym ─────────────────────────────────────────────────

  describe('getSeasonsByGym', () => {
    it('fetches seasons for a gym ordered by start_date descending', async () => {
      // The admin season management screen needs all seasons for the gym,
      // displayed newest-first so the current season appears at the top.
      const mockSeasons = [
        { id: 's1', name: 'Spring 2026', status: 'active' },
        { id: 's2', name: 'Winter 2025', status: 'closed' },
      ];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockSeasons,
          error: null,
        }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await seasonsService.getSeasonsByGym('gym-1');

      expect(supabase.from).toHaveBeenCalledWith('seasons');
      expect(chainMock.select).toHaveBeenCalledWith('*');
      expect(chainMock.eq).toHaveBeenCalledWith('gym_id', 'gym-1');
      expect(chainMock.order).toHaveBeenCalledWith('start_date', { ascending: false });
      expect(result.data).toEqual(mockSeasons);
    });
  });

  // ── createSeason ────────────────────────────────────────────────────

  describe('createSeason', () => {
    it('inserts a new season without RETURNING', async () => {
      // Gym admins create seasons to define time periods for route rotation.
      // No RETURNING clause to avoid the RLS SELECT gotcha (INSERT RETURNING
      // requires the new row to also pass SELECT policies).
      const chainMock = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await seasonsService.createSeason({
        gym_id: 'gym-1',
        name: 'Spring 2026',
        start_date: '2026-03-01',
        end_date: '2026-06-01',
      });

      expect(supabase.from).toHaveBeenCalledWith('seasons');
      expect(chainMock.insert).toHaveBeenCalledWith({
        gym_id: 'gym-1',
        name: 'Spring 2026',
        start_date: '2026-03-01',
        end_date: '2026-06-01',
      });
      expect(result.error).toBeNull();
    });
  });

  // ── closeSeason ─────────────────────────────────────────────────────

  describe('closeSeason', () => {
    it('updates season status to closed', async () => {
      // Closing a season marks it as ended. The companion archiveGymRoutes
      // call (made by the hook) batch-archives routes separately.
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await seasonsService.closeSeason('season-1');

      expect(supabase.from).toHaveBeenCalledWith('seasons');
      expect(chainMock.update).toHaveBeenCalledWith({ status: 'closed' });
      expect(chainMock.eq).toHaveBeenCalledWith('id', 'season-1');
      expect(result.error).toBeNull();
    });
  });

  // ── archiveGymRoutes ────────────────────────────────────────────────

  describe('archiveGymRoutes', () => {
    it('batch-archives active and retiring_soon routes for a gym', async () => {
      // When a season closes, all currently-climbable routes should be
      // archived. This uses .in() to match both 'active' and 'retiring_soon'
      // statuses, then sets them all to 'archived' in one query.
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await seasonsService.archiveGymRoutes('gym-1');

      expect(supabase.from).toHaveBeenCalledWith('routes');
      expect(chainMock.update).toHaveBeenCalledWith({ status: 'archived' });
      expect(chainMock.eq).toHaveBeenCalledWith('gym_id', 'gym-1');
      expect(chainMock.in).toHaveBeenCalledWith('status', ['active', 'retiring_soon']);
      expect(result.error).toBeNull();
    });
  });

  // ── deleteSeason ────────────────────────────────────────────────────

  describe('deleteSeason', () => {
    it('deletes a season by id', async () => {
      // Only gym admins can delete seasons per the RLS DELETE policy.
      // Typically used to remove incorrectly created seasons.
      const chainMock = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await seasonsService.deleteSeason('season-1');

      expect(supabase.from).toHaveBeenCalledWith('seasons');
      expect(chainMock.delete).toHaveBeenCalled();
      expect(chainMock.eq).toHaveBeenCalledWith('id', 'season-1');
      expect(result.error).toBeNull();
    });
  });
});
