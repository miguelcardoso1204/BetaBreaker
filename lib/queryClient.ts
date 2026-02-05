/**
 * TanStack Query Client Configuration
 *
 * QueryClient is the central cache manager for all "server state" — data that
 * lives in Supabase and is fetched over the network. Every `useQuery` and
 * `useMutation` hook shares this single client so they can coordinate
 * caching, background refetches, and cache invalidation.
 *
 * Why TanStack Query instead of plain useEffect + useState?
 * - Automatic caching: identical queries across screens share one cache entry
 * - Background refetch: stale data is shown instantly while fresh data loads
 * - Optimistic mutations: UI updates immediately, rolls back if the write fails
 * - Cache invalidation: after a mutation you can surgically invalidate only
 *   the queries whose data changed
 */

import { QueryClient } from "@tanstack/react-query";

/**
 * Create a single QueryClient instance for the entire app.
 *
 * Default options explained:
 * - staleTime (5 minutes): How long fetched data is considered "fresh."
 *   During this window, navigating back to a screen won't trigger a refetch.
 *   5 min is a good balance for a climbing app — route data doesn't change
 *   every second, but you still want reasonably current info.
 *
 * - gcTime (30 minutes): "Garbage collection time." How long unused cache
 *   entries stay in memory after their last subscriber unmounts. Keeps data
 *   available if the user returns to a screen within 30 minutes.
 *
 * - retry (2): Network requests retry up to 2 times on failure. Mobile
 *   connections are flaky — a quick retry often succeeds without bothering
 *   the user. We keep it low (2, not 5) to avoid long waits on real errors.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 2,
    },
  },
});
