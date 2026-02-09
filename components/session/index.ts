/**
 * Session Components — Barrel Export
 *
 * Re-exports all session-related components and their prop types from
 * a single entry point. This lets consumers import everything they need
 * with one import statement:
 *
 * ```ts
 * import { QuickLogSheet, SessionTimer, SessionSummary } from "@/components/session";
 * ```
 *
 * WHY A BARREL FILE?
 * Without it, consumers need to know the exact file path for each component.
 * The barrel abstracts the internal file structure — components can be
 * reorganized (split, merged, renamed) without breaking consumer imports.
 */

export { QuickLogSheet } from "./QuickLogSheet";
export type { QuickLogSheetProps } from "./QuickLogSheet";

export { SessionTimer } from "./SessionTimer";
export type { SessionTimerProps } from "./SessionTimer";

export { SessionSummary } from "./SessionSummary";
export type { SessionSummaryProps } from "./SessionSummary";
