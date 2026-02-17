/**
 * Sessions Service — Ascent Logging & Session Aggregation
 *
 * This service handles persisting climbing ascents to the `route_ascents`
 * table and querying them back as aggregated session summaries. There is no
 * separate "sessions" table — a "session" is an implicit grouping of ascents
 * by the date they were logged. This keeps the schema simple and avoids
 * orphaned session rows.
 *
 * Two kinds of methods live here:
 *
 * 1. THIN WRAPPERS (createAscent, deleteAscent):
 *    Same pattern as savedRoutesService — build a PostgREST chain and return
 *    the thenable. No async, no business logic, just query construction.
 *
 * 2. AGGREGATION METHODS (getSessionSummary, getSessionHistory):
 *    These are `async` because PostgREST can't do GROUP BY aggregation.
 *    They fetch raw ascent rows (with a route join for grades) and then
 *    group/count/reduce them in JS. The aggregation is simple counting —
 *    not business logic — so it belongs in the service layer rather than
 *    utils/ (it's tightly coupled to the data shape coming from Supabase).
 *
 * The `route_ascents` table has RLS policies enforcing that users can only
 * INSERT/UPDATE/DELETE their own rows. Gamification triggers (streaks, badges,
 * leaderboards) fire automatically on INSERT and DELETE — the service doesn't
 * need to worry about those.
 */

import { supabase } from "@/lib/supabase";
import type { AscentStatus } from "@/lib/constants";

// Cast supabase.from() calls to `any` for the route_ascents table because
// database.types.ts hasn't been regenerated to include this table yet.
// The table exists in migrations — once `supabase gen types typescript --local`
// is run, these casts can be removed and the auto-generated types used instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromRouteAscents = () => (supabase as any).from("route_ascents");

// ── Types ────────────────────────────────────────────────────────────

/**
 * Input type for creating an ascent — maps the session store's PendingLog
 * fields to the snake_case columns in the `route_ascents` table.
 *
 * Why a separate type from PendingLog?
 * PendingLog has a client-generated `id` for UI removal; AscentLog uses
 * `userId` for the DB's `user_id` FK and adds `perceivedGrade` which the
 * store doesn't track (it's entered on the review screen before flush).
 */
export interface AscentLog {
  /** The authenticated user's ID — maps to route_ascents.user_id. */
  userId: string;
  /** Which route was climbed — maps to route_ascents.route_id. */
  routeId: string;
  /** Outcome of the attempt: flash, send, or attempt. */
  status: AscentStatus;
  /** Number of attempts on this route (≥ 1). */
  attempts: number;
  /** Optional free-text notes (beta tips, conditions, etc.). */
  notes?: string;
  /** User's perceived difficulty as a canonical grade integer (0–30). */
  perceivedGrade?: number;
}

/**
 * Row type matching the route_ascents table schema.
 *
 * Manually defined because database.types.ts hasn't been regenerated.
 * Mirrors the columns from the 20260205234337_core_tables migration.
 */
export interface Ascent {
  id: string;
  user_id: string;
  route_id: string;
  status: string;
  attempts: number;
  notes: string | null;
  perceived_grade: number | null;
  created_at: string;
}

/**
 * Aggregated summary for a single day's climbing session.
 *
 * Since there's no explicit "session" table, a session is all ascents
 * for a given user on a given date. The UI shows this on the session
 * review screen after ending a session, and in the logbook detail view.
 */
export interface SessionSummary {
  /** The date this session covers, formatted as YYYY-MM-DD. */
  date: string;
  /** Total number of ascent logs (all statuses). */
  totalAscents: number;
  /** Count of ascents with status "send". */
  sends: number;
  /** Count of ascents with status "flash" (first-try completions). */
  flashes: number;
  /** Count of ascents with status "attempt" (did not complete). */
  attempts: number;
  /**
   * Map of canonical grade → count of ascents at that grade.
   * Example: { 5: 2, 8: 1 } means 2 ascents at V2 and 1 at V5 (roughly).
   * Only includes grades that have at least one ascent.
   */
  gradeDistribution: Record<number, number>;
}

/**
 * One entry in the session history list (logbook screen).
 *
 * A lightweight per-date summary shown as a scrollable list: date, count,
 * sends/flashes, and the hardest grade climbed that day. Users tap an entry
 * to see the full SessionSummary detail.
 */
export interface SessionHistoryEntry {
  /** The date of this session, formatted as YYYY-MM-DD. */
  date: string;
  /** Total ascent logs for this date. */
  ascentCount: number;
  /** Count of "send" status ascents. */
  sends: number;
  /** Count of "flash" status ascents. */
  flashes: number;
  /** Highest canonical grade climbed this day, or null if no grades available. */
  topGrade: number | null;
}

// ── Internal Helpers ─────────────────────────────────────────────────

/**
 * Extract YYYY-MM-DD from an ISO 8601 timestamp string.
 *
 * Why substring instead of Date parsing?
 * ISO timestamps from Postgres always start with "YYYY-MM-DD". Parsing to
 * a Date and back risks timezone-shifting the date (e.g., a 23:30 UTC ascent
 * might become the next day in local time). substring is deterministic.
 */
function extractDate(isoTimestamp: string): string {
  return isoTimestamp.substring(0, 10);
}

/**
 * An ascent row with joined route info for display on the detail screen.
 *
 * When fetching raw ascents for a date (not aggregated), we need route
 * metadata (name, grade, color) to render each ascent card. The nested
 * `route` object comes from PostgREST resource embedding — it's a
 * server-side LEFT JOIN that avoids N+1 queries.
 */
export interface AscentWithRoute extends Ascent {
  route: {
    name: string;
    canonical_grade: number | null;
    color: string | null;
  } | null;
}

/**
 * One bar in the Grade Pyramid chart: a canonical grade and how many
 * successful ascents (sends + flashes) the user has at that grade.
 *
 * Sorted ascending by grade so the chart renders easiest grades at
 * the bottom and hardest at the top (typical pyramid shape).
 */
export interface GradePyramidEntry {
  /** Canonical grade integer (0–30). */
  grade: number;
  /** Number of sends + flashes at this grade. */
  count: number;
}

/**
 * One axis on the Style Insights radar chart: a tag name with the count
 * of distinct sent routes that have that tag, plus the tag's category
 * for grouping/coloring.
 *
 * The count represents "how many of YOUR sent routes are tagged as X",
 * not the total crowd vote count. This gives a personal climbing profile
 * rather than a gym-wide aggregate.
 */
export interface StyleInsightEntry {
  /** The tag name from the style_tags table (e.g., "slab", "crimpy"). */
  tagName: string;
  /** The tag's category (e.g., "angle", "hold_type", "movement"). */
  category: string;
  /** Number of distinct sent routes with this tag. */
  count: number;
}

// ── Service ──────────────────────────────────────────────────────────

export const sessionsService = {
  /**
   * Insert a new ascent row into route_ascents.
   *
   * Maps camelCase AscentLog fields to the table's snake_case columns.
   * Uses `.insert().select().single()` to return the created row — same
   * pattern as savedRoutesService.saveRoute().
   *
   * The database's `on_ascent_insert` trigger automatically updates
   * user_streaks, user_badges, and leaderboard_entries — no need to
   * handle gamification here.
   *
   * @param log - The ascent details to persist
   */
  createAscent(log: AscentLog) {
    return fromRouteAscents()
      .insert({
        user_id: log.userId,
        route_id: log.routeId,
        status: log.status,
        attempts: log.attempts,
        // Only include optional fields if provided. Supabase/PostgREST
        // treats `undefined` values as "don't include this column", so
        // the DB default (null) is used when these are omitted.
        notes: log.notes,
        perceived_grade: log.perceivedGrade,
      })
      .select()
      .single();
  },

  /**
   * Delete an ascent by its primary key.
   *
   * Used when a climber removes an ascent from their logbook. The DB's
   * `on_ascent_delete` trigger handles decrementing gamification counters.
   *
   * Unlike savedRoutesService.unsaveRoute which filters on 3 columns,
   * we only need the PK here since ascent IDs are globally unique UUIDs.
   *
   * @param id - The route_ascents.id UUID to delete
   */
  deleteAscent(id: string) {
    return fromRouteAscents().delete().eq("id", id);
  },

  /**
   * Fetch and aggregate all ascents for a user on a given date.
   *
   * This is an `async` method (not a thin wrapper) because PostgREST
   * can't do GROUP BY aggregation. It fetches raw rows with a route
   * join (for grade info) and reduces them into a SessionSummary.
   *
   * The select uses Supabase resource embedding to join routes:
   *   "*, route:routes(canonical_grade)"
   * This translates to a server-side LEFT JOIN that includes each route's
   * canonical_grade in the response as `{ route: { canonical_grade } }`.
   *
   * @param userId - The user whose ascents to fetch
   * @param date - The calendar date to summarize (only the date part is used)
   */
  async getSessionSummary(
    userId: string,
    date: Date
  ): Promise<SessionSummary> {
    // Compute the start and end of the target day in ISO 8601 format.
    // We use date-only strings (YYYY-MM-DD) as boundaries because
    // Postgres timestamptz handles timezone conversion on the server side.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const dayStart = `${dateStr}T00:00:00`;
    const dayEnd = `${dateStr}T23:59:59`;

    // Fetch ascents for this user on this date, with route grade info.
    // The resource embedding `route:routes(canonical_grade)` performs a
    // server-side JOIN so we get grade data without a second query.
    const { data, error } = await fromRouteAscents()
      .select("*, route:routes(canonical_grade)")
      .eq("user_id", userId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Aggregate the raw rows into a summary. Each row has a `status` field
    // (flash/send/attempt) and a nested `route.canonical_grade` number.
    const rows = data ?? [];
    let sends = 0;
    let flashes = 0;
    let attempts = 0;
    const gradeDistribution: Record<number, number> = {};

    for (const row of rows) {
      // Count by ascent status
      if (row.status === "send") sends++;
      else if (row.status === "flash") flashes++;
      else if (row.status === "attempt") attempts++;

      // Build grade distribution — only count grades we actually have.
      // The nested `route` object comes from the resource embedding join.
      const grade = row.route?.canonical_grade;
      if (grade != null) {
        gradeDistribution[grade] = (gradeDistribution[grade] ?? 0) + 1;
      }
    }

    return {
      date: dateStr,
      totalAscents: rows.length,
      sends,
      flashes,
      attempts,
      gradeDistribution,
    };
  },

  /**
   * Fetch all ascents for a user and group them by date for the logbook.
   *
   * Returns an array of SessionHistoryEntry objects sorted newest-first.
   * Each entry summarizes one day: ascent count, sends, flashes, and the
   * highest grade climbed.
   *
   * Like getSessionSummary, this is `async` because we need to group
   * rows by date in JS — PostgREST doesn't support GROUP BY.
   *
   * @param userId - The user whose history to fetch
   */
  async getSessionHistory(userId: string): Promise<SessionHistoryEntry[]> {
    // Fetch ALL ascents for this user, newest first, with route grades.
    // For users with thousands of ascents, this could be paginated later
    // (Phase 16), but for now the full fetch is fine for the logbook screen.
    const { data, error } = await fromRouteAscents()
      .select("*, route:routes(canonical_grade)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Group rows by date. We use a Map to preserve insertion order (newest
    // first, since the query is ordered by created_at DESC). Each key is
    // a YYYY-MM-DD string, each value is an array of ascent rows for that day.
    const groups = new Map<
      string,
      Array<{ status: string; route?: { canonical_grade: number | null } }>
    >();

    for (const row of data ?? []) {
      const dateKey = extractDate(row.created_at);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(row);
    }

    // Reduce each day's rows into a SessionHistoryEntry.
    const history: SessionHistoryEntry[] = [];

    for (const [dateKey, rows] of groups) {
      let sends = 0;
      let flashes = 0;
      let topGrade: number | null = null;

      for (const row of rows) {
        if (row.status === "send") sends++;
        else if (row.status === "flash") flashes++;

        // Track the highest grade climbed this day. Only update if the
        // current row's grade is higher than what we've seen so far.
        const grade = row.route?.canonical_grade;
        if (grade != null && (topGrade === null || grade > topGrade)) {
          topGrade = grade;
        }
      }

      history.push({
        date: dateKey,
        ascentCount: rows.length,
        sends,
        flashes,
        topGrade,
      });
    }

    // Already sorted newest-first because the query was ORDER BY created_at DESC
    // and Map preserves insertion order.
    return history;
  },

  /**
   * Fetch raw ascent rows for a user on a given date, with route info.
   *
   * Unlike getSessionSummary (which aggregates rows into counts),
   * this returns the individual ascent records for rendering on the
   * session detail screen. Each row includes joined route metadata
   * (name, grade, color) via PostgREST resource embedding.
   *
   * @param userId - The user whose ascents to fetch
   * @param date - The calendar date to query (only the date part is used)
   * @returns Array of ascents with nested route info, ordered by creation time
   */
  async getSessionAscents(
    userId: string,
    date: Date
  ): Promise<AscentWithRoute[]> {
    // Compute date boundaries — same logic as getSessionSummary.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const dayStart = `${dateStr}T00:00:00`;
    const dayEnd = `${dateStr}T23:59:59`;

    // Fetch ascents with route join — includes name, grade, and color
    // for rendering on the detail screen's ascent list.
    const { data, error } = await fromRouteAscents()
      .select("*, route:routes(name, canonical_grade, color)")
      .eq("user_id", userId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return (data ?? []) as AscentWithRoute[];
  },

  /**
   * Fetch send/flash ascents grouped by grade for the Grade Pyramid chart.
   *
   * Queries route_ascents with a route join for canonical_grade, filtering
   * to only successful completions (status IN ('send', 'flash')). Flashes
   * are included because they ARE sends — the climber completed the route
   * on first try. Attempts are excluded since they don't represent a
   * completed climb.
   *
   * The optional startDate/endDate params enable time-period filtering
   * (last month, 3 months, all time). When omitted, all ascents are included.
   *
   * Grouping by grade happens in JS (PostgREST can't GROUP BY), returning
   * an array of { grade, count } sorted ascending by grade.
   *
   * @param userId - The user whose pyramid to build
   * @param startDate - Optional ISO date string for the range start (inclusive)
   * @param endDate - Optional ISO date string for the range end (inclusive)
   */
  async getGradePyramid(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<GradePyramidEntry[]> {
    // Build the query chain. Start with user filter and status filter.
    // PostgREST's `.in()` generates a `WHERE status IN (...)` clause.
    let query = fromRouteAscents()
      .select("status, route:routes(canonical_grade)")
      .eq("user_id", userId)
      .in("status", ["send", "flash"]);

    // Apply optional date range filters. These are ISO date strings
    // like "2026-01-17T00:00:00" — Postgres handles the comparison.
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by canonical_grade in JS. We use a Map to count occurrences
    // of each grade. Rows with null grades (route deleted or no grade set)
    // are skipped — they can't be placed on the pyramid.
    const gradeCounts = new Map<number, number>();

    for (const row of data ?? []) {
      const grade = row.route?.canonical_grade;
      if (grade != null) {
        gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
      }
    }

    // Convert to array and sort ascending by grade (easiest → hardest).
    // This ordering is what the chart expects: bottom bars = easy grades.
    const entries: GradePyramidEntry[] = [];
    for (const [grade, count] of gradeCounts) {
      entries.push({ grade, count });
    }
    entries.sort((a, b) => a.grade - b.grade);

    return entries;
  },

  /**
   * Get the set of route IDs the user has successfully sent or flashed
   * at a specific gym.
   *
   * Used by the suggestions feature to exclude already-completed routes
   * from recommendations. Uses PostgREST's `!inner` join to filter
   * route_ascents rows to only those whose route belongs to the target gym.
   *
   * The `!inner` modifier makes this an INNER JOIN — rows where the route
   * doesn't match the gym filter are excluded entirely (not returned with
   * null route data). This is more efficient than fetching all ascents and
   * filtering client-side.
   *
   * @param userId - The user whose sent routes to look up
   * @param gymId - The gym to scope the lookup to
   * @returns Set of route_id strings for routes with send/flash status
   */
  async getSentRouteIds(userId: string, gymId: string): Promise<Set<string>> {
    // Use !inner join to filter by gym_id on the routes table.
    // This ensures we only get route_ascents whose route belongs to this gym.
    const { data, error } = await fromRouteAscents()
      .select("route_id, route:routes!inner(gym_id)")
      .eq("user_id", userId)
      .in("status", ["send", "flash"]);

    if (error) throw error;

    // Collect route_ids into a Set for O(1) lookup when filtering candidates.
    // Duplicates (same route sent multiple times) are automatically handled.
    const ids = new Set<string>();
    for (const row of data ?? []) {
      ids.add(row.route_id);
    }
    return ids;
  },

  /**
   * Fetch style tag distribution for a user's sent/flashed routes.
   *
   * Joins route_ascents → routes → route_style_tags → style_tags to find
   * which crowd-sourced tags appear on the routes the user has completed.
   * Groups by tag name in JS, counting distinct routes per tag.
   *
   * PostgREST resource embedding handles the multi-table join in a single
   * request:
   *   route_ascents → route:routes → route_style_tags → tag:style_tags
   *
   * The result powers the radar chart on the analytics dashboard (FR-E2),
   * showing the user's climbing style profile (e.g., heavy on overhangs,
   * light on slabs).
   *
   * @param userId - The user whose style profile to compute
   * @param startDate - Optional ISO date for range start (inclusive)
   * @param endDate - Optional ISO date for range end (inclusive)
   */
  async getStyleInsights(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<StyleInsightEntry[]> {
    // Build the query with nested resource embedding. PostgREST translates
    // this into JOINs: route_ascents → routes → route_style_tags → style_tags.
    // We only need the tag info from each route, not the full route data.
    let query = fromRouteAscents()
      .select(
        "route_id, route:routes(route_style_tags(tag:style_tags(name, category)))"
      )
      .eq("user_id", userId)
      .in("status", ["send", "flash"]);

    // Apply optional date range filters (same pattern as getGradePyramid).
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Count distinct routes per tag. We track which route_id has already
    // been counted for each tag to avoid double-counting if the user sent
    // the same route multiple times (e.g., re-sent after it was reset).
    const tagCounts = new Map<string, { category: string; routeIds: Set<string> }>();

    for (const row of data ?? []) {
      const routeId = row.route_id;
      const styleTags = row.route?.route_style_tags;
      if (!styleTags || !Array.isArray(styleTags)) continue;

      for (const rst of styleTags) {
        const tag = rst.tag;
        if (!tag?.name) continue;

        if (!tagCounts.has(tag.name)) {
          tagCounts.set(tag.name, {
            category: tag.category ?? "",
            routeIds: new Set(),
          });
        }

        // Add this route to the set — Set handles deduplication automatically.
        tagCounts.get(tag.name)!.routeIds.add(routeId);
      }
    }

    // Convert to array sorted by count descending (most prominent style first).
    const entries: StyleInsightEntry[] = [];
    for (const [tagName, { category, routeIds }] of tagCounts) {
      entries.push({ tagName, category, count: routeIds.size });
    }
    entries.sort((a, b) => b.count - a.count);

    return entries;
  },
};
