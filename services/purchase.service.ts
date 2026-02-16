/**
 * Purchase Service — Abstraction Layer Over react-native-iap
 *
 * Wraps the react-native-iap library to provide a clean API for:
 *   - Initializing/closing the store connection
 *   - Fetching product details (price, title) for the Paywall
 *   - Triggering a subscription purchase
 *   - Restoring previous purchases (new device / reinstall)
 *   - Server-side receipt verification via the verify-iap Edge Function
 *
 * WHY WRAP react-native-iap?
 * 1. Testability — mocking a single service is easier than mocking the library
 * 2. Abstraction — if we ever switch IAP libraries, only this file changes
 * 3. Receipt verification — the library handles the store flow, but we need
 *    our own server-side validation step (the verify-iap Edge Function)
 *
 * STORE DETECTION:
 * `Platform.OS === 'ios'` → 'apple' store, otherwise → 'google' store.
 * This is passed to the verify-iap Edge Function so it knows which store
 * API to use for receipt validation.
 *
 * react-native-iap API (v15+):
 * - `fetchProducts({ skus })` replaces the old `getSubscriptions`
 * - `requestPurchase({ request, type })` replaces `requestSubscription`
 * - `getAvailablePurchases()` for restore
 * - Purchase objects use `purchaseToken` (not `transactionReceipt`)
 */

import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
} from 'react-native-iap';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { IAP_PRODUCT_IDS } from '@/lib/constants';

/**
 * Determines which app store we're on based on the platform.
 * iOS → 'apple', Android → 'google'.
 * Used when sending receipts to the verify-iap Edge Function.
 */
function getStore(): 'apple' | 'google' {
  return Platform.OS === 'ios' ? 'apple' : 'google';
}

export const purchaseService = {
  /**
   * Initialize the connection to the store's billing API.
   *
   * Must be called once when the app starts (e.g., in the root layout).
   * This sets up the native billing client and prepares it for purchases.
   * Without this, getProducts/subscribe will fail with a "not connected" error.
   */
  async init() {
    await initConnection();
  },

  /**
   * Close the billing connection and release resources.
   *
   * Call when the app is backgrounded or unmounting the root component.
   * Prevents memory leaks from the native billing client staying alive.
   */
  async cleanup() {
    await endConnection();
  },

  /**
   * Fetch subscription product details from the store.
   *
   * Returns an array of product objects with price, title, and description.
   * Used by the Paywall component to display the subscription offering
   * with the store-localized price (e.g., "$4.99" in USD, "€4.49" in EUR).
   *
   * react-native-iap v15+ uses `fetchProducts` (unified API) instead of
   * the old separate `getSubscriptions` method.
   */
  async getProducts() {
    return fetchProducts({
      skus: [IAP_PRODUCT_IDS.PRO_MONTHLY],
    });
  },

  /**
   * Start the native subscription purchase flow.
   *
   * This opens the App Store / Play Store purchase sheet. The user confirms
   * payment with Face ID / fingerprint / password. Returns a purchase object
   * with productId and purchaseToken on success.
   *
   * react-native-iap v15+ uses `requestPurchase` with a `type: 'subs'` field
   * and platform-specific request params. We build the request object based
   * on `Platform.OS` so the caller just passes a product ID.
   *
   * After calling this, the caller must call verifyReceipt() to validate
   * the purchase server-side and update the user's tier.
   *
   * @param productId - The store product ID to purchase
   */
  async subscribe(productId: string) {
    // Build platform-specific request params for requestPurchase.
    // Apple uses `productId`, Google uses `skus` array.
    const request =
      Platform.OS === 'ios'
        ? { apple: { sku: productId } }
        : { google: { skus: [productId] } };

    return requestPurchase({
      request,
      type: 'subs',
    });
  },

  /**
   * Restore previous purchases from the store.
   *
   * Used when a user reinstalls the app or switches devices. The store
   * returns all past purchases for this Apple ID / Google account.
   * Each returned purchase should be verified via verifyReceipt().
   */
  async restorePurchases() {
    return getAvailablePurchases();
  },

  /**
   * Verify a purchase receipt server-side via the verify-iap Edge Function.
   *
   * Why server-side verification?
   * Client-side receipt data can be forged. The Edge Function validates the
   * receipt with Apple/Google's servers and only then updates the user's
   * tier in the database. This is the critical security step that prevents
   * users from getting pro access without paying.
   *
   * react-native-iap v15+ uses `purchaseToken` instead of the old
   * `transactionReceipt` field. This is a unified field that contains:
   *   - iOS: JWS transaction data
   *   - Android: purchase token string
   *
   * @param purchase - The purchase object from subscribe() or restorePurchases()
   * @returns The Edge Function response with { success, tier, expires_at }
   */
  async verifyReceipt(purchase: {
    transactionId?: string | null;
    purchaseToken?: string | null;
    productId: string;
  }) {
    return supabase.functions.invoke('verify-iap', {
      body: {
        store: getStore(),
        receipt: purchase.purchaseToken ?? '',
        product_id: purchase.productId,
        transaction_id: purchase.transactionId ?? '',
      },
    });
  },
};
