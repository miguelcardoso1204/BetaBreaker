/**
 * Audit Service — Read-only Supabase Wrapper for Audit Log (Step 15.7)
 *
 * The audit_log table is append-only. Entries are created automatically by
 * the on_route_update() SECURITY DEFINER trigger when a route's grade,
 * status, color, or wall_section changes. This service only reads.
 *
 * Single method:
 *   getAuditLog(gymId) — fetch all entries for a gym, newest-first
 *
 * DATA FLOW:
 *   Screen → useAuditLog hook → auditService.getAuditLog
 *     → supabase.from('audit_log').select(...) → PostgREST → Postgres (RLS)
 *
 * RLS: Only gym_admin+ can SELECT audit_log entries for their gym.
 */

import { supabase } from '@/lib/supabase';

export const auditService = {
  /**
   * Fetch all audit log entries for a gym, with actor profile joined.
   *
   * Joins profiles on actor_id for display_name. actor_id can be NULL
   * (system actions like automated triggers), so the join uses a left
   * join implicitly — PostgREST returns null for the actor object.
   *
   * Ordered newest-first so recent changes appear at the top.
   *
   * @param gymId - The gym whose audit entries to fetch
   */
  getAuditLog(gymId: string) {
    return supabase
      .from('audit_log')
      .select('*, actor:profiles!actor_id(id, display_name)')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false });
  },
};
