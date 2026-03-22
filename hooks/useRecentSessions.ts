/**
 * useRecentSessions Hook — Fetches Recent Session History for Profile
 *
 * TanStack Query wrapper around sessionsService.getRecentSessions().
 * Returns the most recent N sessions with gym info and ascent counts,
 * designed for the "Recent Sessions" section on the profile screen.
 *
 * WHY A SEPARATE HOOK (not inside useSession)?
 * useSession is for the active session (timer, pending logs, mutations).
 * This hook is for reading historical session data — different concern,
 * different query key, different consumers. Keeping them separate means
 * the profile screen doesn't subscribe to active session state changes.
 *
 * Accepts an optional userId so it can fetch sessions for any user —
 * not just the current one. This powers both the self-profile and the
 * other-user profile screens.
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { sessionsService } from "@/services/sessions.service";
import type { RecentSession } from "@/services/sessions.service";

/**
 * Fetch a user's most recent sessions with gym info and ascent counts.
 *
 * @param targetUserId - Optional user ID to fetch for (defaults to current user)
 * @param limit - Max sessions to return (default 5)
 * @returns TanStack Query result with data typed as RecentSession[]
 */
export function useRecentSessions(targetUserId?: string, limit = 5) {
  const { user } = useAuth();
  // Use the provided userId, or fall back to the current user's ID.
  const userId = targetUserId ?? user?.id;

  return useQuery<RecentSession[]>({
    // Query key includes userId and limit so cache entries are specific
    // to each user and each requested page size.
    queryKey: ["sessions", "recent", userId, limit],
    queryFn: () => sessionsService.getRecentSessions(userId!, limit),
    // Don't fire the query if there's no user ID to query for.
    enabled: !!userId,
  });
}
