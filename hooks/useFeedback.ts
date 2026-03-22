/**
 * Feedback Hooks — TanStack Query Wrappers for Beta Tips & Voting
 *
 * These hooks provide reactive data and mutations for the Beta Tips
 * feature on route detail screens. They wrap feedbackService with
 * TanStack Query for caching, cache invalidation, and loading states.
 *
 * HOOK BREAKDOWN:
 *   - `useRouteFeedback(routeId)` — QUERY: fetches all tips for a route
 *     plus the current user's vote state. Returns `{ feedback, userVotes }`.
 *   - `useCreateFeedback(routeId)` — MUTATION: adds a new tip
 *   - `useDeleteFeedback(routeId)` — MUTATION: removes a tip
 *   - `useVoteFeedback(routeId)` — MUTATION: upvote/downvote/unvote
 *
 * All mutations invalidate the ["feedback", routeId] query key on
 * completion, causing useRouteFeedback to refetch fresh data. This
 * keeps the score and vote state consistent after every change.
 *
 * WHY COMBINE FEEDBACK + VOTES IN ONE QUERY?
 * The UI needs both the tip list AND the user's vote state to render
 * correctly (highlighted vote buttons). Fetching them as one query
 * means they're always in sync — no race conditions between separate
 * queries loading at different times.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { feedbackService } from "@/services/feedback.service";
import { useAuth } from "@/hooks/useAuth";

/**
 * Fetch all beta tips for a route, plus the current user's votes.
 *
 * Returns:
 *   - `feedback`: array of tip objects with author profile info
 *   - `userVotes`: map of feedback_id → vote direction ('up'|'down')
 *   - Standard TanStack Query fields (isLoading, error, etc.)
 *
 * The userVotes map lets the FeedbackItem component check
 * `userVotes[feedback.id]` to decide which vote button to highlight.
 *
 * @param routeId - The route to fetch feedback for
 */
export function useRouteFeedback(routeId: string) {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    // Include userId in the key so the query refetches when auth state changes
    queryKey: ["feedback", routeId, userId],
    // Don't fire until we have an authenticated user — RLS blocks anon reads
    enabled: !!userId,
    queryFn: async () => {
      // Fetch the feedback tips for this route
      const feedbackResult =
        await feedbackService.getRouteFeedback(routeId);

      if (feedbackResult.error) throw feedbackResult.error;

      const feedback = feedbackResult.data ?? [];

      // Fetch the current user's votes so we can highlight active buttons.
      // Only fetch if there's feedback to check votes for AND user is logged in.
      let userVoteMap: Record<string, string> = {};
      if (feedback.length > 0 && userId) {
        const feedbackIds = feedback.map(
          (f: { id: string }) => f.id
        );
        const votesResult = await feedbackService.getUserVotes(
          feedbackIds,
          userId
        );
        if (!votesResult.error && votesResult.data) {
          // Build a lookup map: { feedback_id: 'up'|'down' }
          // This is faster than .find() for each feedback item during render.
          for (const v of votesResult.data) {
            userVoteMap[v.feedback_id] = v.vote;
          }
        }
      }

      return { feedback, userVotes: userVoteMap };
    },
  });

  return {
    feedback: query.data?.feedback ?? [],
    userVotes: query.data?.userVotes ?? {},
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Mutation to create a new beta tip on a route.
 *
 * Accepts `{ body: string }` and automatically supplies the userId
 * from the auth context. Invalidates the feedback query on completion
 * so the new tip appears in the list.
 *
 * @param routeId - The route to add a tip to
 */
export function useCreateFeedback(routeId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ body }: { body: string }) => {
      if (!user?.id) throw new Error("Must be logged in to post feedback");
      const result = await feedbackService.createFeedback(
        routeId,
        user.id,
        body
      );
      if (result.error) throw result.error;
      return result.data;
    },
    // Refetch the feedback list after posting so the new tip appears
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback", routeId] });
    },
  });
}

/**
 * Mutation to delete a beta tip.
 *
 * Only the tip's author should see the delete button (enforced in UI),
 * and RLS enforces this at the database level as a security boundary.
 *
 * @param routeId - Used for cache invalidation after deletion
 */
export function useDeleteFeedback(routeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ feedbackId }: { feedbackId: string }) => {
      const result = await feedbackService.deleteFeedback(feedbackId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback", routeId] });
    },
  });
}

/**
 * Mutation to vote or unvote on a beta tip.
 *
 * Accepts `{ feedbackId, direction }` where direction is:
 *   - 'up' or 'down' to cast a vote
 *   - null to remove an existing vote (toggle off)
 *
 * The null direction handles the case where a user taps the same vote
 * button again to undo their vote. The UI determines the correct
 * direction by checking userVotes from useRouteFeedback.
 *
 * @param routeId - Used for cache invalidation after voting
 */
export function useVoteFeedback(routeId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["feedback", routeId, user?.id];

  return useMutation({
    mutationFn: async ({
      feedbackId,
      direction,
    }: {
      feedbackId: string;
      direction: "up" | "down" | null;
    }) => {
      if (!user?.id) throw new Error("Must be logged in to vote");

      if (direction === null) {
        await feedbackService.unvote(feedbackId, user.id);
      } else {
        await feedbackService.vote(feedbackId, user.id, direction);
      }
    },
    // Optimistic update — flip the heart instantly, fix on refetch.
    onMutate: async ({ feedbackId, direction }) => {
      // Cancel any in-flight refetch so it doesn't overwrite our optimistic data
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<{
        feedback: any[];
        userVotes: Record<string, string>;
      }>(queryKey);

      if (previous) {
        const oldVote = previous.userVotes[feedbackId] ?? null;

        // Build new userVotes map
        const newVotes = { ...previous.userVotes };
        if (direction === null) {
          delete newVotes[feedbackId];
        } else {
          newVotes[feedbackId] = direction;
        }

        // Adjust score: undo old vote, apply new vote
        const scoreDelta =
          (direction === "up" ? 1 : direction === "down" ? -1 : 0) -
          (oldVote === "up" ? 1 : oldVote === "down" ? -1 : 0);

        const newFeedback = previous.feedback.map((f: any) =>
          f.id === feedbackId ? { ...f, score: f.score + scoreDelta } : f
        );

        queryClient.setQueryData(queryKey, {
          feedback: newFeedback,
          userVotes: newVotes,
        });
      }

      return { previous };
    },
    // Roll back on error
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    // Always refetch to sync with server truth
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback", routeId] });
    },
  });
}
