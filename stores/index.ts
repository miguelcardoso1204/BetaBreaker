/**
 * Zustand Stores — Client-Only State
 *
 * Zustand is a lightweight state manager (no Providers, no boilerplate).
 * Stores in this directory hold ephemeral/UI state that does NOT come from
 * the database — things like:
 *   - Session timer (active climbing session duration)
 *   - Pending offline logs (queued for sync)
 *   - Active filters / sort selections
 *   - Bottom sheet visibility
 *
 * Why Zustand instead of React Context or Redux?
 * - No Provider wrappers needed — stores are plain functions
 * - Minimal boilerplate — a store is ~10 lines of code
 * - Selective re-renders — components subscribe to specific slices
 *
 * Server state (routes, ascents, leaderboards) lives in TanStack Query,
 * NOT here. Zustand is only for client-side ephemeral data.
 */

// Store exports will be added here as they are implemented in later phases.
export {};
