/**
 * Maintenance Service Tests (Step 15.5)
 *
 * Tests the thin Supabase wrappers for maintenance ticket CRUD:
 *   - getTicketsByGym: fetch tickets joined with route + reporter, filtered by gym
 *   - getTicketsByRoute: fetch tickets for a single route
 *   - createTicket: INSERT a new maintenance ticket
 *   - updateTicketStatus: UPDATE status (+ resolved_by/resolved_at when resolved)
 *   - deleteTicket: DELETE by id
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

import { maintenanceService } from '../maintenance.service';

const { supabase } = jest.requireMock<{
  supabase: { from: jest.Mock };
}>('@/lib/supabase');

describe('maintenanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── getTicketsByGym ───────────────────────────────────────────────

  describe('getTicketsByGym', () => {
    it('fetches tickets with route + reporter joins filtered by gym', async () => {
      // The admin ticket queue needs tickets for all routes at a gym,
      // joined with route info (name, color) and reporter name.
      const mockTickets = [
        { id: 't1', description: 'Spinning hold', status: 'open' },
      ];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockTickets,
          error: null,
        }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await maintenanceService.getTicketsByGym('gym-1');

      expect(supabase.from).toHaveBeenCalledWith('maintenance_tickets');
      expect(chainMock.select).toHaveBeenCalledWith(
        '*, route:routes!route_id(id, name, color, gym_id), reporter:profiles!reporter_id(id, display_name)'
      );
      expect(chainMock.eq).toHaveBeenCalledWith('route.gym_id', 'gym-1');
      expect(chainMock.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result.data).toEqual(mockTickets);
    });

    it('passes through Supabase errors', async () => {
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('RLS blocked'),
        }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await maintenanceService.getTicketsByGym('gym-1');

      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });
  });

  // ── getTicketsByRoute ─────────────────────────────────────────────

  describe('getTicketsByRoute', () => {
    it('fetches tickets for a single route with reporter join', async () => {
      // Route detail page shows open tickets for the current route.
      const mockTickets = [
        { id: 't1', description: 'Loose hold on move 3', status: 'open' },
      ];
      const chainMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockTickets,
          error: null,
        }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await maintenanceService.getTicketsByRoute('route-1');

      expect(supabase.from).toHaveBeenCalledWith('maintenance_tickets');
      expect(chainMock.select).toHaveBeenCalledWith(
        '*, reporter:profiles!reporter_id(id, display_name)'
      );
      expect(chainMock.eq).toHaveBeenCalledWith('route_id', 'route-1');
      expect(chainMock.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result.data).toEqual(mockTickets);
    });
  });

  // ── createTicket ──────────────────────────────────────────────────

  describe('createTicket', () => {
    it('inserts a new maintenance ticket', async () => {
      // Any authenticated user can report a route issue. The reporter_id
      // must match auth.uid() per the RLS INSERT policy.
      const chainMock = {
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await maintenanceService.createTicket({
        route_id: 'route-1',
        reporter_id: 'user-1',
        description: 'Hold is spinning on move 4',
      });

      expect(supabase.from).toHaveBeenCalledWith('maintenance_tickets');
      expect(chainMock.insert).toHaveBeenCalledWith({
        route_id: 'route-1',
        reporter_id: 'user-1',
        description: 'Hold is spinning on move 4',
      });
      expect(result.error).toBeNull();
    });
  });

  // ── updateTicketStatus ────────────────────────────────────────────

  describe('updateTicketStatus', () => {
    it('updates ticket status without resolved fields for non-resolved status', async () => {
      // When moving to in_progress, we only set status — no resolved_by/at.
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await maintenanceService.updateTicketStatus(
        'ticket-1',
        'in_progress'
      );

      expect(supabase.from).toHaveBeenCalledWith('maintenance_tickets');
      expect(chainMock.update).toHaveBeenCalledWith({
        status: 'in_progress',
      });
      expect(chainMock.eq).toHaveBeenCalledWith('id', 'ticket-1');
      expect(result.error).toBeNull();
    });

    it('includes resolved_by and resolved_at when status is resolved', async () => {
      // When resolving, we stamp who resolved it and when. resolved_at
      // uses new Date().toISOString() — the service handles this so the
      // caller doesn't need to know about the timestamp format.
      const chainMock = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await maintenanceService.updateTicketStatus(
        'ticket-1',
        'resolved',
        'admin-1'
      );

      expect(chainMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved',
          resolved_by: 'admin-1',
          resolved_at: expect.any(String),
        })
      );
      expect(result.error).toBeNull();
    });
  });

  // ── deleteTicket ──────────────────────────────────────────────────

  describe('deleteTicket', () => {
    it('deletes a ticket by id', async () => {
      // Only gym admins can delete tickets per the RLS DELETE policy.
      const chainMock = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(chainMock);

      const result = await maintenanceService.deleteTicket('ticket-1');

      expect(supabase.from).toHaveBeenCalledWith('maintenance_tickets');
      expect(chainMock.delete).toHaveBeenCalled();
      expect(chainMock.eq).toHaveBeenCalledWith('id', 'ticket-1');
      expect(result.error).toBeNull();
    });
  });
});
