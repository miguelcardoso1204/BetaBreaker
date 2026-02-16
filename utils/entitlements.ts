/**
 * Entitlement Utility — Pure Functions for Tier-Based Feature Gating
 *
 * These functions answer the question: "Given a user's subscription tier,
 * can they access this feature / what are their limits?"
 *
 * They read from the TIERS config object in lib/constants.ts, which defines
 * the capabilities for each tier (free vs pro). This keeps the business logic
 * in one place — if we ever add a "team" tier, we'd update TIERS and these
 * functions would automatically pick up the new limits.
 *
 * Why pure functions?
 * - No React dependency → importable in services, hooks, Edge Functions
 * - Trivially testable → no mocking, no rendering
 * - Single responsibility → each function answers one question
 *
 * Used by:
 * - `useEntitlement(feature)` hook — UI-level access checks
 * - `Paywall` component — decides whether to show the paywall
 * - `mediaService.getWeeklyUploadCount()` — enforces beta upload limits
 */

import { TIERS } from '@/lib/constants';
import type { Tier, EntitlementFeature } from '@/lib/constants';

/**
 * Check whether a given tier grants access to a specific feature.
 *
 * The mapping between features and tier properties:
 *   'analytics'      → tier.analyticsEnabled (boolean)
 *   'unlimited_beta' → tier.betaPerWeek === Infinity
 *   'extra_badges'   → tier.maxBadges > 1
 *
 * @param tier    - The user's subscription tier ('free' or 'pro')
 * @param feature - The feature to check access for
 * @returns true if the tier grants access to the feature
 */
export function checkEntitlement(tier: Tier, feature: EntitlementFeature): boolean {
  const config = TIERS[tier];

  switch (feature) {
    case 'analytics':
      // Analytics dashboard is a boolean toggle — either you have it or you don't
      return config.analyticsEnabled;

    case 'unlimited_beta':
      // "Unlimited" means betaPerWeek is Infinity. Free tier has a finite cap (5).
      // Using !isFinite() instead of === Infinity to be safe with any number type.
      return !isFinite(config.betaPerWeek);

    case 'extra_badges':
      // Free tier gets 1 badge, pro gets 3. "Extra" means more than the baseline of 1.
      return config.maxBadges > 1;

    default:
      // Exhaustive check — TypeScript will error if a new EntitlementFeature
      // is added without handling it here. At runtime, unknown features are denied.
      return false;
  }
}

/**
 * Get the weekly beta video upload limit for a tier.
 *
 * Free: 5 uploads/week. Pro: Infinity (no limit).
 * Callers use simple comparison: `if (currentCount < getBetaLimit(tier)) { allow() }`
 *
 * @param tier - The user's subscription tier
 * @returns The maximum number of beta uploads per week
 */
export function getBetaLimit(tier: Tier): number {
  return TIERS[tier].betaPerWeek;
}

/**
 * Get the maximum number of badges a tier can display on their profile.
 *
 * Free: 1 badge. Pro: 3 badges.
 * Used by the profile screen to limit badge selection in the badge picker.
 *
 * @param tier - The user's subscription tier
 * @returns The maximum number of displayable badges
 */
export function getMaxBadges(tier: Tier): number {
  return TIERS[tier].maxBadges;
}
