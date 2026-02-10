/**
 * Route Cache Tests — lib/__tests__/routeCache.test.ts
 *
 * Tests for the routeCache module, which provides business logic on top of
 * the raw SQLite CRUD in offlineDb. The cache enables offline route browsing:
 *   1. On a successful network fetch, routes are written to SQLite
 *   2. On a network failure, routes are read back from SQLite (if fresh)
 *
 * Mock strategy: We mock offlineDb entirely. The routeCache module is a pure
 * logic layer — it serializes/deserializes JSON, checks TTL timestamps, and
 * delegates storage to offlineDb. We don't need a real SQLite database here.
 *
 * TTL behavior: Cached data expires after ROUTE_CACHE_TTL_MS (24 hours).
 * getCachedRoutes() checks the cached_at timestamp of the first row against
 * the current time. If expired, it returns null (forcing a fresh fetch).
 */

import { ROUTE_CACHE_TTL_MS } from '@/lib/constants';

// ── Mock offlineDb ─────────────────────────────────────────────────
// We mock the entire module so no real SQLite calls are made.
// Each test configures the mock return values as needed.
jest.mock('@/lib/offlineDb', () => ({
  upsertCachedRoutes: jest.fn(),
  getCachedRoutesByGym: jest.fn(),
  clearCachedRoutes: jest.fn(),
}));

import { cacheRoutes, getCachedRoutes, clearRouteCache } from '../routeCache';

const offlineDb = jest.requireMock<{
  upsertCachedRoutes: jest.Mock;
  getCachedRoutesByGym: jest.Mock;
  clearCachedRoutes: jest.Mock;
}>('@/lib/offlineDb');

// ── Fixtures ───────────────────────────────────────────────────────

/** Minimal route objects that mimic what Supabase returns from the routes table. */
const mockRoutes = [
  {
    id: 'route-1',
    gym_id: 'gym-A',
    name: 'Baby Steps',
    canonical_grade: 0,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'route-2',
    gym_id: 'gym-A',
    name: 'The Crimp',
    canonical_grade: 10,
    status: 'active',
    created_at: '2026-01-02T00:00:00Z',
  },
];

describe('routeCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Date.now to a known value so TTL checks are deterministic.
    // Using a real-ish timestamp avoids the falsy-zero gotcha.
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── cacheRoutes ──────────────────────────────────────────────────

  it('serializes and stores routes via upsertCachedRoutes', () => {
    // GIVEN: A set of route objects from a successful Supabase fetch
    // WHEN: cacheRoutes is called with a gymId and those routes
    // THEN: It should call upsertCachedRoutes with CachedRouteRow objects
    //       where route_data is the JSON-stringified route
    cacheRoutes('gym-A', mockRoutes);

    expect(offlineDb.upsertCachedRoutes).toHaveBeenCalledTimes(1);
    const [gymId, rows] = offlineDb.upsertCachedRoutes.mock.calls[0];

    expect(gymId).toBe('gym-A');
    expect(rows).toHaveLength(2);

    // Each row should have the route's id, the gym_id, stringified route data,
    // and a cached_at timestamp matching Date.now()'s mocked value.
    expect(rows[0]).toEqual({
      id: 'route-1',
      gym_id: 'gym-A',
      route_data: JSON.stringify(mockRoutes[0]),
      cached_at: new Date(1_700_000_000_000).toISOString(),
    });
    expect(rows[1]).toEqual({
      id: 'route-2',
      gym_id: 'gym-A',
      route_data: JSON.stringify(mockRoutes[1]),
      cached_at: new Date(1_700_000_000_000).toISOString(),
    });
  });

  // ── getCachedRoutes ──────────────────────────────────────────────

  it('returns parsed routes when cache is fresh', () => {
    // GIVEN: Cached rows with a recent cached_at timestamp (within TTL)
    // WHEN: getCachedRoutes is called
    // THEN: It should deserialize the JSON route_data and return route objects
    const freshTimestamp = new Date(1_700_000_000_000 - 1000).toISOString(); // 1 second ago

    offlineDb.getCachedRoutesByGym.mockReturnValue([
      { id: 'route-1', gym_id: 'gym-A', route_data: JSON.stringify(mockRoutes[0]), cached_at: freshTimestamp },
      { id: 'route-2', gym_id: 'gym-A', route_data: JSON.stringify(mockRoutes[1]), cached_at: freshTimestamp },
    ]);

    const result = getCachedRoutes('gym-A');

    expect(result).toEqual(mockRoutes);
    expect(offlineDb.getCachedRoutesByGym).toHaveBeenCalledWith('gym-A');
  });

  it('returns null when cache is expired (older than TTL)', () => {
    // GIVEN: Cached rows with a cached_at timestamp older than ROUTE_CACHE_TTL_MS
    // WHEN: getCachedRoutes is called
    // THEN: It should return null, signaling that the cache is stale
    const expiredTimestamp = new Date(
      1_700_000_000_000 - ROUTE_CACHE_TTL_MS - 1000 // 24 hours + 1 second ago
    ).toISOString();

    offlineDb.getCachedRoutesByGym.mockReturnValue([
      { id: 'route-1', gym_id: 'gym-A', route_data: JSON.stringify(mockRoutes[0]), cached_at: expiredTimestamp },
    ]);

    const result = getCachedRoutes('gym-A');

    expect(result).toBeNull();
  });

  it('returns null when no cached rows exist', () => {
    // GIVEN: No rows in the cache for the requested gym
    // WHEN: getCachedRoutes is called
    // THEN: It should return null (nothing to fall back to)
    offlineDb.getCachedRoutesByGym.mockReturnValue([]);

    const result = getCachedRoutes('gym-A');

    expect(result).toBeNull();
  });

  it('respects gym scope — routes for another gym are not returned', () => {
    // GIVEN: Routes are cached for gym-A
    // WHEN: getCachedRoutes is called for gym-B
    // THEN: offlineDb is queried with gym-B and returns nothing → null
    // This verifies the gym_id scoping works correctly.
    offlineDb.getCachedRoutesByGym.mockReturnValue([]);

    const result = getCachedRoutes('gym-B');

    expect(result).toBeNull();
    // Confirm the query was scoped to gym-B, not gym-A
    expect(offlineDb.getCachedRoutesByGym).toHaveBeenCalledWith('gym-B');
  });

  it('cacheRoutes replaces previous cache for same gym', () => {
    // GIVEN: cacheRoutes is called twice for the same gym
    // WHEN: The second call overwrites the first
    // THEN: upsertCachedRoutes is called twice with the same gymId
    //       (the DELETE + INSERT strategy in offlineDb handles the actual replace)
    const updatedRoutes = [{ id: 'route-3', gym_id: 'gym-A', name: 'New Route', canonical_grade: 5, status: 'active', created_at: '2026-02-01T00:00:00Z' }];

    cacheRoutes('gym-A', mockRoutes);
    cacheRoutes('gym-A', updatedRoutes);

    expect(offlineDb.upsertCachedRoutes).toHaveBeenCalledTimes(2);

    // Second call should contain only the new route (not the old ones)
    const secondCallRows = offlineDb.upsertCachedRoutes.mock.calls[1][1];
    expect(secondCallRows).toHaveLength(1);
    expect(secondCallRows[0].id).toBe('route-3');
  });

  // ── clearRouteCache ──────────────────────────────────────────────

  it('delegates to clearCachedRoutes in offlineDb', () => {
    // GIVEN/WHEN: clearRouteCache is called
    // THEN: It should forward the call to offlineDb.clearCachedRoutes()
    clearRouteCache();

    expect(offlineDb.clearCachedRoutes).toHaveBeenCalledTimes(1);
  });
});
