/**
 * useScoreboardRealtime — Live Scoreboard Updates via Supabase Realtime
 *
 * Subscribes to Postgres changes on the competition_scores table for a
 * specific event. When any score is inserted, updated, or deleted, the
 * hook invalidates the TanStack Query cache so the scoreboard refetches.
 *
 * WHY WILDCARD ("*") EVENT?
 * Scores can be:
 *   - INSERT: athlete submits a new score
 *   - UPDATE: judge verifies or corrects a score
 *   - DELETE: admin removes an erroneous entry
 * All three should trigger a scoreboard refresh.
 *
 * WHY INVALIDATE INSTEAD OF PATCH?
 * The scoreboard aggregates scores client-side (SUM + rank). Patching a
 * single score into the cache would require re-aggregating anyway.
 * Invalidating is simpler and lets TanStack Query handle the refetch.
 *
 * PATTERN: Same as useNotificationRealtime() in hooks/useNotifications.ts.
 * Channel lifecycle: channel() → .on() → .subscribe()
 * Cleanup: supabase.removeChannel(channel) on unmount
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Subscribes to real-time competition score changes for an event.
 *
 * When a score row matching the eventId is inserted, updated, or deleted,
 * invalidates ["eventScores", eventId] so the scoreboard re-renders with
 * fresh data.
 *
 * No-ops when eventId is null or undefined (e.g., before params are loaded).
 *
 * @param eventId - The event to monitor, or null/undefined to skip subscription
 */
export function useScoreboardRealtime(
  eventId: string | null | undefined
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Don't subscribe if we don't have an event ID yet
    if (!eventId) return;

    // Create a dedicated Realtime channel for this event's scoreboard.
    // Channel name must be unique per subscription — including the eventId
    // ensures multiple scoreboard screens don't interfere.
    const channel = supabase
      .channel(`scoreboard-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen for INSERT, UPDATE, and DELETE
          schema: "public",
          table: "competition_scores",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // A score changed — invalidate the cache so TanStack Query
          // refetches all scores for this event. The scoreboard component
          // will re-aggregate and re-rank automatically.
          queryClient.invalidateQueries({
            queryKey: ["eventScores", eventId],
          });
        }
      )
      .subscribe();

    // Cleanup: remove the channel when the component unmounts or
    // eventId changes. This closes the WebSocket subscription and
    // frees server-side resources.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, queryClient]);
}
