/**
 * Route Filter Store — Per-Gym Filter Persistence with Zustand
 *
 * This store holds the grade range and sort preferences for the gym routes
 * screen. Filters are keyed by gymId so each gym remembers its own settings
 * when the user navigates between gyms.
 *
 * WHY ZUSTAND?
 * Filters are ephemeral client state — they don't come from the database and
 * don't need to survive app restarts. Zustand gives us reactive state updates
 * (components re-render when filters change) with zero boilerplate. No
 * Providers, no reducers, no action creators — just a plain function.
 *
 * WHY PER-GYM?
 * A climber browsing Gym A's V0–V4 routes shouldn't lose those filters when
 * they switch to Gym B. Keying by gymId keeps each gym's filters independent.
 *
 * HOW IT CONNECTS:
 * The GymRoutes screen reads filters via `getFilters(gymId)` and passes them
 * to `useRoutes({ gymId, ...filters })`. When filters change, TanStack Query
 * sees a new query key and refetches automatically.
 */

import { create } from "zustand";

// ── Types ────────────────────────────────────────────────────────

/** The sort options for the route list. */
export type RouteSortBy = "newest" | "grade";

/** Filter state for a single gym. */
export interface GymFilters {
  gradeMin?: number;
  gradeMax?: number;
  sortBy: RouteSortBy;
}

/** The full store shape: per-gym filter map + actions. */
interface RouteFilterState {
  /** Map of gymId → filter state. Gyms without entries use defaults. */
  filters: Record<string, GymFilters>;

  /** Get filters for a gym, returning defaults if none are set. */
  getFilters: (gymId: string) => GymFilters;

  /** Set the minimum grade filter for a gym. Pass undefined to clear. */
  setGradeMin: (gymId: string, value: number | undefined) => void;

  /** Set the maximum grade filter for a gym. Pass undefined to clear. */
  setGradeMax: (gymId: string, value: number | undefined) => void;

  /** Toggle between "newest" (default) and "grade" sort order. */
  setSortBy: (gymId: string, value: RouteSortBy) => void;

  /** Reset all filters for a gym back to defaults. */
  resetFilters: (gymId: string) => void;
}

// ── Default Filters ──────────────────────────────────────────────

/** The default filter state for any gym that hasn't been customized. */
const DEFAULT_FILTERS: GymFilters = {
  sortBy: "newest",
};

// ── Store ────────────────────────────────────────────────────────

/**
 * Zustand store for route list filters.
 *
 * Usage in a component:
 * ```ts
 * const filters = useRouteFilterStore((s) => s.getFilters(gymId));
 * const setSortBy = useRouteFilterStore((s) => s.setSortBy);
 * ```
 *
 * Zustand's `create()` takes a function that receives `set` and `get`:
 *   - `set` merges partial state into the store (triggers re-renders)
 *   - `get` reads current state without subscribing (useful inside actions)
 */
export const useRouteFilterStore = create<RouteFilterState>((set, get) => ({
  filters: {},

  getFilters: (gymId: string): GymFilters => {
    // Return the gym's filters if they exist, otherwise return defaults.
    // The spread creates a new object so callers can't accidentally mutate
    // the store's internal state.
    return get().filters[gymId] ?? { ...DEFAULT_FILTERS };
  },

  setGradeMin: (gymId: string, value: number | undefined) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [gymId]: {
          // Start from existing filters or defaults for this gym
          ...DEFAULT_FILTERS,
          ...state.filters[gymId],
          gradeMin: value,
        },
      },
    }));
  },

  setGradeMax: (gymId: string, value: number | undefined) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [gymId]: {
          ...DEFAULT_FILTERS,
          ...state.filters[gymId],
          gradeMax: value,
        },
      },
    }));
  },

  setSortBy: (gymId: string, value: RouteSortBy) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [gymId]: {
          ...DEFAULT_FILTERS,
          ...state.filters[gymId],
          sortBy: value,
        },
      },
    }));
  },

  resetFilters: (gymId: string) => {
    set((state) => {
      // Create a shallow copy of the filters map and remove this gym's entry.
      // Next time getFilters is called, it'll return defaults.
      const updated = { ...state.filters };
      delete updated[gymId];
      return { filters: updated };
    });
  },
}));
