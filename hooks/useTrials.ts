/**
 * useTrials — Trial Status & Promo Code Redemption Hook
 *
 * Provides two TanStack Query operations:
 *   - `trialQuery`     — fetches the user's trial record (if any)
 *   - `redeemMutation`  — redeems a promo code via the Edge Function
 *
 * Plus computed values:
 *   - `isOnTrial`       — true if user has an active, non-expired trial
 *   - `trialExpiresAt`  — the trial expiration date, or null
 *
 * WHY TanStack Query?
 * The trial record is server state — it lives in the database and can
 * change independently (e.g., the cron job expires it overnight). useQuery
 * handles caching, background refetching, and stale data management.
 *
 * WHY refreshProfile() ON SUCCESS?
 * The redeem-promo Edge Function updates profiles.tier = 'pro' in the DB.
 * useAuth doesn't use TanStack Query, so we call refreshProfile() to
 * re-read the profile and update the local tier state (same pattern as
 * useSubscription after IAP purchase).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trialService } from "@/services/trial.service";
import { useAuth } from "@/hooks/useAuth";

export function useTrials() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  /**
   * Query the user's trial record from user_trials.
   *
   * Only runs when a user is logged in (enabled: !!user?.id).
   * Returns { data: trialRow | null } — null means no trial.
   */
  const trialQuery = useQuery({
    queryKey: ["trial", user?.id],
    queryFn: async () => {
      const { data, error } = await trialService.getActiveTrial(user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  /**
   * Mutation to redeem a promo code.
   *
   * On success:
   *   1. refreshProfile() — picks up the new tier ('pro') from the database
   *   2. Invalidate trial query — so the UI shows the new trial record
   *
   * On error: mutation enters error state, PromoCodeInput shows the message.
   */
  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await trialService.redeemPromoCode(code);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      // Re-fetch profile to pick up tier = 'pro'
      await refreshProfile();
      // Invalidate trial query so it refetches the new trial record
      queryClient.invalidateQueries({ queryKey: ["trial"] });
    },
  });

  // ── Computed values ─────────────────────────────────────────────────

  /** True if the user has an active trial that hasn't expired yet. */
  const isOnTrial =
    trialQuery.data?.status === "active" &&
    new Date(trialQuery.data.expires_at) > new Date();

  /** The trial expiration date, or null if no active trial. */
  const trialExpiresAt = trialQuery.data?.expires_at
    ? new Date(trialQuery.data.expires_at)
    : null;

  return {
    trialQuery,
    redeemMutation,
    isOnTrial,
    trialExpiresAt,
  };
}
