/**
 * useEntitlement — Check Feature Access for the Current User's Tier
 *
 * This hook is the primary API for tier-based feature gating in the UI.
 * Screens call it with a feature name and get back:
 *   - `hasAccess` — whether the feature is available for the user's tier
 *   - `tier`      — the current tier ('free' or 'pro') for display purposes
 *   - `isLoading` — true while the auth state is still loading
 *
 * Usage:
 *   const { hasAccess, tier } = useEntitlement('analytics');
 *   if (!hasAccess) return <Paywall feature="analytics" />;
 *   return <AnalyticsDashboard />;
 *
 * Architecture:
 *   Screen → useEntitlement(feature) → useAuth() for tier → checkEntitlement()
 *
 * The actual entitlement logic lives in utils/entitlements.ts as a pure
 * function. This hook just wires it up with React state from useAuth().
 */

import { useAuth } from "@/hooks/useAuth";
import { checkEntitlement } from "@/utils/entitlements";
import type { Tier, EntitlementFeature } from "@/lib/constants";

/** The shape returned by useEntitlement(). */
export interface UseEntitlementReturn {
  /** Whether the current user's tier grants access to the requested feature. */
  hasAccess: boolean;
  /** The user's current tier — useful for display (e.g., "Upgrade from Free"). */
  tier: Tier;
  /** True while auth state is loading — show a skeleton, not a premature paywall. */
  isLoading: boolean;
}

/**
 * Check whether the current user has access to a tier-gated feature.
 *
 * @param feature - The feature to check (from ENTITLEMENT_FEATURES)
 * @returns { hasAccess, tier, isLoading }
 */
export function useEntitlement(feature: EntitlementFeature): UseEntitlementReturn {
  const { user, isLoading } = useAuth();

  // Default to 'free' if user is null (signed out or still loading).
  // This ensures we never accidentally grant access — the safe default
  // is always "no access" until we confirm the user's tier.
  const tier = (user?.tier as Tier) ?? "free";

  return {
    hasAccess: checkEntitlement(tier, feature),
    tier,
    isLoading,
  };
}
