/**
 * Custom React Hooks — TanStack Query Wrappers
 *
 * Each hook in this directory wraps a service function with TanStack Query's
 * useQuery or useMutation. This gives every data-fetching call automatic
 * caching, loading/error states, background refetch, and cache invalidation.
 *
 * Pattern:
 *   useRoutes()  → calls routeService.getAll() via useQuery
 *   useLogAscent() → calls ascentService.create() via useMutation
 *
 * Hooks are the primary API that screens import — screens never call
 * services directly. This keeps network logic out of UI components.
 */

// Hook exports will be added here as they are implemented in later phases.
export {};
