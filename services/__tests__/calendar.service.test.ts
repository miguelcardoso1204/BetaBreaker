/**
 * Calendar Service Tests (Step 15.3)
 *
 * Tests the thin Supabase wrappers for the setting sessions calendar:
 *   - getSessionsByDateRange: fetch sessions with setter join + date range
 *   - createSession: INSERT into setting_sessions
 *   - updateSession: UPDATE by id
 *   - deleteSession: DELETE by id
 *   - getSetterWorkload: RPC call to get_setter_workload
 *
 * Mock strategy: mock @/lib/supabase with chain mocks. Each test verifies
 * the correct PostgREST query chain is built with the right arguments.
 */

// ── Mock Setup ──────────────────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { calendarService } from '../calendar.service';

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock; rpc: jest.Mock };
}>('@/lib/supabase');

describe('calendarService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getSessionsByDateRange ───────────────────────────────────────

  describe('getSessionsByDateRange', () => {
    it('fetches sessions with setter join filtered by gym and date range', async () => {
      // The calendar screen needs sessions for a single month, joined with
      // the setter's profile to show their display name.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [{ id: 's1', status: 'planned' }],
          error: null,
        }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await calendarService.getSessionsByDateRange(
        'gym-1',
        '2026-03-01',
        '2026-03-31'
      );

      expect(supabase.from).toHaveBeenCalledWith('setting_sessions');
      expect(chainMock.select).toHaveBeenCalledWith(
        '*, setter:profiles!setter_id(id, display_name)'
      );
      expect(chainMock.eq).toHaveBeenCalledWith('gym_id', 'gym-1');
      expect(chainMock.gte).toHaveBeenCalledWith('scheduled_date', '2026-03-01');
      expect(chainMock.lte).toHaveBeenCalledWith('scheduled_date', '2026-03-31');
      expect(chainMock.order).toHaveBeenCalledWith('scheduled_date', { ascending: true });
      expect(result.data).toEqual([{ id: 's1', status: 'planned' }]);
    });
  });

  // ── createSession ────────────────────────────────────────────────

  describe('createSession', () => {
    it('inserts a new setting session', async () => {
      // No RETURNING — avoids the RLS SELECT gotcha where INSERT passes
      // but RETURNING fails if the user can't SELECT the new row.
      const chainMock = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await calendarService.createSession({
        gym_id: 'gym-1',
        setter_id: 'setter-1',
        scheduled_date: '2026-04-01',
        notes: 'Set lead wall',
      });

      expect(supabase.from).toHaveBeenCalledWith('setting_sessions');
      expect(chainMock.insert).toHaveBeenCalledWith({
        gym_id: 'gym-1',
        setter_id: 'setter-1',
        scheduled_date: '2026-04-01',
        notes: 'Set lead wall',
      });
      expect(result.error).toBeNull();
    });
  });

  // ── updateSession ────────────────────────────────────────────────

  describe('updateSession', () => {
    it('updates a session by id', async () => {
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await calendarService.updateSession('session-1', {
        status: 'completed',
        notes: 'Done',
      });

      expect(supabase.from).toHaveBeenCalledWith('setting_sessions');
      expect(chainMock.update).toHaveBeenCalledWith({
        status: 'completed',
        notes: 'Done',
      });
      expect(chainMock.eq).toHaveBeenCalledWith('id', 'session-1');
      expect(result.error).toBeNull();
    });
  });

  // ── deleteSession ────────────────────────────────────────────────

  describe('deleteSession', () => {
    it('deletes a session by id', async () => {
      const chainMock = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await calendarService.deleteSession('session-1');

      expect(supabase.from).toHaveBeenCalledWith('setting_sessions');
      expect(chainMock.delete).toHaveBeenCalled();
      expect(chainMock.eq).toHaveBeenCalledWith('id', 'session-1');
      expect(result.error).toBeNull();
    });
  });

  // ── getSetterWorkload ────────────────────────────────────────────

  describe('getSetterWorkload', () => {
    it('calls get_setter_workload RPC with correct params', async () => {
      // The workload summary shows how many routes each setter created
      // in a date range. This is an RPC because PostgREST can't do GROUP BY.
      supabase.rpc.mockResolvedValue({
        data: [{ setter_id: 's1', display_name: 'Alice', route_count: 5 }],
        error: null,
      });

      const result = await calendarService.getSetterWorkload(
        'gym-1',
        '2026-03-01',
        '2026-03-31'
      );

      expect(supabase.rpc).toHaveBeenCalledWith('get_setter_workload', {
        p_gym_id: 'gym-1',
        p_start_date: '2026-03-01',
        p_end_date: '2026-03-31',
      });
      expect(result.data).toEqual([
        { setter_id: 's1', display_name: 'Alice', route_count: 5 },
      ]);
    });
  });
});
