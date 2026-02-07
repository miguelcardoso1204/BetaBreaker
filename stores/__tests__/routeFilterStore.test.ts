/**
 * Route Filter Store Tests
 *
 * Tests the Zustand store that holds per-gym route filter state.
 * Each test resets the store to a clean state before running to
 * prevent cross-test contamination.
 *
 * Because Zustand stores are plain JavaScript (no React providers),
 * we can test them by calling actions directly and reading state
 * with getState() — no rendering or act() needed.
 */

import { useRouteFilterStore } from "../routeFilterStore";

describe("routeFilterStore", () => {
  // Reset the store before each test. We merge `{ filters: {} }` into the
  // existing state to clear gym-specific filters while keeping the actions
  // intact. Using `replace: true` would wipe out the action functions.
  beforeEach(() => {
    useRouteFilterStore.setState({ filters: {} });
  });

  it("returns default filters for an unknown gymId", () => {
    // When no filters have been set for a gym, getFilters should return
    // sensible defaults: no grade bounds, sort by newest.
    const filters = useRouteFilterStore.getState().getFilters("unknown-gym");

    expect(filters).toEqual({
      sortBy: "newest",
    });
    // Specifically verify no grade bounds are set
    expect(filters.gradeMin).toBeUndefined();
    expect(filters.gradeMax).toBeUndefined();
  });

  it("persists gradeMin and gradeMax per gym", () => {
    const { setGradeMin, setGradeMax, getFilters } =
      useRouteFilterStore.getState();

    // Set filters for gym-a
    setGradeMin("gym-a", 5);
    setGradeMax("gym-a", 20);

    // Set different filters for gym-b
    setGradeMin("gym-b", 10);

    // Verify gym-a has its own filters
    const filtersA = useRouteFilterStore.getState().getFilters("gym-a");
    expect(filtersA.gradeMin).toBe(5);
    expect(filtersA.gradeMax).toBe(20);

    // Verify gym-b has independent filters (gradeMax should be undefined)
    const filtersB = useRouteFilterStore.getState().getFilters("gym-b");
    expect(filtersB.gradeMin).toBe(10);
    expect(filtersB.gradeMax).toBeUndefined();
  });

  it("switches sortBy between newest and grade", () => {
    const { setSortBy } = useRouteFilterStore.getState();

    // Default is "newest"
    expect(useRouteFilterStore.getState().getFilters("gym-1").sortBy).toBe(
      "newest"
    );

    // Switch to grade sort
    setSortBy("gym-1", "grade");
    expect(useRouteFilterStore.getState().getFilters("gym-1").sortBy).toBe(
      "grade"
    );

    // Switch back to newest
    setSortBy("gym-1", "newest");
    expect(useRouteFilterStore.getState().getFilters("gym-1").sortBy).toBe(
      "newest"
    );
  });

  it("resets filters back to defaults for a specific gym", () => {
    const { setGradeMin, setGradeMax, setSortBy, resetFilters } =
      useRouteFilterStore.getState();

    // Set up some filters for two gyms
    setGradeMin("gym-a", 5);
    setGradeMax("gym-a", 20);
    setSortBy("gym-a", "grade");

    setGradeMin("gym-b", 10);

    // Reset only gym-a
    resetFilters("gym-a");

    // gym-a should be back to defaults
    const filtersA = useRouteFilterStore.getState().getFilters("gym-a");
    expect(filtersA).toEqual({ sortBy: "newest" });
    expect(filtersA.gradeMin).toBeUndefined();
    expect(filtersA.gradeMax).toBeUndefined();

    // gym-b should be unaffected
    const filtersB = useRouteFilterStore.getState().getFilters("gym-b");
    expect(filtersB.gradeMin).toBe(10);
  });
});
