/**
 * Integration tests for multi-model leaderboard scoring (Step 9.1).
 *
 * These tests verify:
 *   - Schema changes: scoring_model column, CHECK constraint, UNIQUE constraint
 *   - compute_leaderboard() for all 3 scoring models (hardest_grade, flash_rate, volume)
 *   - Multi-model coexistence in the same gym/period
 *   - on_ascent_insert trigger creating entries for all 3 models
 *   - on_ascent_delete trigger adjusting all 3 models
 *   - get_enrolled_leaderboards() function (gym_name join, participant count, latest period)
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - All migrations applied: `npx supabase db reset`
 */

import { Client } from 'pg';

/**
 * Connection string for the local Supabase Postgres instance.
 * Port 54322 is the default for `supabase start`.
 */
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Shared client — connected once in beforeAll, closed in afterAll
let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

// ===========================================================================
// Test Helpers
// ===========================================================================

/**
 * Creates a test user in auth.users. The handle_new_user trigger
 * automatically creates a corresponding profile row.
 */
async function createTestUser(txClient: Client, email: string): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated', $1,
      crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', ''
    ) RETURNING id`,
    [email]
  );
  return result.rows[0].id;
}

/**
 * Creates a test gym. Returns the gym's UUID.
 */
async function createTestGym(txClient: Client, name: string): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO gyms (name, default_grade_system)
     VALUES ($1, 'v-scale') RETURNING id`,
    [name]
  );
  return result.rows[0].id;
}

/**
 * Creates a route at a gym with a specific grade. Returns the route's UUID.
 */
async function createTestRoute(
  txClient: Client,
  gymId: string,
  canonicalGrade: number,
): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO routes (gym_id, canonical_grade)
     VALUES ($1, $2) RETURNING id`,
    [gymId, canonicalGrade]
  );
  return result.rows[0].id;
}

/**
 * Inserts an ascent with an explicit created_at date.
 * @returns The ascent's UUID
 */
async function insertAscent(
  txClient: Client,
  userId: string,
  routeId: string,
  status: string,
  createdAt: Date,
): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO route_ascents (user_id, route_id, status, created_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, routeId, status, createdAt.toISOString()]
  );
  return result.rows[0].id;
}

/**
 * Returns a Date for a specific Monday (ISO week start).
 * Uses a fixed base date (2026-01-05, which is a Monday).
 */
function mondayOfWeek(weekNumber: number): Date {
  const base = new Date('2026-01-05T12:00:00Z');
  const result = new Date(base);
  result.setDate(base.getDate() + (weekNumber - 1) * 7);
  return result;
}

// ===========================================================================
// Test Suite: Schema Changes
// ===========================================================================

describe('Schema changes', () => {
  it('scoring_model column exists with NOT NULL and default', async () => {
    await client.query('BEGIN');
    try {
      // The scoring_model column should exist and have a NOT NULL constraint
      // with a default of 'hardest_grade'. We verify by checking the
      // information_schema for the column's metadata.
      const result = await client.query(`
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'leaderboard_entries'
          AND column_name = 'scoring_model'
      `);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].is_nullable).toBe('NO');
      expect(result.rows[0].column_default).toContain('hardest_grade');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('scoring_model CHECK constraint rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'schema-check@test.com');
      const gymId = await createTestGym(client, 'Schema Check Gym');

      // Attempting to insert an entry with an invalid scoring_model should
      // fail with a CHECK constraint violation.
      await expect(
        client.query(
          `INSERT INTO leaderboard_entries (gym_id, user_id, period, scoring_model, score, rank)
           VALUES ($1, $2, '2026-W01', 'invalid_model', 10, 1)`,
          [gymId, userId]
        )
      ).rejects.toThrow(/leaderboard_scoring_model_check/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('UNIQUE constraint includes scoring_model — allows same user in multiple models', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'schema-unique@test.com');
      const gymId = await createTestGym(client, 'Unique Constraint Gym');

      // Insert entries for the same user/gym/period but different models.
      // This should succeed because the UNIQUE constraint now includes scoring_model.
      await client.query(
        `INSERT INTO leaderboard_entries (gym_id, user_id, period, scoring_model, score, rank)
         VALUES ($1, $2, '2026-W01', 'hardest_grade', 15, 1)`,
        [gymId, userId]
      );
      await client.query(
        `INSERT INTO leaderboard_entries (gym_id, user_id, period, scoring_model, score, rank)
         VALUES ($1, $2, '2026-W01', 'flash_rate', 0.75, 1)`,
        [gymId, userId]
      );
      await client.query(
        `INSERT INTO leaderboard_entries (gym_id, user_id, period, scoring_model, score, rank)
         VALUES ($1, $2, '2026-W01', 'volume', 5, 1)`,
        [gymId, userId]
      );

      // Verify all 3 entries exist
      const result = await client.query(
        `SELECT scoring_model FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2 AND period = '2026-W01'
         ORDER BY scoring_model`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(3);
      expect(result.rows.map((r: { scoring_model: string }) => r.scoring_model)).toEqual(
        ['flash_rate', 'hardest_grade', 'volume']
      );
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: compute_leaderboard — hardest_grade
// ===========================================================================

describe('compute_leaderboard — hardest_grade', () => {
  it('computes MAX canonical_grade as score', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'hg-basic@test.com');
      const gymId = await createTestGym(client, 'HG Basic Gym');
      const route15 = await createTestRoute(client, gymId, 15);
      const route10 = await createTestRoute(client, gymId, 10);

      // Insert two ascents at different grades in the same period
      await insertAscent(client, userId, route15, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, route10, 'flash', mondayOfWeek(1));

      // The hardest_grade model should pick the MAX — which is 15
      const result = await client.query(
        `SELECT score, rank FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2 AND scoring_model = 'hardest_grade'`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(Number(result.rows[0].score)).toBe(15);
      expect(result.rows[0].rank).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('ranks correctly with ties (1224 ranking)', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'hg-tie1@test.com');
      const user2 = await createTestUser(client, 'hg-tie2@test.com');
      const user3 = await createTestUser(client, 'hg-tie3@test.com');
      const gymId = await createTestGym(client, 'HG Tie Gym');
      const route15 = await createTestRoute(client, gymId, 15);
      const route10 = await createTestRoute(client, gymId, 10);

      // Users 1 and 2 both send grade 15 (tied), user 3 sends grade 10
      await insertAscent(client, user1, route15, 'send', mondayOfWeek(1));
      await insertAscent(client, user2, route15, 'flash', mondayOfWeek(1));
      await insertAscent(client, user3, route10, 'send', mondayOfWeek(1));

      const result = await client.query(
        `SELECT user_id, score, rank FROM leaderboard_entries
         WHERE gym_id = $1 AND scoring_model = 'hardest_grade'
         ORDER BY rank ASC`,
        [gymId]
      );
      expect(result.rows).toHaveLength(3);

      const entry1 = result.rows.find((r: { user_id: string }) => r.user_id === user1);
      const entry2 = result.rows.find((r: { user_id: string }) => r.user_id === user2);
      const entry3 = result.rows.find((r: { user_id: string }) => r.user_id === user3);

      // Users 1 and 2 tied at score 15, both rank 1
      expect(Number(entry1.score)).toBe(15);
      expect(entry1.rank).toBe(1);
      expect(Number(entry2.score)).toBe(15);
      expect(entry2.rank).toBe(1);
      // User 3 at score 10, rank 3 (1224 — rank 2 is skipped)
      expect(Number(entry3.score)).toBe(10);
      expect(entry3.rank).toBe(3);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: compute_leaderboard — flash_rate
// ===========================================================================

describe('compute_leaderboard — flash_rate', () => {
  it('computes flash_count / total_sends as decimal 0.0–1.0', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'fr-basic@test.com');
      const gymId = await createTestGym(client, 'FR Basic Gym');
      const route1 = await createTestRoute(client, gymId, 10);
      const route2 = await createTestRoute(client, gymId, 12);
      const route3 = await createTestRoute(client, gymId, 14);
      const route4 = await createTestRoute(client, gymId, 8);

      // 2 flashes and 2 sends = flash_rate of 0.5
      await insertAscent(client, userId, route1, 'flash', mondayOfWeek(1));
      await insertAscent(client, userId, route2, 'flash', mondayOfWeek(1));
      await insertAscent(client, userId, route3, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, route4, 'send', mondayOfWeek(1));

      const result = await client.query(
        `SELECT score, rank FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2 AND scoring_model = 'flash_rate'`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(1);
      // 2 flashes out of 4 total = 0.5
      expect(Number(result.rows[0].score)).toBeCloseTo(0.5, 4);
      expect(result.rows[0].rank).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('all flash = 1.0 score', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'fr-all-flash@test.com');
      const gymId = await createTestGym(client, 'FR All Flash Gym');
      const route1 = await createTestRoute(client, gymId, 10);
      const route2 = await createTestRoute(client, gymId, 12);

      // All ascents are flashes — rate should be 1.0
      await insertAscent(client, userId, route1, 'flash', mondayOfWeek(1));
      await insertAscent(client, userId, route2, 'flash', mondayOfWeek(1));

      const result = await client.query(
        `SELECT score FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2 AND scoring_model = 'flash_rate'`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(Number(result.rows[0].score)).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('ranks by flash_rate DESC', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'fr-rank1@test.com');
      const user2 = await createTestUser(client, 'fr-rank2@test.com');
      const gymId = await createTestGym(client, 'FR Rank Gym');
      const route1 = await createTestRoute(client, gymId, 10);
      const route2 = await createTestRoute(client, gymId, 12);

      // User 1: 2 flashes, 0 sends → rate = 1.0
      await insertAscent(client, user1, route1, 'flash', mondayOfWeek(1));
      await insertAscent(client, user1, route2, 'flash', mondayOfWeek(1));
      // User 2: 1 flash, 1 send → rate = 0.5
      await insertAscent(client, user2, route1, 'flash', mondayOfWeek(1));
      await insertAscent(client, user2, route2, 'send', mondayOfWeek(1));

      const result = await client.query(
        `SELECT user_id, score, rank FROM leaderboard_entries
         WHERE gym_id = $1 AND scoring_model = 'flash_rate'
         ORDER BY rank ASC`,
        [gymId]
      );
      expect(result.rows).toHaveLength(2);

      const entry1 = result.rows.find((r: { user_id: string }) => r.user_id === user1);
      const entry2 = result.rows.find((r: { user_id: string }) => r.user_id === user2);

      // User 1 has higher flash rate → rank 1
      expect(Number(entry1.score)).toBe(1);
      expect(entry1.rank).toBe(1);
      // User 2 has lower flash rate → rank 2
      expect(Number(entry2.score)).toBeCloseTo(0.5, 4);
      expect(entry2.rank).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: compute_leaderboard — volume
// ===========================================================================

describe('compute_leaderboard — volume', () => {
  it('counts successful ascents (flash + send)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'vol-basic@test.com');
      const gymId = await createTestGym(client, 'Vol Basic Gym');
      const route1 = await createTestRoute(client, gymId, 10);
      const route2 = await createTestRoute(client, gymId, 12);
      const route3 = await createTestRoute(client, gymId, 14);

      // 1 flash + 1 send + 1 attempt = volume of 2 (attempts don't count)
      await insertAscent(client, userId, route1, 'flash', mondayOfWeek(1));
      await insertAscent(client, userId, route2, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, route3, 'attempt', mondayOfWeek(1));

      const result = await client.query(
        `SELECT score FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2 AND scoring_model = 'volume'`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(1);
      // Only flash + send count, so volume = 2
      expect(Number(result.rows[0].score)).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('ranks by count DESC', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'vol-rank1@test.com');
      const user2 = await createTestUser(client, 'vol-rank2@test.com');
      const gymId = await createTestGym(client, 'Vol Rank Gym');
      const route1 = await createTestRoute(client, gymId, 10);
      const route2 = await createTestRoute(client, gymId, 12);
      const route3 = await createTestRoute(client, gymId, 14);

      // User 1: 3 sends
      await insertAscent(client, user1, route1, 'send', mondayOfWeek(1));
      await insertAscent(client, user1, route2, 'send', mondayOfWeek(1));
      await insertAscent(client, user1, route3, 'send', mondayOfWeek(1));
      // User 2: 1 send
      await insertAscent(client, user2, route1, 'send', mondayOfWeek(1));

      const result = await client.query(
        `SELECT user_id, score, rank FROM leaderboard_entries
         WHERE gym_id = $1 AND scoring_model = 'volume'
         ORDER BY rank ASC`,
        [gymId]
      );
      expect(result.rows).toHaveLength(2);

      const entry1 = result.rows.find((r: { user_id: string }) => r.user_id === user1);
      const entry2 = result.rows.find((r: { user_id: string }) => r.user_id === user2);

      // User 1 with 3 sends ranks higher
      expect(Number(entry1.score)).toBe(3);
      expect(entry1.rank).toBe(1);
      expect(Number(entry2.score)).toBe(1);
      expect(entry2.rank).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Multi-model coexistence
// ===========================================================================

describe('Multi-model coexistence', () => {
  it('same gym/period has separate entries per scoring model', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'multi-model@test.com');
      const gymId = await createTestGym(client, 'Multi Model Gym');
      const route15 = await createTestRoute(client, gymId, 15);
      const route10 = await createTestRoute(client, gymId, 10);

      // 1 flash (grade 15) + 1 send (grade 10) — triggers all 3 models
      await insertAscent(client, userId, route15, 'flash', mondayOfWeek(1));
      await insertAscent(client, userId, route10, 'send', mondayOfWeek(1));

      // Should have exactly 3 entries — one per model
      const result = await client.query(
        `SELECT scoring_model, score FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2
         ORDER BY scoring_model`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(3);

      const models = result.rows.reduce(
        (acc: Record<string, number>, r: { scoring_model: string; score: string }) => {
          acc[r.scoring_model] = Number(r.score);
          return acc;
        },
        {} as Record<string, number>
      );

      // hardest_grade: MAX(15, 10) = 15
      expect(models.hardest_grade).toBe(15);
      // flash_rate: 1 flash out of 2 = 0.5
      expect(models.flash_rate).toBeCloseTo(0.5, 4);
      // volume: 2 successful ascents
      expect(models.volume).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: on_ascent_insert trigger
// ===========================================================================

describe('on_ascent_insert trigger', () => {
  it('creates entries for all 3 models', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-insert@test.com');
      const gymId = await createTestGym(client, 'Trigger Insert Gym');
      const routeId = await createTestRoute(client, gymId, 12);

      // A single ascent should create entries for all 3 scoring models
      await insertAscent(client, userId, routeId, 'flash', mondayOfWeek(1));

      const result = await client.query(
        `SELECT scoring_model FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2
         ORDER BY scoring_model`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(3);
      expect(result.rows.map((r: { scoring_model: string }) => r.scoring_model)).toEqual(
        ['flash_rate', 'hardest_grade', 'volume']
      );
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('ranks update correctly on second user ascent', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'trigger-rank1@test.com');
      const user2 = await createTestUser(client, 'trigger-rank2@test.com');
      const gymId = await createTestGym(client, 'Trigger Rank Gym');
      const route20 = await createTestRoute(client, gymId, 20);
      const route10 = await createTestRoute(client, gymId, 10);

      // User 1 sends grade 20
      await insertAscent(client, user1, route20, 'send', mondayOfWeek(1));
      // User 2 sends grade 10 — should be rank 2 in hardest_grade
      await insertAscent(client, user2, route10, 'send', mondayOfWeek(1));

      const result = await client.query(
        `SELECT user_id, rank FROM leaderboard_entries
         WHERE gym_id = $1 AND scoring_model = 'hardest_grade'
         ORDER BY rank ASC`,
        [gymId]
      );
      expect(result.rows).toHaveLength(2);

      const entry1 = result.rows.find((r: { user_id: string }) => r.user_id === user1);
      const entry2 = result.rows.find((r: { user_id: string }) => r.user_id === user2);

      expect(entry1.rank).toBe(1);
      expect(entry2.rank).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: on_ascent_delete trigger
// ===========================================================================

describe('on_ascent_delete trigger', () => {
  it('adjusts all 3 models on delete', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-delete@test.com');
      const gymId = await createTestGym(client, 'Trigger Delete Gym');
      const route15 = await createTestRoute(client, gymId, 15);
      const route5 = await createTestRoute(client, gymId, 5);

      // Insert two ascents: one flash grade 15, one send grade 5
      const hardAscentId = await insertAscent(client, userId, route15, 'flash', mondayOfWeek(1));
      await insertAscent(client, userId, route5, 'send', mondayOfWeek(1));

      // Before delete: hardest_grade=15, volume=2, flash_rate=0.5
      let result = await client.query(
        `SELECT scoring_model, score FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2
         ORDER BY scoring_model`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(3);
      const beforeScores = result.rows.reduce(
        (acc: Record<string, number>, r: { scoring_model: string; score: string }) => {
          acc[r.scoring_model] = Number(r.score);
          return acc;
        },
        {} as Record<string, number>
      );
      expect(beforeScores.hardest_grade).toBe(15);
      expect(beforeScores.volume).toBe(2);
      expect(beforeScores.flash_rate).toBeCloseTo(0.5, 4);

      // Delete the flash ascent (grade 15)
      await client.query(`DELETE FROM route_ascents WHERE id = $1`, [hardAscentId]);

      // After delete: hardest_grade=5, volume=1, flash_rate=0 (only a send remains)
      result = await client.query(
        `SELECT scoring_model, score FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2
         ORDER BY scoring_model`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(3);
      const afterScores = result.rows.reduce(
        (acc: Record<string, number>, r: { scoring_model: string; score: string }) => {
          acc[r.scoring_model] = Number(r.score);
          return acc;
        },
        {} as Record<string, number>
      );
      // Now only the grade-5 send remains
      expect(afterScores.hardest_grade).toBe(5);
      expect(afterScores.volume).toBe(1);
      expect(afterScores.flash_rate).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: get_enrolled_leaderboards()
// ===========================================================================

describe('get_enrolled_leaderboards()', () => {
  it('returns enriched data with gym_name', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'enrolled-name@test.com');
      const gymId = await createTestGym(client, 'Boulder Haven');
      const routeId = await createTestRoute(client, gymId, 12);

      // Create an ascent to populate leaderboard entries
      await insertAscent(client, userId, routeId, 'flash', mondayOfWeek(1));

      // Call the function and verify gym_name is populated
      const result = await client.query(
        `SELECT * FROM get_enrolled_leaderboards($1)`,
        [userId]
      );
      expect(result.rows.length).toBeGreaterThan(0);

      // Every row should have the gym name "Boulder Haven"
      const gymsReturned = result.rows.map((r: { gym_name: string }) => r.gym_name);
      expect(gymsReturned).toContain('Boulder Haven');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns total_participants count', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'enrolled-count1@test.com');
      const user2 = await createTestUser(client, 'enrolled-count2@test.com');
      const user3 = await createTestUser(client, 'enrolled-count3@test.com');
      const gymId = await createTestGym(client, 'Participant Count Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // 3 users log ascents in the same gym → total_participants = 3
      await insertAscent(client, user1, routeId, 'send', mondayOfWeek(1));
      await insertAscent(client, user2, routeId, 'flash', mondayOfWeek(1));
      await insertAscent(client, user3, routeId, 'send', mondayOfWeek(1));

      // Check from user1's perspective
      const result = await client.query(
        `SELECT total_participants, scoring_model FROM get_enrolled_leaderboards($1)
         ORDER BY scoring_model`,
        [user1]
      );
      // Should have 3 rows (one per model), each with 3 participants
      expect(result.rows).toHaveLength(3);
      result.rows.forEach((r: { total_participants: string }) => {
        expect(Number(r.total_participants)).toBe(3);
      });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns empty for user with no leaderboard entries', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'enrolled-empty@test.com');

      // User with no ascents should have no leaderboard entries
      const result = await client.query(
        `SELECT * FROM get_enrolled_leaderboards($1)`,
        [userId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns only the most recent period per gym per model', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'enrolled-recent@test.com');
      const gymId = await createTestGym(client, 'Recent Period Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Log ascents in two different weeks at the same gym
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, routeId, 'flash', mondayOfWeek(3));

      // The function should return only the latest period (week 3) per model
      const result = await client.query(
        `SELECT period, scoring_model FROM get_enrolled_leaderboards($1)
         ORDER BY scoring_model`,
        [userId]
      );

      // Should have 3 rows (one per model), all for the same latest period
      expect(result.rows).toHaveLength(3);

      // All returned periods should be the later week (week 3)
      const week3Label = '2026-W04'; // mondayOfWeek(3) = Jan 19 = ISO week 4
      result.rows.forEach((r: { period: string }) => {
        expect(r.period).toBe(week3Label);
      });
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Backward compatibility
// ===========================================================================

describe('Backward compatibility', () => {
  it('existing trigger chain still works end-to-end', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'compat-e2e@test.com');
      const gymId = await createTestGym(client, 'Compat Gym');
      const routeId = await createTestRoute(client, gymId, 20);

      // A simple ascent should still trigger the full chain:
      // streak recompute, badge check, consensus check, and leaderboard for all models
      await insertAscent(client, userId, routeId, 'flash', mondayOfWeek(1));

      // Verify streak was computed
      const streakResult = await client.query(
        `SELECT current_streak FROM user_streaks
         WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(streakResult.rows).toHaveLength(1);
      expect(streakResult.rows[0].current_streak).toBe(1);

      // Verify leaderboard entries exist for all 3 models
      const lbResult = await client.query(
        `SELECT scoring_model FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2
         ORDER BY scoring_model`,
        [gymId, userId]
      );
      expect(lbResult.rows).toHaveLength(3);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('querying with scoring_model filter works like old pattern', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'compat-query@test.com');
      const gymId = await createTestGym(client, 'Compat Query Gym');
      const routeId = await createTestRoute(client, gymId, 18);

      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));

      // The old gamificationService.getLeaderboard pattern queried by gym_id + period.
      // Adding a scoring_model filter should work and return only that model's entries.
      const periodLabel = '2026-W02'; // mondayOfWeek(1) = Jan 5 = ISO week 2
      const result = await client.query(
        `SELECT user_id, score, rank, scoring_model
         FROM leaderboard_entries
         WHERE gym_id = $1 AND period = $2 AND scoring_model = 'hardest_grade'
         ORDER BY rank`,
        [gymId, periodLabel]
      );
      expect(result.rows).toHaveLength(1);
      expect(Number(result.rows[0].score)).toBe(18);
      expect(result.rows[0].scoring_model).toBe('hardest_grade');
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
