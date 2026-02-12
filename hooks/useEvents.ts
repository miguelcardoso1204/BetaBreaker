/**
 * Event Hooks — TanStack Query Wrappers for Competition CRUD
 *
 * These hooks wrap eventsService with TanStack Query to provide caching,
 * loading states, and automatic cache invalidation for the event admin flow.
 *
 * HOOK BREAKDOWN:
 *   Queries:
 *     - useEvents(gymId)           → ["events", gymId]       — event list
 *     - useEvent(eventId)          → ["event", eventId]      — single event detail
 *     - useEventRoutes(eventId)    → ["eventRoutes", eventId] — linked routes
 *     - useEventCategories(eventId)→ ["eventCategories", eventId] — brackets
 *
 *   Mutations:
 *     - useCreateEvent()           → invalidates ["events"]
 *     - useUpdateEvent()           → invalidates ["events"] + ["event"]
 *     - useDeleteEvent()           → invalidates ["events"]
 *     - useAddRouteToEvent()       → invalidates ["eventRoutes"]
 *     - useRemoveRouteFromEvent()  → invalidates ["eventRoutes"]
 *     - useAddCategory()           → invalidates ["eventCategories"]
 *     - useDeleteCategory()        → invalidates ["eventCategories"]
 *
 * WHY INJECT userId FROM useAuth?
 * The service layer needs created_by for new events. Rather than making
 * each screen pass it manually, the hook pulls it from auth context.
 *
 * MUTATION INPUTS USE camelCase:
 * Screen components pass camelCase params (gymId, scoringModel, startDate).
 * The hooks transform to snake_case before calling the service layer, which
 * speaks Postgres's language. This keeps the React/service boundary clean.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { eventsService } from "@/services/events.service";
import { useAuth } from "@/hooks/useAuth";
import type { ScoringModel, UpdateEventData } from "@/services/events.service";

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Fetch all events for a gym.
 *
 * Query key includes gymId so each gym gets its own cache entry.
 * Returns { events, isLoading, error } for the event list screen.
 */
export function useEvents(gymId: string | null | undefined) {
  const query = useQuery({
    // Disable the query if gymId isn't available yet (e.g., profile still loading)
    queryKey: ["events", gymId],
    queryFn: async () => {
      const result = await eventsService.getEvents(gymId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!gymId,
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetch a single event with embedded routes and categories.
 *
 * The detail/edit screen uses this to get everything in one query.
 * Returns { event, isLoading, error }.
 */
export function useEvent(eventId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const result = await eventsService.getEvent(eventId!);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!eventId,
  });

  return {
    event: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetch routes linked to an event.
 *
 * Separate from useEvent because route linking is a distinct admin
 * action — invalidating this cache shouldn't refetch the entire event.
 */
export function useEventRoutes(eventId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["eventRoutes", eventId],
    queryFn: async () => {
      const result = await eventsService.getEventRoutes(eventId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!eventId,
  });

  return {
    eventRoutes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Fetch categories for an event.
 *
 * Separate query for the same reason as routes — independent
 * invalidation when adding/removing categories.
 */
export function useEventCategories(eventId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["eventCategories", eventId],
    queryFn: async () => {
      const result = await eventsService.getEventCategories(eventId!);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    enabled: !!eventId,
  });

  return {
    categories: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Mutation to create a new event.
 *
 * Accepts camelCase params from the create form and transforms to
 * snake_case for the service. Automatically injects the admin's userId
 * as created_by. Invalidates ["events"] so the list refreshes.
 */
export function useCreateEvent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      gymId,
      name,
      scoringModel,
      startDate,
      endDate,
    }: {
      gymId: string;
      name: string;
      scoringModel: ScoringModel;
      startDate: string;
      endDate: string;
    }) => {
      if (!user?.id) throw new Error("Must be logged in to create events");
      const result = await eventsService.createEvent({
        gym_id: gymId,
        name,
        scoring_model: scoringModel,
        start_date: startDate,
        end_date: endDate,
        created_by: user.id,
      });
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

/**
 * Mutation to update an event.
 *
 * Accepts eventId + partial update data (already snake_case from the
 * edit form). Invalidates both ["events"] (list) and ["event"] (detail)
 * so both screens stay fresh after an edit.
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      data,
    }: {
      eventId: string;
      data: UpdateEventData;
    }) => {
      const result = await eventsService.updateEvent(eventId, data);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event"] });
    },
  });
}

/**
 * Mutation to delete an event.
 *
 * CASCADE handles cleanup of routes, categories, and scores.
 * Invalidates ["events"] to remove the event from the list.
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      const result = await eventsService.deleteEvent(eventId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

/**
 * Mutation to link a route to an event.
 *
 * Invalidates ["eventRoutes"] so the route list refreshes.
 * Also invalidates ["event"] since the embedded event_routes changes.
 */
export function useAddRouteToEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      routeId,
      sortOrder,
    }: {
      eventId: string;
      routeId: string;
      sortOrder: number;
    }) => {
      const result = await eventsService.addRouteToEvent(
        eventId,
        routeId,
        sortOrder
      );
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["event"] });
    },
  });
}

/**
 * Mutation to unlink a route from an event.
 *
 * Invalidates ["eventRoutes"] + ["event"] for the same reasons.
 */
export function useRemoveRouteFromEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      routeId,
    }: {
      eventId: string;
      routeId: string;
    }) => {
      const result = await eventsService.removeRouteFromEvent(
        eventId,
        routeId
      );
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventRoutes"] });
      queryClient.invalidateQueries({ queryKey: ["event"] });
    },
  });
}

/**
 * Mutation to add a category to an event.
 *
 * Invalidates ["eventCategories"] + ["event"] so both the category
 * list and the embedded event detail stay fresh.
 */
export function useAddCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      name,
    }: {
      eventId: string;
      name: string;
    }) => {
      const result = await eventsService.addCategory(eventId, name);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventCategories"] });
      queryClient.invalidateQueries({ queryKey: ["event"] });
    },
  });
}

/**
 * Mutation to delete a category.
 *
 * Competition scores referencing this category keep their scores but
 * lose the bracket assignment (ON DELETE SET NULL).
 */
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ categoryId }: { categoryId: string }) => {
      const result = await eventsService.deleteCategory(categoryId);
      if (result.error) throw result.error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventCategories"] });
      queryClient.invalidateQueries({ queryKey: ["event"] });
    },
  });
}
