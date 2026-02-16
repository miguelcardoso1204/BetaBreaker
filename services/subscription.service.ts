/**
 * Subscription Service — Thin Supabase Wrappers for Subscription Data
 *
 * Provides read access to subscription_events and the ability to update
 * a user's tier on the profiles table. These are called by:
 *
 *   - `useSubscription` hook — after purchase/restore to refresh state
 *   - Edge Functions (verify-iap, billing-webhook) — to update tier
 *     (Note: Edge Functions use their own service_role client, but the
 *     query patterns are identical)
 *
 * Following the same thin-wrapper pattern as profile.service.ts:
 * each method builds a PostgREST query chain and returns the raw
 * `{ data, error }` response. No business logic here — that lives
 * in the hooks and Edge Functions.
 */

import { supabase } from '@/lib/supabase';
import type { Tier } from '@/lib/constants';

export const subscriptionService = {
  /**
   * Fetch all subscription events for a user, newest first.
   *
   * Used by the subscription history screen to display the full
   * billing timeline (purchases, renewals, cancellations, etc.).
   *
   * @param userId - The user's profile ID
   */
  getEvents(userId: string) {
    return supabase
      .from('subscription_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
  },

  /**
   * Fetch the most recent "active" subscription event.
   *
   * An "active" event is one that grants pro access: purchase, renewal,
   * or restore. Cancellation and expiration events are excluded because
   * they don't confer access.
   *
   * Returns the single most recent active event via maybeSingle() —
   * null if the user has never subscribed.
   *
   * @param userId - The user's profile ID
   */
  getLatestActive(userId: string) {
    return supabase
      .from('subscription_events')
      .select('*')
      .eq('user_id', userId)
      .in('event_type', ['purchase', 'renewal', 'restore'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /**
   * Update the tier column on a user's profile.
   *
   * Called after receipt verification to flip the tier:
   *   - Purchase/renewal/restore → tier = 'pro'
   *   - Expiration → tier = 'free'
   *
   * @param userId - The user's profile ID
   * @param tier   - The new tier value ('free' or 'pro')
   */
  updateTier(userId: string, tier: Tier) {
    return supabase
      .from('profiles')
      .update({ tier })
      .eq('id', userId);
  },
};
