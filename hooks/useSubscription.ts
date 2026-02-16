/**
 * useSubscription — Purchase and Restore IAP Subscriptions
 *
 * This hook provides two TanStack Query mutations:
 *   - `purchaseMutation` — triggers a new subscription purchase
 *   - `restoreMutation`  — restores purchases from a previous device/install
 *
 * Both follow the same pattern:
 *   1. Call purchaseService to interact with the store (App Store / Play Store)
 *   2. Send the receipt to the verify-iap Edge Function for server-side validation
 *   3. Call refreshProfile() to pick up the updated tier in local state
 *
 * WHY TanStack Query MUTATIONS?
 * Mutations give us built-in loading, success, and error states without
 * managing them manually. The Paywall component reads these states to
 * show spinners, success messages, or error alerts. Mutations also
 * automatically reset state between attempts.
 *
 * WHY refreshProfile() INSTEAD OF CACHE INVALIDATION?
 * useAuth doesn't use TanStack Query (it's event-driven via onAuthStateChange),
 * so there's no query cache to invalidate. Instead, we call refreshProfile()
 * which re-fetches the profile from Supabase and updates React state directly.
 */

import { useMutation } from "@tanstack/react-query";
import { purchaseService } from "@/services/purchase.service";
import { useAuth } from "@/hooks/useAuth";

export function useSubscription() {
  const { refreshProfile } = useAuth();

  /**
   * Purchase mutation — subscribes to a product and verifies the receipt.
   *
   * Flow:
   *   1. purchaseService.subscribe(productId) — opens the store purchase sheet
   *   2. purchaseService.verifyReceipt(purchase) — validates server-side
   *   3. refreshProfile() — picks up the new tier ('pro') from the database
   *
   * On failure at any step, the mutation enters the error state and the
   * Paywall shows an error message.
   */
  const purchaseMutation = useMutation({
    mutationFn: async (productId: string) => {
      // Step 1: Trigger the native purchase flow (App Store / Play Store sheet).
      // requestPurchase can return a single Purchase, an array, or null.
      // We normalize to a single purchase for verification.
      const result = await purchaseService.subscribe(productId);
      const purchase = Array.isArray(result) ? result[0] : result;

      if (!purchase) {
        throw new Error("Purchase was cancelled or returned no data");
      }

      // Step 2: Verify the receipt server-side via the Edge Function.
      // This is the critical security step — without it, users could
      // get pro access with forged receipts.
      await purchaseService.verifyReceipt(purchase);

      return purchase;
    },
    onSuccess: async () => {
      // Step 3: Re-fetch the profile to pick up the updated tier.
      // The verify-iap Edge Function has already set tier = 'pro' in the DB.
      await refreshProfile();
    },
  });

  /**
   * Restore mutation — restores previous purchases and re-verifies them.
   *
   * Used when a user reinstalls the app or switches devices. The store
   * returns all historical purchases, and we verify each one to ensure
   * the user gets their pro access back.
   *
   * Flow:
   *   1. purchaseService.restorePurchases() — queries the store for past purchases
   *   2. For each purchase: purchaseService.verifyReceipt() — validates server-side
   *   3. refreshProfile() — picks up the restored tier
   */
  const restoreMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Get all available purchases from the store
      const purchases = await purchaseService.restorePurchases();

      // Step 2: Verify each purchase server-side. In practice, there's
      // usually only one active subscription, but we verify all of them
      // to handle edge cases (e.g., user had multiple subscription periods).
      for (const purchase of purchases) {
        await purchaseService.verifyReceipt(purchase);
      }

      return purchases;
    },
    onSuccess: async () => {
      // Step 3: Re-fetch profile to pick up the restored tier
      await refreshProfile();
    },
  });

  return {
    purchaseMutation,
    restoreMutation,
  };
}
