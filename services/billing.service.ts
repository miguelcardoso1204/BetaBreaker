/**
 * Billing Service — Thin Supabase Wrappers for Gym Billing Data
 *
 * Provides read access to gym_billing_records and the
 * get_gym_active_user_count() RPC for the admin billing dashboard.
 *
 * Following the same thin-wrapper pattern as subscription.service.ts:
 * each method builds a PostgREST query chain and returns the raw
 * `{ data, error }` response. No business logic here — the hook
 * (useBilling) computes projected bills from the raw data.
 *
 * WHO CALLS THIS:
 *   - `useBilling` hook — used by the admin billing dashboard screen
 *
 * WHY NO WRITE METHODS?
 * Billing records are created exclusively by the Postgres function
 * generate_monthly_billing() running under SECURITY DEFINER (called by
 * pg_cron). No client-side writes are needed or allowed — RLS has no
 * INSERT/UPDATE/DELETE policies for authenticated users.
 */

import { supabase } from '@/lib/supabase';

export const billingService = {
  /**
   * Fetch the full billing history for a gym, newest period first.
   *
   * Used by the admin billing dashboard to show past invoices.
   * RLS ensures only gym_admin/super_admin can see their gym's records.
   *
   * @param gymId - The gym's UUID
   */
  getGymBillingHistory(gymId: string) {
    return supabase
      .from('gym_billing_records')
      .select('*')
      .eq('gym_id', gymId)
      .order('period_start', { ascending: false });
  },

  /**
   * Get the count of active users at a gym for the current month so far.
   *
   * Calls the get_gym_active_user_count() Postgres function via RPC.
   * The function counts distinct users who logged at least one ascent
   * at the gym's routes between period_start and period_end.
   *
   * Used by the admin dashboard to show a live "current month" projection
   * before the monthly billing run generates the official record.
   *
   * @param gymId - The gym's UUID
   */
  getCurrentMonthActiveUsers(gymId: string) {
    // Calculate the first day of the current month and today's date.
    // These define the half-open interval [firstOfMonth, today) for
    // the active user count query.
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const today = now.toISOString().split('T')[0];

    return supabase.rpc('get_gym_active_user_count', {
      p_gym_id: gymId,
      p_period_start: firstOfMonth,
      p_period_end: today,
    });
  },

  /**
   * Fetch the most recent billing record for a gym.
   *
   * Used by the dashboard widget to show the latest invoice amount
   * and status. Returns null if no billing records exist yet.
   *
   * @param gymId - The gym's UUID
   */
  getLatestBillingRecord(gymId: string) {
    return supabase
      .from('gym_billing_records')
      .select('*')
      .eq('gym_id', gymId)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();
  },
};
