/**
 * useRouteSuggestions — Pro-Gated Personalized Route Recommendations
 *
 * This hook is the orchestrator for the "Suggested for You" feature (FR-E3).
 * It composes four other hooks and two service calls to produce a scored,
 * paginated list of routes the user hasn't sent, weighted toward their
 * weaker climbing styles.
 *
 * Data flow:
 *   useAuth()           → userId, homeGymId
 *   useEntitlement()    → Pro gate (query disabled for free tier)
 *   useGradePyramid()   → maxGrade (highest grade in pyramid, all-time)
 *   useStyleInsights()  → style distribution → weak styles
 *   sessionsService     → sent route IDs (exclusion set)
 *   routeService        → candidate routes in grade range
 *   scoreSuggestions()  → filter, score, sort, paginate (pure function)
 *
 * Why compose hooks instead of a single monolithic query?
 * - Grade Pyramid and Style Insights are already fetched by their own hooks
 *   on the analytics screen. TanStack Query caches them by key, so if the
 *   user has already viewed analytics, these are instant cache hits — no
 *   redundant network requests.
 * - Separating the scoring logic into utils/suggestions.ts makes it testable
 *   without any React or network dependencies.
 *
 * The optional `gymId` parameter supports future gym-detail-screen usage.
 * When omitted, it falls back to the user's home gym.
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useGradePyramid } from "@/hooks/useGradePyramid";
import { useStyleInsights } from "@/hooks/useStyleInsights";
import { sessionsService } from "@/services/sessions.service";
import { routeService } from "@/services/routes.service";
import {
  computeWeakStyles,
  scoreSuggestions,
  SUGGESTION_GRADE_RANGE,
} from "@/utils/suggestions";
import type { ScoredRoute } from "@/utils/suggestions";

/** The shape returned by useRouteSuggestions(). */
export interface UseRouteSuggestionsReturn {
  /** Scored route suggestions for the current page, or undefined if not loaded. */
  suggestions: ScoredRoute[] | undefined;
  /** True while any upstream data (pyramid, style, candidates) is loading. */
  isLoading: boolean;
  /** Error from the suggestion query or upstream hooks. */
  error: Error | null;
  /** Whether the user's tier grants access to this feature. */
  hasAccess: boolean;
  /** The user's current subscription tier. */
  tier: string;
  /** Whether there are more suggestions beyond the current page. */
  hasMore: boolean;
  /** Advance to the next page (wraps to 0 when no more results). */
  refresh: () => void;
  /** True when the user has no home gym set and no gymId override provided. */
  noHomeGym: boolean;
}

/**
 * Fetch personalized route suggestions for the current user.
 *
 * @param gymId - Optional gym ID override. Defaults to user's home gym.
 * @returns Suggestion data, loading/error states, entitlement info, and pagination
 */
export function useRouteSuggestions(gymId?: string): UseRouteSuggestionsReturn {
  const { user } = useAuth();
  const userId = user?.id;
  const { hasAccess, tier } = useEntitlement("analytics");

  // Use all-time data for suggestions — we want the broadest view of
  // the user's climbing profile, not just recent activity.
  const pyramid = useGradePyramid("all_time");
  const style = useStyleInsights("all_time");

  // Page state for pagination. The refresh() callback increments this,
  // wrapping to 0 when there are no more results.
  const [page, setPage] = useState(0);

  // Determine the effective gym ID: explicit override > user's home gym.
  const effectiveGymId = gymId ?? user?.homeGymId ?? null;
  const noHomeGym = !gymId && !user?.homeGymId;

  // Derive maxGrade from pyramid data. The pyramid is sorted ascending
  // by grade, so the last entry has the highest grade the user has sent.
  const maxGrade =
    pyramid.data && pyramid.data.length > 0
      ? pyramid.data[pyramid.data.length - 1].grade
      : undefined;

  // Pre-compute weak and known styles from the style distribution.
  // These are passed to the scoring algorithm inside the query function.
  const weakStyles = style.data ? computeWeakStyles(style.data) : new Set<string>();
  const knownStyles = style.data
    ? new Set(style.data.map((e) => e.tagName))
    : new Set<string>();

  // The main query: fetches sent route IDs + candidate routes, then
  // runs the pure scoring pipeline. Disabled when any prerequisite
  // is missing (no user, no access, no gym, no grade data, upstream loading).
  const { data, isLoading: queryLoading, error } = useQuery({
    queryKey: ["analytics", "suggestions", userId, effectiveGymId, maxGrade, page],
    queryFn: async () => {
      // Fetch sent routes and candidates in parallel — they're independent.
      const [sentRouteIds, candidates] = await Promise.all([
        sessionsService.getSentRouteIds(userId!, effectiveGymId!),
        routeService.getCandidateRoutes(
          effectiveGymId!,
          maxGrade! - SUGGESTION_GRADE_RANGE,
          maxGrade! + SUGGESTION_GRADE_RANGE
        ),
      ]);

      // Run the pure scoring pipeline. This filters out sent routes,
      // scores by weak/novel style overlap, sorts, and paginates.
      return scoreSuggestions({
        candidates,
        sentRouteIds,
        weakStyles,
        knownStyles,
        page,
      });
    },
    enabled:
      !!userId &&
      hasAccess &&
      !!effectiveGymId &&
      maxGrade !== undefined &&
      !pyramid.isLoading &&
      !style.isLoading,
  });

  // Combine loading states: true if any upstream hook or the main query is loading.
  const isLoading = pyramid.isLoading || style.isLoading || queryLoading;

  // Refresh advances the page. When we've reached the end (no more results),
  // wrap back to page 0 to show the first batch again.
  const refresh = useCallback(() => {
    setPage((prev) => (data && !data.hasMore ? 0 : prev + 1));
  }, [data]);

  return {
    suggestions: data?.suggestions,
    isLoading,
    error: error as Error | null,
    hasAccess,
    tier,
    hasMore: data?.hasMore ?? false,
    refresh,
    noHomeGym,
  };
}
