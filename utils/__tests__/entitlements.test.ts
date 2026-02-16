/**
 * Entitlement Utility Tests (Step 13.1)
 *
 * Tests for pure functions that determine feature access based on subscription
 * tier. These functions are the core of the monetization gating logic — they
 * take a tier name and return whether a feature is accessible, or what limits
 * apply.
 *
 * Why pure functions instead of putting this in a hook?
 * Entitlement checks are needed in multiple places: hooks, services, and
 * potentially Edge Functions. Pure functions are easy to test (no React
 * rendering needed) and can be imported anywhere.
 *
 * TDD Red Phase: These tests are written first. They will fail until
 * utils/entitlements.ts implements the functions.
 */

import { checkEntitlement, getBetaLimit, getMaxBadges } from '../entitlements';

/* ── checkEntitlement ─────────────────────────────────────────────── */

describe('checkEntitlement', () => {
  // Analytics is a Pro-only feature — free users see a teaser/paywall,
  // pro users see the full dashboard.

  it('returns false for free tier + analytics', () => {
    expect(checkEntitlement('free', 'analytics')).toBe(false);
  });

  it('returns true for pro tier + analytics', () => {
    expect(checkEntitlement('pro', 'analytics')).toBe(true);
  });

  // Unlimited beta uploads — free users are capped at 5/week,
  // pro users have no limit (Infinity).

  it('returns false for free tier + unlimited_beta', () => {
    expect(checkEntitlement('free', 'unlimited_beta')).toBe(false);
  });

  it('returns true for pro tier + unlimited_beta', () => {
    expect(checkEntitlement('pro', 'unlimited_beta')).toBe(true);
  });

  // Extra badges — free users can display 1 badge on their profile,
  // pro users can display up to 3.

  it('returns false for free tier + extra_badges', () => {
    expect(checkEntitlement('free', 'extra_badges')).toBe(false);
  });

  it('returns true for pro tier + extra_badges', () => {
    expect(checkEntitlement('pro', 'extra_badges')).toBe(true);
  });
});

/* ── getBetaLimit ─────────────────────────────────────────────────── */

describe('getBetaLimit', () => {
  it('returns 5 for free tier (weekly video upload cap)', () => {
    // Free users are limited to 5 beta video uploads per week.
    // This encourages upgrades without completely blocking the feature.
    expect(getBetaLimit('free')).toBe(5);
  });

  it('returns Infinity for pro tier (unlimited uploads)', () => {
    // Pro users have no weekly limit. Using Infinity means simple
    // `count <= getBetaLimit(tier)` checks always pass for pro.
    expect(getBetaLimit('pro')).toBe(Infinity);
  });
});

/* ── getMaxBadges ─────────────────────────────────────────────────── */

describe('getMaxBadges', () => {
  it('returns 1 for free tier', () => {
    // Free users can showcase only 1 badge on their profile.
    expect(getMaxBadges('free')).toBe(1);
  });

  it('returns 3 for pro tier', () => {
    // Pro users can display up to 3 badges — more bragging rights!
    expect(getMaxBadges('pro')).toBe(3);
  });
});
