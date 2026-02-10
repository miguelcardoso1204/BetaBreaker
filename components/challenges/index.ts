/**
 * Barrel export for challenge components (Step 8.4).
 *
 * Re-exports all challenge-related components from a single entry point.
 * This lets other files import from "@/components/challenges" instead of
 * importing from individual files — cleaner imports and easier refactoring.
 */

export { ChallengeCard } from "./ChallengeCard";
export { ChallengeProgress } from "./ChallengeProgress";
