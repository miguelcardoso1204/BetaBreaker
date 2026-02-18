/**
 * Audit Service Tests (Step 15.7)
 *
 * Tests the read-only Supabase wrapper for the audit_log table:
 *   - getAuditLog(gymId): fetch entries with actor profile join, newest-first
 *
 * The audit_log table is append-only — entries are created by the
 * on_route_update() SECURITY DEFINER trigger, not by the client.
 * This service only reads.
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

import { auditService } from '../audit.service';

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>('@/lib/supabase');

describe('auditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getAuditLog ───────────────────────────────────────────────────

  describe('getAuditLog', () => {
    it('fetches audit entries with actor profile join filtered by gym', async () => {
      // The admin audit log screen shows all changes at a gym, with
      // the actor's display_name so admins know who made each change.
      const mockEntries = [
        {
          id: 'a1',
          action: 'grade_change',
          target_type: 'route',
          target_id: 'route-1',
          old_value: { canonical_grade: 12 },
          new_value: { canonical_grade: 14 },
          actor: { id: 'user-1', display_name: 'Jane Setter' },
        },
      ];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
        }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await auditService.getAuditLog('gym-1');

      expect(supabase.from).toHaveBeenCalledWith('audit_log');
      // Joins profiles on actor_id for display_name (nullable — system actions have no actor)
      expect(chainMock.select).toHaveBeenCalledWith(
        '*, actor:profiles!actor_id(id, display_name)'
      );
      expect(chainMock.eq).toHaveBeenCalledWith('gym_id', 'gym-1');
      // Newest entries first so the most recent changes appear at the top
      expect(chainMock.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result.data).toEqual(mockEntries);
    });

    it('passes through Supabase errors', async () => {
      // When RLS blocks the query (non-admin user), the error should
      // bubble up unchanged for the hook/screen to handle.
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Permission denied'),
        }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await auditService.getAuditLog('gym-1');

      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });
  });
});
