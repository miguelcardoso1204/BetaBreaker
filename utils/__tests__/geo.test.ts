// utils/__tests__/geo.test.ts
//
// Tests for the Haversine distance and findNearestGym utilities.
//
// These are pure functions with no dependencies — the simplest kind of
// unit test. We verify:
//   1. Known distance between two real cities (Portland ↔ Bend)
//   2. Zero distance (same point returns 0)
//   3. findNearestGym picks the closest gym from a list
//   4. findNearestGym returns null for an empty list
//   5. findNearestGym returns null when all gyms lack coordinates

import { haversineDistance, findNearestGym } from "../geo";

// ── haversineDistance tests ──────────────────────────────────────

describe("haversineDistance", () => {
  it("calculates a known distance between Portland and Bend (~194 km)", () => {
    // Portland, OR: 45.5152° N, 122.6784° W
    // Bend, OR: 44.0582° N, 121.3153° W
    // Great-circle distance is approximately 194 km. Driving distance
    // is much longer (~280 km) due to mountain passes. We allow ±5 km
    // tolerance for floating-point and Earth-radius approximation.
    const distance = haversineDistance(
      45.5152, -122.6784, // Portland
      44.0582, -121.3153  // Bend
    );

    expect(distance).toBeGreaterThan(190);
    expect(distance).toBeLessThan(200);
  });

  it("returns 0 for the same point", () => {
    // Distance from a point to itself should be exactly 0.
    // This is a degenerate case where all sin/cos terms cancel out.
    const distance = haversineDistance(
      45.5152, -122.6784,
      45.5152, -122.6784
    );

    expect(distance).toBe(0);
  });

  it("handles antipodal points (max distance ~20,000 km)", () => {
    // Two points on opposite sides of the Earth should be roughly
    // half the Earth's circumference (~20,000 km). This tests the
    // full range of the formula.
    const distance = haversineDistance(0, 0, 0, 180);

    expect(distance).toBeGreaterThan(20000);
    expect(distance).toBeLessThan(20100);
  });
});

// ── findNearestGym tests ────────────────────────────────────────

describe("findNearestGym", () => {
  // Test gyms — Portland gym is closest to a Portland user,
  // Seattle gym is further away, no-coords gym is excluded.
  const testGyms = [
    {
      id: "gym-portland",
      name: "Portland Climbing",
      latitude: 45.5152,
      longitude: -122.6784,
    },
    {
      id: "gym-seattle",
      name: "Seattle Boulders",
      latitude: 47.6062,
      longitude: -122.3321,
    },
    {
      id: "gym-no-coords",
      name: "Mystery Gym",
      latitude: null,
      longitude: null,
    },
  ];

  it("picks the closest gym from the list", () => {
    // User is at Portland — Portland gym should be nearest (0 km away).
    // Seattle gym is ~230 km away, so Portland should win.
    const nearest = findNearestGym(45.5152, -122.6784, testGyms);

    expect(nearest).not.toBeNull();
    expect(nearest!.id).toBe("gym-portland");
  });

  it("returns null for an empty gym list", () => {
    // No gyms available — can't find a nearest one.
    const nearest = findNearestGym(45.5152, -122.6784, []);

    expect(nearest).toBeNull();
  });

  it("returns null when all gyms lack coordinates", () => {
    // If every gym has null lat/lon, none can be compared —
    // the function should return null instead of crashing.
    const noCoordGyms = [
      { id: "gym-a", latitude: null, longitude: null },
      { id: "gym-b", latitude: null, longitude: null },
    ];

    const nearest = findNearestGym(45.5152, -122.6784, noCoordGyms);

    expect(nearest).toBeNull();
  });

  it("skips gyms with null coordinates and picks from valid ones", () => {
    // Mix of valid and null-coord gyms. The null-coord gym should be
    // ignored, and the closest valid gym should be returned.
    const nearest = findNearestGym(47.6062, -122.3321, testGyms);

    // User is at Seattle coords — Seattle gym should be nearest.
    // The null-coord gym is skipped entirely.
    expect(nearest).not.toBeNull();
    expect(nearest!.id).toBe("gym-seattle");
  });
});
