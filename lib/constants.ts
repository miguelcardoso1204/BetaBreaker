/**
 * App-Wide Domain Constants
 *
 * This file holds constants that define the business domain of Beta Breaker:
 * grade systems, user roles, scoring tiers, and other values that are
 * referenced throughout the codebase. Centralizing them here avoids
 * magic strings/numbers scattered across files.
 *
 * Note: Theme colors live in constants/Colors.ts (used by the UI layer).
 * This file is for domain-specific values (used by services, utils, hooks).
 *
 * These will be fleshed out in Phase 1 (Data Foundation) when we implement
 * grade conversion, streak calculation, and scoring logic.
 */

export const APP_NAME = "Beta Breaker";
