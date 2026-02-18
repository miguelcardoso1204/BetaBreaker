/**
 * useAuditLog Hook — TanStack Query Wrapper for Audit Log (Step 15.7)
 *
 * Read-only query hook that fetches audit log entries for a gym.
 * No mutations — the audit_log table is append-only, populated by
 * the on_route_update() trigger in Postgres.
 *
 * Query key: ["auditLog", gymId]
 * Disabled when gymId is null/undefined (profile still loading).
 *
 * DATA FLOW:
 *   AuditLogScreen → useAuditLog(gymId) → auditService.getAuditLog
 *     → PostgREST → Postgres (RLS: gym_admin+ only)
 */

import { useQuery } from '@tanstack/react-query';
import { auditService } from '@/services/audit.service';

/**
 * Fetch all audit log entries for a gym, ordered newest-first.
 *
 * Returns entries with actor profile joined (display_name).
 * actor can be null for system actions — the screen shows "System" fallback.
 *
 * @param gymId - The gym to fetch audit entries for (null disables the query)
 */
export function useAuditLog(gymId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['auditLog', gymId],
    queryFn: async () => {
      const result = await auditService.getAuditLog(gymId!);
      // Surface Supabase errors as thrown errors so TanStack Query
      // puts them in the error state instead of silently returning null
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    // Don't fire the query until gymId is available
    enabled: !!gymId,
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
