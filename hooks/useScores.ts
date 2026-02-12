/**
 * Score Hooks — TanStack Query Wrappers for Competition Scores
 *
 * These hooks wrap scoresService with TanStack Query to provide caching,
 * loading states, and automatic cache invalidation for the score flow.
 *
 * HOOK BREAKDOWN:
 *   Queries:
 *     - useEventScores(eventId)          → ["eventScores", eventId]     — all scores (admin/judge)
 *     - useUserEventScores(eventId)      → ["userEventScores", ...]     — athlete's scores
 *     - useActiveEventsForRoute(routeId) → ["activeEventsForRoute", ...] — QR scan flow
 *
 *   Mutations:
 *     - useCreateScore()    → invalidates ["eventScores"] + ["userEventScores"]
 *     - useUpdateScore()    → invalidates ["eventScores"] + ["userEventScores"]
 *     - useVerifyScore()    → invalidates ["eventScores"]
 *     - useDeleteScore()    → invalidates ["eventScores"] + ["userEventScores"]
 *
 * WHY INJECT userId FROM useAuth?
 * The service layer needs user_id for creating scores and user_id for
 * fetching per-athlete scores. The hooks pull it from auth context so
 * screens don't have to pass it around manually.
 *
 * MUTATION INPUTS USE camelCase:
 * Screen components pass camelCase params (eventId, routeId, scoreId).
 * The hooks transform to snake_case before calling the service layer.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { scoresService } from "@/services/scores.service";
import { useAuth } from "@/hooks/useAuth";
import type { UpdateScoreData } from "@/services/scores.service";

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Fetch all scores for an event (admin/judge view).
 *
 * Includes embedded user profiles and route info for display.
 * Query key: ["eventScores", eventId]
 */
export function useEventScores(eventId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["eventScores", eventId],
    queryFn: async () => {
      const result = await scoresService.getEventScores(eventId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!eventId,
  });

  return {
    scores: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetch the current user's scores in an event (athlete view).
 *
 * Automatically injects the authenticated user's ID from useAuth.
 * Query key: ["userEventScores", eventId, userId]
 */
export function useUserEventScores(eventId: string | null | undefined) {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["userEventScores", eventId, userId],
    queryFn: async () => {
      const result = await scoresService.getUserEventScores(
        eventId!,
        userId!
      );
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    // Both eventId and userId must be available before fetching
    enabled: !!eventId && !!userId,
  });

  return {
    scores: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetch ongoing events that contain a specific route.
 *
 * Called after a QR scan to check if the scanned route is in any active
 * competition. If so, the UI shows a "Comp Score" button.
 * Query key: ["activeEventsForRoute", routeId]
 */
export function useActiveEventsForRoute(
  routeId: string | null | undefined
) {
  const query = useQuery({
    queryKey: ["activeEventsForRoute", routeId],
    queryFn: async () => {
      const result = await scoresService.getActiveEventsForRoute(routeId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!routeId,
  });

  return {
    activeEvents: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Mutation to submit a new score.
 *
 * Accepts camelCase params from the athlete screen and transforms to
 * snake_case for the service. Injects user_id from useAuth.
 * Invalidates both eventScores (admin view) and userEventScores (athlete view).
 */
export function useCreateScore() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      routeId,
      score,
      categoryId,
    }: {
      eventId: string;
      routeId: string;
      score: number;
      categoryId?: string;
    }) => {
      if (!user?.id) throw new Error("Must be logged in to submit scores");
      const result = await scoresService.createScore({
        event_id: eventId,
        user_id: user.id,
        route_id: routeId,
        score,
        ...(categoryId ? { category_id: categoryId } : {}),
      });
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventScores"] });
      queryClient.invalidateQueries({ queryKey: ["userEventScores"] });
    },
  });
}

/**
 * Mutation to update a score (judge action).
 *
 * Accepts scoreId + update data (score value and/or verified_by).
 * Invalidates both score views so the scoreboard and athlete view refresh.
 */
export function useUpdateScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scoreId,
      data,
    }: {
      scoreId: string;
      data: UpdateScoreData;
    }) => {
      const result = await scoresService.updateScore(scoreId, data);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventScores"] });
      queryClient.invalidateQueries({ queryKey: ["userEventScores"] });
    },
  });
}

/**
 * Mutation to verify a score without changing its value.
 *
 * Automatically sets verified_by to the current user's ID (the judge).
 * Only invalidates eventScores since verification doesn't change the
 * athlete's score value.
 */
export function useVerifyScore() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ scoreId }: { scoreId: string }) => {
      if (!user?.id) throw new Error("Must be logged in to verify scores");
      const result = await scoresService.verifyScore(scoreId, user.id);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventScores"] });
    },
  });
}

/**
 * Mutation to delete a score (admin action).
 *
 * Invalidates both score views so the scoreboard updates immediately.
 */
export function useDeleteScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ scoreId }: { scoreId: string }) => {
      const result = await scoresService.deleteScore(scoreId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventScores"] });
      queryClient.invalidateQueries({ queryKey: ["userEventScores"] });
    },
  });
}
