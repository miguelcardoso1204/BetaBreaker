/**
 * Setting Calendar Hooks — TanStack Query Wrappers for Session Scheduling
 *
 * These hooks power the admin calendar screen (Step 15.3):
 *   Queries:
 *     - useSettingSessions(gymId, start, end)  → ["settingSessions", gymId, start, end]
 *     - useSetterWorkload(gymId, start, end)   → ["setterWorkload", gymId, start, end]
 *
 *   Mutations (all invalidate ["settingSessions"]):
 *     - useCreateSettingSession()  — schedule a new session
 *     - useUpdateSettingSession()  — change status/notes
 *     - useDeleteSettingSession()  — remove a session
 *
 * WHY INVALIDATE BROADLY?
 * All three mutations invalidate the entire ["settingSessions"] key prefix.
 * This ensures any date range that's currently cached gets refetched,
 * because a create/update/delete could affect any visible month.
 *
 * MUTATION INPUTS USE camelCase:
 * Screen components pass camelCase params (gymId, setterId, scheduledDate).
 * Hooks transform to snake_case before calling the service layer, keeping
 * the React/Postgres naming boundary clean.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { calendarService } from "@/services/calendar.service";
import type { UpdateSessionData } from "@/services/calendar.service";

// ── Queries ──────────────────────────────────────────────────────────

/**
 * Fetch setting sessions for a gym within a date range.
 *
 * Returns sessions joined with setter profiles so the calendar can
 * display "Alice Setter — planned" for each date cell.
 *
 * @param gymId - The gym to fetch sessions for (null disables the query)
 * @param startDate - Start of range, e.g. '2026-03-01'
 * @param endDate - End of range, e.g. '2026-03-31'
 */
export function useSettingSessions(
  gymId: string | null | undefined,
  startDate: string,
  endDate: string
) {
  const query = useQuery({
    queryKey: ["settingSessions", gymId, startDate, endDate],
    queryFn: async () => {
      const result = await calendarService.getSessionsByDateRange(
        gymId!,
        startDate,
        endDate
      );
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    // Disable if gymId isn't available (profile still loading)
    enabled: !!gymId,
  });

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetch setter workload (route counts) for a gym within a date range.
 *
 * Calls the get_setter_workload Postgres RPC which groups routes by
 * setter and returns (setter_id, display_name, route_count) rows.
 * The admin screen shows this as a workload summary at the bottom.
 *
 * @param gymId - The gym to check workload for (null disables the query)
 * @param startDate - Start of range
 * @param endDate - End of range
 */
export function useSetterWorkload(
  gymId: string | null | undefined,
  startDate: string,
  endDate: string
) {
  const query = useQuery({
    queryKey: ["setterWorkload", gymId, startDate, endDate],
    queryFn: async () => {
      const result = await calendarService.getSetterWorkload(
        gymId!,
        startDate,
        endDate
      );
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!gymId,
  });

  return {
    workload: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── Mutations ────────────────────────────────────────────────────────

/**
 * Mutation to schedule a new setting session.
 *
 * Accepts camelCase params from the form and transforms to snake_case
 * for the service layer. Invalidates session + workload caches on settle.
 */
export function useCreateSettingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      gymId,
      setterId,
      scheduledDate,
      notes,
    }: {
      gymId: string;
      setterId: string;
      scheduledDate: string;
      notes?: string;
    }) => {
      const result = await calendarService.createSession({
        gym_id: gymId,
        setter_id: setterId,
        scheduled_date: scheduledDate,
        notes,
      });
      if (result.error) throw result.error;
    },
    // Invalidate all session and workload queries regardless of date range
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["settingSessions"] });
      queryClient.invalidateQueries({ queryKey: ["setterWorkload"] });
    },
  });
}

/**
 * Mutation to update an existing setting session.
 *
 * Used for status changes (planned → completed/cancelled) and notes edits.
 */
export function useUpdateSettingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      data,
    }: {
      sessionId: string;
      data: UpdateSessionData;
    }) => {
      const result = await calendarService.updateSession(sessionId, data);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["settingSessions"] });
      queryClient.invalidateQueries({ queryKey: ["setterWorkload"] });
    },
  });
}

/**
 * Mutation to delete a setting session.
 *
 * Removes a session entirely from the calendar. The admin screen
 * should confirm before calling (destructive action).
 */
export function useDeleteSettingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      const result = await calendarService.deleteSession(sessionId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["settingSessions"] });
      queryClient.invalidateQueries({ queryKey: ["setterWorkload"] });
    },
  });
}
