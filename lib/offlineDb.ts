/**
 * Offline SQLite Database — lib/offlineDb.ts
 *
 * Pure SQLite CRUD wrapper for the offline action queue. This module has NO
 * knowledge of Zustand or React — it's a thin data-access layer that the
 * offlineStore calls for durable persistence.
 *
 * WHY A SEPARATE MODULE?
 * Separating SQLite operations from the Zustand store makes both easier to
 * test: the store tests mock this entire module, while future integration
 * tests can exercise SQLite directly. It also keeps the store focused on
 * in-memory state management.
 *
 * LAZY INITIALIZATION:
 * The database is opened lazily on the first call to `getDb()`. This means
 * importing this module in a Jest test doesn't trigger native SQLite code —
 * the test just mocks the exports. In production, the DB opens the first
 * time the app enqueues an action or calls `hydrate()`.
 *
 * SYNC API:
 * We use expo-sqlite's synchronous methods (runSync, getAllSync, execSync)
 * because queue operations are single-row and lightweight. There's no benefit
 * to async for inserting/deleting one row at a time, and sync code is simpler
 * to reason about (no race conditions, no Promise chains).
 */

import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { OFFLINE_DB_NAME } from '@/lib/constants';

// ── Types ────────────────────────────────────────────────────────

/**
 * Shape of a row in the `cached_routes` SQLite table.
 *
 * Each row caches a single route's full data (as a JSON string) along with
 * the gym it belongs to and when it was cached. This allows the app to serve
 * route lists from SQLite when the network is unavailable.
 *
 * Fields:
 *   id         — route UUID (matches the Supabase routes.id primary key)
 *   gym_id     — which gym this route belongs to (enables gym-scoped lookups)
 *   route_data — JSON string of the full route object from Supabase
 *   cached_at  — ISO 8601 timestamp of when this cache entry was written
 */
export interface CachedRouteRow {
  id: string;
  gym_id: string;
  route_data: string;
  cached_at: string;
}

/**
 * Shape of a row in the `offline_queue` SQLite table.
 *
 * Uses snake_case to match SQL column naming conventions. The offlineStore
 * maps these to camelCase when loading into the Zustand store.
 *
 * Fields:
 *   id          — UUID string (generated client-side, e.g., 'offline-<uuid>')
 *   action_type — what operation to replay ('log_ascent', 'delete_ascent')
 *   payload     — JSON string of the action's data (route ID, ascent status, etc.)
 *   created_at  — ISO 8601 timestamp of when the action was queued
 *   retry_count — how many times the sync engine has attempted this action
 */
export interface OfflineQueueRow {
  id: string;
  action_type: string;
  payload: string;
  created_at: string;
  retry_count: number;
}

// ── Lazy DB Singleton ────────────────────────────────────────────

/**
 * Cached database reference. Null until the first call to getDb().
 * Using a module-level variable ensures we only open the DB once per
 * app lifetime — expo-sqlite handles the underlying file locking.
 */
let db: SQLiteDatabase | null = null;

/**
 * Get (or create) the offline queue database.
 *
 * On first call, this:
 * 1. Opens (or creates) the SQLite file in the app's sandboxed directory
 * 2. Creates the `offline_queue` table if it doesn't already exist
 * 3. Caches the connection for subsequent calls
 *
 * The CREATE TABLE IF NOT EXISTS makes this idempotent — safe to call on
 * every app launch without migration worries for this simple schema.
 */
function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync(OFFLINE_DB_NAME);

    // Create the queue table. TEXT for id (UUID), action_type, payload (JSON),
    // and created_at (ISO string). INTEGER for retry_count with a default of 0.
    db.execSync(`
      CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Create the route cache table. Stores full route data as JSON strings
    // so the app can serve route lists when offline. gym_id enables scoped
    // lookups ("give me all cached routes for this gym"), and cached_at
    // enables TTL-based expiry (discard data older than 24 hours).
    db.execSync(`
      CREATE TABLE IF NOT EXISTS cached_routes (
        id TEXT PRIMARY KEY,
        gym_id TEXT NOT NULL,
        route_data TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );
    `);
  }
  return db;
}

// ── CRUD Operations ──────────────────────────────────────────────

/**
 * Insert a new action into the offline queue.
 *
 * Uses a parameterized query ($1, $2, ...) to prevent SQL injection —
 * even though our payloads are internally generated, it's good practice
 * to always use parameterized queries with user-adjacent data.
 */
export function insertQueueItem(item: OfflineQueueRow): void {
  getDb().runSync(
    'INSERT INTO offline_queue (id, action_type, payload, created_at, retry_count) VALUES ($1, $2, $3, $4, $5)',
    [item.id, item.action_type, item.payload, item.created_at, item.retry_count]
  );
}

/**
 * Delete a single action from the queue by its ID.
 *
 * Called by the sync engine after successfully replaying an action, or
 * by the user when manually discarding a failed action.
 */
export function deleteQueueItem(id: string): void {
  getDb().runSync('DELETE FROM offline_queue WHERE id = $1', [id]);
}

/**
 * Retrieve all queued actions, ordered by creation time (FIFO).
 *
 * ORDER BY created_at ASC ensures the sync engine replays actions in
 * the same order the user performed them — important for data consistency
 * (e.g., log ascent before delete ascent on the same route).
 */
export function getAllQueueItems(): OfflineQueueRow[] {
  return getDb().getAllSync<OfflineQueueRow>(
    'SELECT * FROM offline_queue ORDER BY created_at ASC'
  );
}

/**
 * Increment the retry count for a specific action.
 *
 * Called by the sync engine when an action fails (e.g., server 500).
 * Once retry_count reaches MAX_OFFLINE_RETRIES, the engine stops
 * automatically retrying that action.
 */
export function incrementRetryCount(id: string): void {
  getDb().runSync(
    'UPDATE offline_queue SET retry_count = retry_count + 1 WHERE id = $1',
    [id]
  );
}

/**
 * Delete all rows from the queue.
 *
 * Used for:
 * - Full reset during testing
 * - User-initiated "clear all pending" from settings
 * - After a successful full sync if all actions succeeded
 */
export function clearQueue(): void {
  getDb().execSync('DELETE FROM offline_queue');
}

// ── Route Cache Operations ──────────────────────────────────────────

/**
 * Replace all cached routes for a gym with a fresh set.
 *
 * This is an "atomic replace" strategy: first DELETE all existing rows for
 * the gym, then INSERT the new set. This ensures the cache always reflects
 * the last successful fetch — no stale routes lingering from a previous
 * fetch that returned different results.
 *
 * WHY DELETE + INSERT instead of UPSERT?
 * If a route was removed from the API response (e.g., archived between fetches),
 * an UPSERT would leave the old row in the cache. DELETE + INSERT guarantees
 * the cache exactly mirrors what the server returned.
 */
export function upsertCachedRoutes(gymId: string, rows: CachedRouteRow[]): void {
  const database = getDb();

  // Remove all existing cached routes for this gym first
  database.runSync('DELETE FROM cached_routes WHERE gym_id = $1', [gymId]);

  // Insert each route from the fresh fetch result
  for (const row of rows) {
    database.runSync(
      'INSERT INTO cached_routes (id, gym_id, route_data, cached_at) VALUES ($1, $2, $3, $4)',
      [row.id, row.gym_id, row.route_data, row.cached_at]
    );
  }
}

/**
 * Retrieve all cached routes for a specific gym.
 *
 * Returns rows ordered by cached_at DESC (newest cache entries first).
 * The caller (routeCache.ts) is responsible for checking the TTL and
 * deserializing the JSON route_data back into route objects.
 */
export function getCachedRoutesByGym(gymId: string): CachedRouteRow[] {
  return getDb().getAllSync<CachedRouteRow>(
    'SELECT * FROM cached_routes WHERE gym_id = $1 ORDER BY cached_at DESC',
    [gymId]
  );
}

/**
 * Delete all cached routes across all gyms.
 *
 * Used for:
 * - Logout (clear user-specific cached data)
 * - Manual cache reset from settings
 * - Testing cleanup
 */
export function clearCachedRoutes(): void {
  getDb().execSync('DELETE FROM cached_routes');
}
