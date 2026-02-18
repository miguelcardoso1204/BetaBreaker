/**
 * Maintenance Ticket Hooks — TanStack Query Wrappers for Ticket Operations
 *
 * These hooks power both the admin ticket queue screen (Step 15.5) and the
 * "Report Issue" button on route detail screens.
 *
 *   Queries:
 *     - useMaintenanceTickets(gymId)  → ["maintenanceTickets", gymId]
 *     - useRouteTickets(routeId)      → ["routeTickets", routeId]
 *
 *   Mutations (all invalidate relevant query keys on settle):
 *     - useCreateTicket()       — report a new issue
 *     - useUpdateTicketStatus() — change status (open → in_progress → resolved)
 *     - useDeleteTicket()       — remove a ticket
 *
 * WHY INVALIDATE BOTH KEYS?
 * A ticket create affects both the gym-wide ticket list (admin queue) and
 * the per-route ticket list (route detail). Invalidating both ensures
 * both views stay in sync regardless of which screen triggered the change.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maintenanceService } from "@/services/maintenance.service";
import type { CreateTicketData } from "@/services/maintenance.service";

// ── Queries ──────────────────────────────────────────────────────────

/**
 * Fetch all maintenance tickets for routes at a gym.
 *
 * Returns tickets joined with route info (name, color) and reporter
 * profile (display_name), ordered newest-first. Powers the admin
 * ticket queue screen.
 *
 * @param gymId - The gym to fetch tickets for (null disables the query)
 */
export function useMaintenanceTickets(gymId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["maintenanceTickets", gymId],
    queryFn: async () => {
      const result = await maintenanceService.getTicketsByGym(gymId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    // Disable if gymId isn't available (profile still loading)
    enabled: !!gymId,
  });

  return {
    tickets: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetch maintenance tickets for a single route.
 *
 * Simpler than the gym-wide query — only includes reporter info.
 * Used on route detail pages to show open issues.
 *
 * @param routeId - The route to fetch tickets for (null disables the query)
 */
export function useRouteTickets(routeId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["routeTickets", routeId],
    queryFn: async () => {
      const result = await maintenanceService.getTicketsByRoute(routeId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!routeId,
  });

  return {
    tickets: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── Mutations ────────────────────────────────────────────────────────

/**
 * Mutation to create a new maintenance ticket (report a route issue).
 *
 * Invalidates both maintenanceTickets (admin queue) and routeTickets
 * (route detail) on settle so both views refresh.
 */
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTicketData) => {
      const result = await maintenanceService.createTicket(data);
      if (result.error) throw result.error;
    },
    // Invalidate both query key prefixes so all cached lists refresh
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenanceTickets"] });
      queryClient.invalidateQueries({ queryKey: ["routeTickets"] });
    },
  });
}

/**
 * Mutation to update a ticket's status.
 *
 * Accepts camelCase params from the UI and passes them to the service.
 * When resolving, pass resolvedBy to stamp who fixed the issue.
 */
export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      status,
      resolvedBy,
    }: {
      ticketId: string;
      status: string;
      resolvedBy?: string;
    }) => {
      const result = await maintenanceService.updateTicketStatus(
        ticketId,
        status,
        resolvedBy
      );
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenanceTickets"] });
      queryClient.invalidateQueries({ queryKey: ["routeTickets"] });
    },
  });
}

/**
 * Mutation to delete a maintenance ticket.
 *
 * Only gym admins can delete tickets per the RLS DELETE policy.
 * Invalidates both query key prefixes on settle.
 */
export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId }: { ticketId: string }) => {
      const result = await maintenanceService.deleteTicket(ticketId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenanceTickets"] });
      queryClient.invalidateQueries({ queryKey: ["routeTickets"] });
    },
  });
}
