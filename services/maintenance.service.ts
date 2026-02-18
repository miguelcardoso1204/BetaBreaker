/**
 * Maintenance Service — Thin Supabase Wrappers for Ticket CRUD (Step 15.5)
 *
 * Climbers report broken/spinning holds via maintenance tickets. Setters
 * and gym admins triage and resolve them. This service handles all DB
 * operations for the maintenance_tickets table.
 *
 * Five methods:
 *   1. getTicketsByGym — fetch all tickets for routes at a gym (admin queue)
 *   2. getTicketsByRoute — fetch tickets for a single route (route detail)
 *   3. createTicket — report a new issue on a route
 *   4. updateTicketStatus — change status (open → in_progress → resolved)
 *   5. deleteTicket — remove a ticket (gym admin only per RLS)
 *
 * DATA FLOW:
 *   Screen → useMaintenanceTickets hook → maintenanceService.getTicketsByGym
 *     → supabase.from('maintenance_tickets').select(...) → PostgREST → Postgres (RLS)
 *
 * FILTERING BY GYM:
 * maintenance_tickets doesn't have a direct gym_id column — the gym is
 * determined via the route FK. We use PostgREST's embedded filter syntax
 * (.eq('route.gym_id', gymId)) to filter on the joined route's gym_id.
 */

import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Input shape for creating a new maintenance ticket.
 * All fields use snake_case to match Postgres column names.
 */
export interface CreateTicketData {
  route_id: string;
  reporter_id: string;
  description: string;
}

// ── Service ──────────────────────────────────────────────────────────

export const maintenanceService = {
  /**
   * Fetch all maintenance tickets for routes at a specific gym.
   *
   * Joins route (for name, color, gym_id) and reporter profile (for
   * display_name). Filters via the route's gym_id using PostgREST
   * embedded filter syntax. Ordered newest-first for the admin queue.
   *
   * @param gymId - The gym whose route tickets to fetch
   */
  getTicketsByGym(gymId: string) {
    return supabase
      .from('maintenance_tickets')
      .select('*, route:routes!route_id(id, name, color, gym_id), reporter:profiles!reporter_id(id, display_name)')
      .eq('route.gym_id', gymId)
      .order('created_at', { ascending: false });
  },

  /**
   * Fetch maintenance tickets for a single route.
   *
   * Simpler than getTicketsByGym — no route join needed for filtering,
   * but still joins reporter profile for display_name.
   *
   * @param routeId - The route to fetch tickets for
   */
  getTicketsByRoute(routeId: string) {
    return supabase
      .from('maintenance_tickets')
      .select('*, reporter:profiles!reporter_id(id, display_name)')
      .eq('route_id', routeId)
      .order('created_at', { ascending: false });
  },

  /**
   * Create a new maintenance ticket (report a route issue).
   *
   * Any authenticated user can create tickets per the RLS INSERT policy,
   * as long as reporter_id matches auth.uid(). No RETURNING clause to
   * avoid the RLS SELECT gotcha.
   *
   * @param data - Ticket fields: route_id, reporter_id, description
   */
  createTicket(data: CreateTicketData) {
    return supabase
      .from('maintenance_tickets')
      .insert(data);
  },

  /**
   * Update a ticket's status (and resolution metadata when resolving).
   *
   * When status is 'resolved', also stamps resolved_by (the admin/setter
   * who fixed it) and resolved_at (current timestamp). For other statuses,
   * only the status field is updated.
   *
   * @param ticketId - The ticket UUID to update
   * @param status - New status value
   * @param resolvedBy - User UUID who resolved the ticket (only for 'resolved')
   */
  updateTicketStatus(ticketId: string, status: string, resolvedBy?: string) {
    // Build the update payload — only include resolution fields when resolving
    const updateData: Record<string, string> = { status };
    if (status === 'resolved' && resolvedBy) {
      updateData.resolved_by = resolvedBy;
      updateData.resolved_at = new Date().toISOString();
    }

    return supabase
      .from('maintenance_tickets')
      .update(updateData)
      .eq('id', ticketId);
  },

  /**
   * Delete a maintenance ticket by ID.
   *
   * Only gym admins can delete tickets per the RLS DELETE policy.
   * Used for cleanup/moderation of spam or duplicate reports.
   *
   * @param ticketId - The ticket UUID to delete
   */
  deleteTicket(ticketId: string) {
    return supabase
      .from('maintenance_tickets')
      .delete()
      .eq('id', ticketId);
  },
};
