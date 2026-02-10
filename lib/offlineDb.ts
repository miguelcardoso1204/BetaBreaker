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
