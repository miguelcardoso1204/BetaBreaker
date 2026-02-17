/**
 * Trial Service — Promo Code Redemption & Trial Status
 *
 * Two methods for the trial/promo-code system:
 *   - getActiveTrial(userId) — checks if a user has an active or expired trial
 *   - redeemPromoCode(code)  — calls the redeem-promo Edge Function
 *
 * WHY A SEPARATE SERVICE (NOT IN purchaseService)?
 * Trials and IAP purchases are distinct flows with different backend paths:
 *   - IAP: react-native-iap → store → verify-iap Edge Function
 *   - Trial: user types code → redeem-promo Edge Function
 * Keeping them separate makes each service focused and easier to test.
 *
 * The service reads user_trials directly via Supabase client (RLS allows
 * SELECT on own rows) but writes go through the Edge Function (no INSERT
 * policy for authenticated users).
 */

import { supabase } from '@/lib/supabase';

export const trialService = {
  /**
   * Fetch the user's trial record (if any).
   *
   * Returns the full trial row (status, expires_at, etc.) or null if the
   * user has never started a trial. The useTrials hook uses this to compute
   * `isOnTrial` and `trialExpiresAt`.
   *
   * Uses .maybeSingle() because a user may or may not have a trial row.
   * UNIQUE(user_id) ensures at most one row exists per user.
   */
  async getActiveTrial(userId: string) {
    return supabase
      .from('user_trials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
  },

  /**
   * Redeem a promo code via the redeem-promo Edge Function.
   *
   * The Edge Function handles all validation (code exists, not exhausted,
   * user hasn't trialed before) and writes (trial record, usage counter,
   * tier upgrade). We just pass the code through.
   *
   * @param code - The promo code string entered by the user
   * @returns Edge Function response with { success, tier, trial_expires_at, duration_days }
   */
  async redeemPromoCode(code: string) {
    return supabase.functions.invoke('redeem-promo', {
      body: { code },
    });
  },
};
