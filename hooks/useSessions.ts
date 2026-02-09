/**
 * Session Hooks — TanStack Query Wrappers for Logbook Data
 *
 * These hooks provide session history and session detail data to the
 * Logbook screens. They wrap sessionsService methods with TanStack Query
 * for automatic caching, loading/error states, and background refetch.
 *
 * TWO HOOKS:
 *   - `useSessionHistory()` — fetches the list of all past sessions
 *     (one entry per date) for the logbook index screen's FlatList.
 *   - `useSessionDetail(date)` — fetches both the aggregated summary
 *     AND raw ascents for a single date, used by the detail drill-down.
 *
 * QUERY KEYS:
 *   ["sessions", "history", userId]        — session history list
 *   ["sessions", "detail", userId, date]   — single date summary + ascents
 *
 * The "sessions" prefix groups all session-related queries. Including
 * userId ensures each user's data is cached separately (important if
 * the app ever supports profile switching). The date in the detail key
 * means each date gets its own cache entry.
 *
 * WHY useSessionDetail FETCHES TWO THINGS?
 * The detail screen needs both the SessionSummary (for the summary card)
 * and the raw AscentWithRoute[] (for the ascent list). Fetching them in
 * parallel via Promise.all in one queryFn keeps the hook API simple —
 * the screen just calls `useSessionDetail(date)` and gets everything.
 */

import { useQuery } from "@tanstack/react-query";
import { sessionsService } from "@/services/sessions.service";
import { useAuth } from "@/hooks/useAuth";

/**
 * Fetch the user's session history for the logbook list.
 *
 * @returns TanStack Query result with SessionHistoryEntry[]
 *
 * Each entry represents one day of climbing: date, ascent count,
 * sends/flashes, and the top grade. The logbook index screen renders
 * these as tappable cards sorted newest-first.
 */
export function useSessionHistory() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ["sessions", "history", userId],
    queryFn: async () => {
      // userId is guaranteed non-null when enabled is true (see below)
      return sessionsService.getSessionHistory(userId!);
    },
    // Only fetch when we have a user — unauthenticated users have no sessions
    enabled: !!userId,
  });
}

/**
 * Fetch summary + raw ascents for a single session date.
 *
 * @param date - YYYY-MM-DD string identifying which day to fetch
 * @returns TanStack Query result with { summary: SessionSummary, ascents: AscentWithRoute[] }
 *
 * The detail screen uses the summary for the SessionSummary card component
 * and the ascents array for the individual ascent list below it.
 * Both service calls run in parallel via Promise.all.
 */
export function useSessionDetail(date: string) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ["sessions", "detail", userId, date],
    queryFn: async () => {
      // Fetch both summary (aggregated stats) and raw ascents in parallel.
      // This avoids sequential fetches — the screen loads faster because
      // both network requests overlap.
      const [summary, ascents] = await Promise.all([
        sessionsService.getSessionSummary(userId!, new Date(date)),
        sessionsService.getSessionAscents(userId!, new Date(date)),
      ]);
      return { summary, ascents };
    },
    enabled: !!userId,
  });
}
