/**
 * Admin Route Hooks — TanStack Query Wrappers for Route Management CRUD
 *
 * These hooks power the admin route management screens (Step 15.2):
 *   Queries:
 *     - useAdminRoutes(gymId)  → ["adminRoutes", gymId]  — all routes (all statuses)
 *     - useGymSetters(gymId)   → ["gymSetters", gymId]    — setter assignment dropdown
 *
 *   Mutations:
 *     - useCreateRoute()       → invalidates ["routes"] + ["adminRoutes"]
 *     - useUpdateRoute()       → invalidates ["routes"] + ["adminRoutes"]
 *     - useDeleteRoute()       → invalidates ["routes"] + ["adminRoutes"]
 *     - useGenerateQr()        → calls sign-qr Edge Function, returns token
 *
 * WHY SEPARATE FROM useRoutes.ts?
 * The climber-facing useRoutes hook fetches only active + retiring_soon routes
 * and includes offline cache fallback logic. The admin hooks fetch ALL statuses
 * (including archived) and don't need offline support — admins manage routes
 * when they're at the gym with connectivity.
 *
 * MUTATION INPUTS USE camelCase:
 * Screen components pass camelCase params (gymId, canonicalGrade, wallSection).
 * Hooks transform to snake_case before calling the service layer, keeping the
 * React/Postgres boundary clean.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { routeService } from "@/services/routes.service";
import type { UpdateRouteData } from "@/services/routes.service";

// ── Queries ──────────────────────────────────────────────────────────

/**
 * Fetch all routes for a gym across all lifecycle statuses.
 *
 * Unlike the climber-facing useRoutes which defaults to active + retiring_soon,
 * this hook explicitly requests all three statuses so admins can see archived
 * routes and manage the full route lifecycle.
 */
export function useAdminRoutes(gymId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["adminRoutes", gymId],
    queryFn: async () => {
      const result = await routeService.getRoutes({
        gymId: gymId!,
        status: ["active", "retiring_soon", "archived"],
      });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    // Disable the query if gymId isn't available yet (profile still loading)
    enabled: !!gymId,
  });

  return {
    routes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetch users who can be assigned as route setters at a gym.
 *
 * Returns users with setter, gym_admin, or super_admin roles — anyone
 * who is allowed to set routes at the gym. Used by the setter assignment
 * dropdown in the create/edit route forms.
 */
export function useGymSetters(gymId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["gymSetters", gymId],
    queryFn: async () => {
      const result = await routeService.getGymSetters(gymId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!gymId,
  });

  return {
    setters: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── Mutations ────────────────────────────────────────────────────────

/**
 * Mutation to create a new route.
 *
 * Accepts camelCase params from the create form and transforms to
 * snake_case for the service layer. Invalidates both the admin and
 * climber route caches so both views stay fresh.
 */
export function useCreateRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      gymId,
      name,
      canonicalGrade,
      color,
      wallSection,
      setterId,
    }: {
      gymId: string;
      name?: string;
      canonicalGrade: number;
      color?: string;
      wallSection?: string;
      setterId?: string;
    }) => {
      const result = await routeService.createRoute({
        gym_id: gymId,
        name,
        canonical_grade: canonicalGrade,
        color,
        wall_section: wallSection,
        setter_id: setterId,
      });
      if (result.error) throw result.error;
    },
    // Invalidate on settle (success or failure) so lists refetch.
    // We invalidate both "routes" (climber view) and "adminRoutes" (admin view).
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["adminRoutes"] });
    },
  });
}

/**
 * Mutation to update an existing route.
 *
 * Accepts routeId + partial UpdateRouteData (already snake_case from
 * the edit form). Invalidates route caches so both list and detail
 * views stay fresh after an edit.
 */
export function useUpdateRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      routeId,
      data,
    }: {
      routeId: string;
      data: UpdateRouteData;
    }) => {
      const result = await routeService.updateRoute(routeId, data);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["adminRoutes"] });
    },
  });
}

/**
 * Mutation to delete a route.
 *
 * Destructive action — the admin screen should confirm before calling.
 * Invalidates route caches to remove the route from all views.
 */
export function useDeleteRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ routeId }: { routeId: string }) => {
      const result = await routeService.deleteRoute(routeId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["adminRoutes"] });
    },
  });
}

/**
 * Mutation to generate a signed QR token for a route.
 *
 * Calls the sign-qr Edge Function which returns a JWT containing the
 * route ID. This token can be encoded into a QR code for display at
 * the physical wall. Returns the token data on success.
 */
export function useGenerateQr() {
  return useMutation({
    mutationFn: async ({ routeId }: { routeId: string }) => {
      const result = await routeService.generateQrToken(routeId);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}
