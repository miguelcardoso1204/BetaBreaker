/**
 * Calendar Service — Thin Supabase Wrappers for Setting Session CRUD
 *
 * Manages the setting_sessions table which tracks when route setters
 * are scheduled to work at a gym. Used by the admin calendar screen
 * (Step 15.3) for planning and workload tracking.
 *
 * Five methods:
 *   1. getSessionsByDateRange — calendar month view (sessions + setter names)
 *   2. createSession — schedule a setter on a date
 *   3. updateSession — change status (planned → completed/cancelled) or notes
 *   4. deleteSession — remove a session from the calendar
 *   5. getSetterWorkload — RPC for route count per setter (GROUP BY)
 *
 * WHY AN RPC FOR WORKLOAD?
 * PostgREST (Supabase's auto-generated REST API) doesn't support GROUP BY
 * queries natively. To get "routes per setter" we need a Postgres function
 * that the client calls via supabase.rpc(). The function groups routes by
 * setter_id and returns (setter_id, display_name, route_count) rows.
 */

import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Input shape for creating a new setting session.
 * All fields use snake_case to match the Postgres column names directly.
 */
export interface CreateSessionData {
  gym_id: string;
  setter_id: string;
  scheduled_date: string;
  notes?: string;
}

/**
 * Partial update shape for modifying an existing session.
 * Status transitions (planned → completed/cancelled) and notes are
 * the most common updates.
 */
export interface UpdateSessionData {
  status?: string;
  notes?: string;
  scheduled_date?: string;
  setter_id?: string;
}

// ── Service ──────────────────────────────────────────────────────────

export const calendarService = {
  /**
   * Fetch setting sessions for a gym within a date range.
   *
   * Joins profiles via the setter_id FK to include the setter's display
   * name in each result — the calendar needs to show "Alice is setting
   * on March 5th" not just a UUID.
   *
   * @param gymId - The gym to fetch sessions for
   * @param startDate - Start of date range (inclusive), e.g. '2026-03-01'
   * @param endDate - End of date range (inclusive), e.g. '2026-03-31'
   */
  getSessionsByDateRange(gymId: string, startDate: string, endDate: string) {
    return supabase
      .from('setting_sessions')
      .select('*, setter:profiles!setter_id(id, display_name)')
      .eq('gym_id', gymId)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true });
  },

  /**
   * Create a new setting session (schedule a setter on a date).
   *
   * No RETURNING clause — avoids the RLS gotcha where INSERT passes
   * but RETURNING fails if the caller's SELECT policy is restrictive.
   * The calendar refetches the session list after a successful create.
   *
   * @param data - Session fields: gym_id, setter_id, scheduled_date, notes?
   */
  createSession(data: CreateSessionData) {
    return supabase
      .from('setting_sessions')
      .insert(data);
  },

  /**
   * Update an existing setting session by ID.
   *
   * Typical updates: status change (planned → completed/cancelled),
   * notes edit, or reassigning to a different setter/date.
   *
   * @param id - The session UUID to update
   * @param data - Partial fields to update
   */
  updateSession(id: string, data: UpdateSessionData) {
    return supabase
      .from('setting_sessions')
      .update(data)
      .eq('id', id);
  },

  /**
   * Delete a setting session by ID.
   *
   * Used when an admin wants to completely remove a scheduled session
   * rather than just marking it cancelled.
   *
   * @param id - The session UUID to delete
   */
  deleteSession(id: string) {
    return supabase
      .from('setting_sessions')
      .delete()
      .eq('id', id);
  },

  /**
   * Get setter workload (route counts) for a gym within a date range.
   *
   * Calls the get_setter_workload Postgres function via RPC. Returns
   * one row per setter with their display_name and route_count, sorted
   * by route_count DESC (busiest setter first).
   *
   * @param gymId - The gym to check workload for
   * @param startDate - Start date for the range
   * @param endDate - End date for the range
   */
  getSetterWorkload(gymId: string, startDate: string, endDate: string) {
    return supabase.rpc('get_setter_workload', {
      p_gym_id: gymId,
      p_start_date: startDate,
      p_end_date: endDate,
    });
  },
};
