/**
 * Purchase Service Tests (Step 13.1)
 *
 * Tests for the react-native-iap abstraction layer. The purchase service
 * wraps the IAP library's APIs and adds receipt verification via the
 * verify-iap Edge Function.
 *
 * Mock strategy:
 * - `react-native-iap` is fully mocked — no real store connections
 * - `@/lib/supabase` is mocked for the Edge Function invoke call
 * - `react-native` is mocked to provide Platform.OS for store detection
 *
 * react-native-iap v15+ API:
 * - `fetchProducts({ skus })` — replaces old `getSubscriptions`
 * - `requestPurchase({ request, type })` — replaces old `requestSubscription`
 * - `getAvailablePurchases()` — restore previous purchases
 * - Purchase objects use `purchaseToken` instead of `transactionReceipt`
 */

// ── Mock react-native-iap ───────────────────────────────────────────
jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(),
  endConnection: jest.fn(),
  fetchProducts: jest.fn(),
  requestPurchase: jest.fn(),
  getAvailablePurchases: jest.fn(),
}));

// ── Mock Supabase client (for Edge Function invocation) ─────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

// ── Mock Platform.OS ────────────────────────────────────────────────
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { purchaseService } from '../purchase.service';

const iap = jest.requireMock<{
  initConnection: jest.Mock;
  endConnection: jest.Mock;
  fetchProducts: jest.Mock;
  requestPurchase: jest.Mock;
  getAvailablePurchases: jest.Mock;
}>('react-native-iap');

const { supabase } = jest.requireMock<{
  supabase: { functions: { invoke: jest.Mock } };
}>('@/lib/supabase');

describe('purchaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── init ──────────────────────────────────────────────────────────

  describe('init', () => {
    it('calls initConnection from react-native-iap', async () => {
      // Must be called once when the app starts to initialize the
      // connection to the store's billing API.
      iap.initConnection.mockResolvedValueOnce(true);

      await purchaseService.init();

      expect(iap.initConnection).toHaveBeenCalledTimes(1);
    });
  });

  // ── cleanup ───────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('calls endConnection from react-native-iap', async () => {
      // Must be called when the app is backgrounded/closed to release
      // the billing connection and prevent memory leaks.
      iap.endConnection.mockResolvedValueOnce(true);

      await purchaseService.cleanup();

      expect(iap.endConnection).toHaveBeenCalledTimes(1);
    });
  });

  // ── getProducts ───────────────────────────────────────────────────

  describe('getProducts', () => {
    it('calls fetchProducts with the Pro Monthly product ID', async () => {
      // Fetches subscription product details (price, title, description)
      // from the store for display on the Paywall screen.
      // react-native-iap v15+ uses fetchProducts (unified API).
      const mockProducts = [
        { productId: 'com.betabreaker.pro.monthly', title: 'Pro Monthly', price: '$4.99' },
      ];
      iap.fetchProducts.mockResolvedValueOnce(mockProducts);

      const result = await purchaseService.getProducts();

      expect(iap.fetchProducts).toHaveBeenCalledWith({
        skus: ['com.betabreaker.pro.monthly'],
      });
      expect(result).toEqual(mockProducts);
    });
  });

  // ── subscribe ─────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('calls requestPurchase with platform-specific request and type subs', async () => {
      // Triggers the native purchase flow (App Store / Play Store sheet).
      // react-native-iap v15+ uses requestPurchase with { request, type }.
      // Platform.OS is mocked as 'ios', so request should use apple params.
      const mockPurchase = {
        transactionId: 'txn-001',
        purchaseToken: 'receipt-data-abc',
        productId: 'com.betabreaker.pro.monthly',
      };
      iap.requestPurchase.mockResolvedValueOnce(mockPurchase);

      const result = await purchaseService.subscribe('com.betabreaker.pro.monthly');

      expect(iap.requestPurchase).toHaveBeenCalledWith({
        request: { apple: { sku: 'com.betabreaker.pro.monthly' } },
        type: 'subs',
      });
      expect(result).toEqual(mockPurchase);
    });
  });

  // ── restorePurchases ──────────────────────────────────────────────

  describe('restorePurchases', () => {
    it('calls getAvailablePurchases to restore previous subscriptions', async () => {
      // Users who reinstall the app or switch devices need to restore
      // their existing subscription. This queries the store for past purchases.
      const mockPurchases = [
        { transactionId: 'txn-restored-001', productId: 'com.betabreaker.pro.monthly' },
      ];
      iap.getAvailablePurchases.mockResolvedValueOnce(mockPurchases);

      const result = await purchaseService.restorePurchases();

      expect(iap.getAvailablePurchases).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockPurchases);
    });
  });

  // ── verifyReceipt ─────────────────────────────────────────────────

  describe('verifyReceipt', () => {
    it('invokes the verify-iap Edge Function with store and receipt data', async () => {
      // After a purchase, the receipt must be verified server-side to
      // prevent fraud. The Edge Function validates with Apple/Google
      // and updates the user's tier in the database.
      //
      // react-native-iap v15+ uses `purchaseToken` (not `transactionReceipt`)
      // as the unified receipt/token field across iOS and Android.
      const mockPurchase = {
        transactionId: 'txn-verify-001',
        purchaseToken: 'purchase-token-xyz',
        productId: 'com.betabreaker.pro.monthly',
      };

      supabase.functions.invoke.mockResolvedValueOnce({
        data: { success: true, tier: 'pro', expires_at: '2026-03-16T00:00:00Z' },
        error: null,
      });

      const result = await purchaseService.verifyReceipt(mockPurchase);

      expect(supabase.functions.invoke).toHaveBeenCalledWith('verify-iap', {
        body: {
          store: 'apple', // Platform.OS is mocked as 'ios'
          receipt: 'purchase-token-xyz',
          product_id: 'com.betabreaker.pro.monthly',
          transaction_id: 'txn-verify-001',
        },
      });
      expect(result.data).toEqual({
        success: true,
        tier: 'pro',
        expires_at: '2026-03-16T00:00:00Z',
      });
    });
  });
});
