/**
 * Leaderboard Scoring Logic — utils/scoring.ts
 *
 * Computes leaderboard scores for climbing gyms using three different models:
 *
 *   - hardest_grade  — The highest grade successfully climbed (flash or send).
 *     Rewards pushing limits. A single hard send outranks many easy ones.
 *
 *   - flash_rate     — Ratio of flashes to total successful ascents (0.0–1.0).
 *     Rewards reading routes well. A flash = completing a route on the first
 *     attempt, which requires good "beta reading" (figuring out the moves
 *     by looking at the wall, not by trial and error).
 *
 *   - volume         — Total count of successful ascents (flashes + sends).
 *     Rewards consistency and effort. Doesn't care about difficulty or style,
 *     just how many routes you completed.
 *
 * In all models, "attempts" (logged but incomplete climbs) are excluded.
 * Only "flash" and "send" count as successful ascents.
 *
 * The ranking system uses "standard competition ranking" (also called 1224):
 *   - Tied entries share the same rank
 *   - The next rank after a tie skips positions
 *   - Example: scores [20, 20, 15] → ranks [1, 1, 3] (not [1, 1, 2])
 *   - This is the same system used in Olympic climbing competitions
 *
 * Tie-breaking (optional):
 *   When two entries have the same score, an optional `tiebreaker` field
 *   determines order. Lower tiebreaker = better. This is typically the
 *   timestamp of the earliest ascent at the top grade (for hardest_grade
 *   model: "who climbed V6 first?"). When tiebreakers differ, entries
 *   receive distinct ranks even though their scores match.
 *
 * Period filtering:
 *   Leaderboards are time-scoped (e.g., "January 2026"). The filterByPeriod
 *   function uses inclusive boundaries: start <= loggedAt <= end.
 *
 * Architecture note:
 *   This module is pure TypeScript — no UI, no network, no database.
 *   It takes plain data and returns plain results, making it trivially
 *   testable and reusable across screens (leaderboard, profile stats,
 *   competition results). Grades are opaque integers here — no dependency
 *   on the grade conversion system (utils/grades.ts).
 */

/* ── Types ─────────────────────────────────────────────────────────────── */

/**
 * The three leaderboard scoring models supported by the app.
 *
 * Each gym can choose which model to use for their leaderboard, and
 * competitions may use different models for different rounds.
 *
 * - 'hardest_grade': Rewards pushing difficulty limits
 * - 'flash_rate':    Rewards efficient/clean climbing
 * - 'volume':        Rewards total completed routes
 */
export type ScoringModel = 'hardest_grade' | 'flash_rate' | 'volume';

/**
 * The three possible outcomes of a climb attempt:
 *
 * - 'flash': Completed the route on the very first attempt. This is the
 *   gold standard in climbing — you read the beta correctly and executed
 *   without falling. Counts as a successful ascent.
 *
 * - 'send': Completed the route, but NOT on the first attempt. The climber
 *   fell or rested on the rope at least once before reaching the top.
 *   Still counts as a successful ascent.
 *
 * - 'attempt': Did NOT complete the route. The climber tried but couldn't
 *   finish. Does NOT count toward any scoring model.
 */
export type AscentStatus = 'flash' | 'send' | 'attempt';

/**
 * A single climb record used for scoring calculations.
 *
 * This is a simplified view of the full ascent record from the database.
 * Only the fields needed for scoring are included — the service layer
 * maps the full DB record to this shape before passing it to scoring utils.
 *
 * @property grade    - Canonical grade integer (0–30). Higher = harder.
 * @property status   - Whether the climb was a flash, send, or attempt.
 * @property loggedAt - When the climb was recorded. Used for period filtering
 *                      and tiebreaker computation.
 */
export interface Ascent {
  grade: number;
  status: AscentStatus;
  loggedAt: Date;
}

/**
 * A single entry on a leaderboard, ready to be ranked.
 *
 * @property userId     - Unique identifier for the climber.
 * @property score      - Numeric score computed by computeScore().
 * @property tiebreaker - Optional. When two entries have the same score,
 *                        lower tiebreaker wins. Typically a timestamp (ms since
 *                        epoch) of the earliest ascent at the top grade. Only
 *                        meaningful for hardest_grade model; flash_rate and
 *                        volume ties stay tied if no tiebreaker is provided.
 */
export interface LeaderboardEntry {
  userId: string;
  score: number;
  tiebreaker?: number;
}

/**
 * A leaderboard entry with its computed rank.
 *
 * Extends LeaderboardEntry with a `rank` field assigned by rankLeaderboard().
 * Uses standard competition ranking (1224 system).
 *
 * @property rank - 1-based position. Tied entries share the same rank,
 *                  and the next rank after a tie skips positions.
 */
export interface RankedEntry extends LeaderboardEntry {
  rank: number;
}

/* ── Internal helper ───────────────────────────────────────────────────── */

/**
 * Filters an array of ascents to only include successful ones (flash + send).
 *
 * @internal Exported for testability, but not part of the public API contract.
 * Consumers should use computeScore() instead of calling this directly.
 *
 * Why a separate helper?
 * Every scoring model needs to exclude attempts before computing its score.
 * Rather than duplicating the filter logic in each model's code path, we
 * extract it here and call it once at the top of computeScore().
 *
 * @param ascents - Array of ascent records (may include attempts)
 * @returns New array containing only flashes and sends
 */
export function getSuccessfulAscents(ascents: Ascent[]): Ascent[] {
  // 'attempt' is the only status we exclude. Both 'flash' and 'send'
  // represent successfully topping a route, just with different styles.
  return ascents.filter((a) => a.status !== 'attempt');
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Computes a single numeric score from an array of ascents using the
 * specified scoring model.
 *
 * The flow:
 * 1. Filter out attempts → only successful ascents remain
 * 2. If no successful ascents → return 0 (nothing to score)
 * 3. Apply the model-specific formula:
 *    - hardest_grade: Math.max of all grades
 *    - flash_rate:    flashes.length / successful.length
 *    - volume:        successful.length
 *
 * @param ascents - Array of climb records to score (may include attempts)
 * @param model   - Which scoring formula to apply
 * @returns A numeric score. For hardest_grade: a grade integer (0–30).
 *          For flash_rate: a decimal (0.0–1.0). For volume: a count (0+).
 *
 * @example
 * const score = computeScore(userAscents, 'hardest_grade');
 * // → 15 (the user's hardest successful climb was canonical grade 15, i.e., V6)
 */
export function computeScore(ascents: Ascent[], model: ScoringModel): number {
  // Step 1: Remove attempts — only flashes and sends count
  const successful = getSuccessfulAscents(ascents);

  // Step 2: If no successful ascents, the score is 0 regardless of model.
  // This handles empty input AND "all attempts" input uniformly.
  if (successful.length === 0) {
    return 0;
  }

  // Step 3: Apply the model-specific scoring formula
  switch (model) {
    case 'hardest_grade':
      // Find the maximum grade among all successful ascents.
      // Math.max(...array) spreads the array into individual arguments.
      // Since we already checked for empty, this is safe (no -Infinity).
      return Math.max(...successful.map((a) => a.grade));

    case 'flash_rate':
      // Count flashes (first-attempt completions) among all successful ascents.
      // Division gives us a ratio: 0.0 (no flashes) to 1.0 (all flashes).
      // The UI layer will format this as a percentage for display.
      const flashes = successful.filter((a) => a.status === 'flash');
      return flashes.length / successful.length;

    case 'volume':
      // Simply count how many routes were completed successfully.
      // Both flashes and sends count equally — no bonus for flashing.
      return successful.length;
  }
}

/**
 * Filters ascents to only those within a date range (inclusive on both ends).
 *
 * Used to scope leaderboards to a specific period (e.g., "January 2026"
 * or "this week"). The boundaries are inclusive: an ascent logged at exactly
 * the start time or exactly the end time IS included.
 *
 * Why .getTime()?
 * JavaScript Date comparison with >= and <= works on Date objects, but
 * using .getTime() (milliseconds since epoch) is explicit and avoids any
 * potential coercion surprises. It also makes the comparison slightly faster
 * since we're comparing plain numbers instead of objects.
 *
 * @param ascents - Array of ascent records to filter
 * @param start   - Earliest date to include (inclusive)
 * @param end     - Latest date to include (inclusive)
 * @returns New array containing only ascents with loggedAt between start and end
 *
 * @example
 * const janAscents = filterByPeriod(allAscents, jan1, jan31);
 */
export function filterByPeriod(ascents: Ascent[], start: Date, end: Date): Ascent[] {
  // Convert boundaries to milliseconds once, then compare.
  // This avoids calling .getTime() on start/end for every iteration.
  const startMs = start.getTime();
  const endMs = end.getTime();

  return ascents.filter((a) => {
    const loggedMs = a.loggedAt.getTime();
    return loggedMs >= startMs && loggedMs <= endMs;
  });
}

/**
 * Ranks a leaderboard using standard competition ranking (1224 system).
 *
 * Algorithm:
 * 1. Sort entries by score descending (higher score = better).
 *    For entries with equal scores, sort by tiebreaker ascending
 *    (lower tiebreaker = better, e.g., earlier timestamp wins).
 * 2. Walk the sorted array and assign ranks:
 *    - First entry always gets rank 1.
 *    - If the current entry has the same score AND same tiebreaker (or both
 *      have no tiebreaker) as the previous entry, they share the same rank.
 *    - Otherwise, the rank equals the 1-based position (i + 1).
 *
 * The "1224" name comes from the pattern: if positions 1 and 2 are tied,
 * they both get rank 1, and the next entry gets rank 3 (skipping 2).
 * This is the standard used in Olympic competitions and climbing comps.
 *
 * @param entries - Array of leaderboard entries (userId + score + optional tiebreaker)
 * @returns New array of RankedEntry objects sorted by rank, with rank field added.
 *          Original entries are not mutated.
 *
 * @example
 * rankLeaderboard([
 *   { userId: 'alice', score: 20 },
 *   { userId: 'bob', score: 20 },
 *   { userId: 'carol', score: 15 },
 * ])
 * // → [
 * //   { userId: 'alice', score: 20, rank: 1 },
 * //   { userId: 'bob', score: 20, rank: 1 },
 * //   { userId: 'carol', score: 15, rank: 3 },
 * // ]
 */
export function rankLeaderboard(entries: LeaderboardEntry[]): RankedEntry[] {
  // Handle empty input early — no entries means no rankings
  if (entries.length === 0) {
    return [];
  }

  // Step 1: Sort entries.
  // Primary: score descending (higher = better).
  // Secondary: tiebreaker ascending (lower = better, e.g., earlier timestamp).
  // We spread into a new array to avoid mutating the input.
  const sorted = [...entries].sort((a, b) => {
    // Primary sort: higher score first
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Secondary sort: lower tiebreaker first (if both have one).
    // If only one has a tiebreaker, that one is ranked higher (rewarding
    // the extra data). If neither has a tiebreaker, they stay tied.
    const aTie = a.tiebreaker ?? Infinity;
    const bTie = b.tiebreaker ?? Infinity;
    return aTie - bTie;
  });

  // Step 2: Walk sorted array and assign ranks.
  // The first entry always gets rank 1. Subsequent entries either share
  // the previous rank (if same score and tiebreaker) or get a new rank
  // equal to their 1-based position.
  const ranked: RankedEntry[] = [{ ...sorted[0], rank: 1 }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];

    // Check if this entry is truly tied with the previous one.
    // "Truly tied" means same score AND same tiebreaker (or both undefined).
    const isTied =
      current.score === previous.score &&
      current.tiebreaker === previous.tiebreaker;

    // If tied: share the previous entry's rank.
    // If not tied: rank = position (i + 1), which naturally skips numbers
    // when there were ties above (e.g., two rank-1 entries → next is rank 3).
    const rank = isTied ? ranked[i - 1].rank : i + 1;
    ranked.push({ ...current, rank });
  }

  return ranked;
}
