/**
 * Integration tests for social & community tables (Step 2.5).
 *
 * These tests verify:
 *   - 5 new tables: route_feedback, route_feedback_votes, route_media,
 *     content_reports, follows
 *   - RLS enabled on all 5 tables
 *   - 16 RLS policies controlling access (ownership-based)
 *   - CHECK constraints (vote direction, media type, report target_type/status)
 *   - CASCADE deletes (route/user deletion cascades to social data)
 *   - Self-follow prevention (follows CHECK constraint)
 *
 * Why these tables?
 * ─────────────────
 * The social layer adds route feedback (beta tips), media uploads, voting,
 * content reporting (moderation queue), and follow relationships between
 * climbers. These support:
 *   - FR-G2: Route feedback with beta tips and optional video
 *   - FR-G3: Abuse/spam reporting for moderation
 *   - FR-G5: Follow system for activity feeds
 *   - FR-K1: Content ownership affirmation on media uploads
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - All 5 migrations applied: `npx supabase db reset`
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
// Test Helpers (same patterns as previous test files)
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
 * Switches the Postgres session to act as an authenticated user.
 * Simulates PostgREST's behavior when a valid JWT is present.
 *
 * How this works:
 * - SET LOCAL role changes the session role to 'authenticated' (RLS checks this)
 * - request.jwt.claims and request.jwt.claim.sub are session variables that
 *   PostgREST sets from the decoded JWT. RLS policies read auth.uid() which
 *   internally reads request.jwt.claim.sub.
 * - LOCAL means these settings only last for the current transaction.
 */
async function setAuthenticatedUser(txClient: Client, userId: string): Promise<void> {
  await txClient.query(`SET LOCAL role = 'authenticated'`);
  await txClient.query(
    `SET LOCAL "request.jwt.claims" = '${JSON.stringify({
      sub: userId,
      role: 'authenticated',
    })}'`
  );
  await txClient.query(`SET LOCAL "request.jwt.claim.sub" = '${userId}'`);
}

/**
 * Resets the session back to the postgres superuser.
 * Needed after switching to authenticated to perform superuser-only operations.
 */
async function resetToSuperuser(txClient: Client): Promise<void> {
  await txClient.query('RESET role');
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

// ===========================================================================
// Test Suite: Social tables exist
// ===========================================================================

/**
 * Verify that all 5 social/community tables were created by the migration.
 * We query information_schema.tables — the standard SQL metadata catalog.
 */
describe('Social tables exist', () => {
  it.each([
    'route_feedback',
    'route_feedback_votes',
    'route_media',
    'content_reports',
    'follows',
  ])('table "%s" exists in public schema', async (tableName) => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    expect(result.rows).toHaveLength(1);
  });
});

// ===========================================================================
// Test Suite: RLS enabled on social tables
// ===========================================================================

/**
 * Verify that Row Level Security is enabled on all 5 social tables.
 * With RLS enabled but no policies, only superusers can access data.
 * The migration adds policies to grant controlled access.
 */
describe('RLS enabled on social tables', () => {
  it.each([
    'route_feedback',
    'route_feedback_votes',
    'route_media',
    'content_reports',
    'follows',
  ])('RLS is enabled on "%s"', async (tableName) => {
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tableName]
    );
    expect(result.rows).toHaveLength(1);
    // relrowsecurity is a boolean — true means RLS is enabled
    expect(result.rows[0].relrowsecurity).toBe(true);
  });
});

// ===========================================================================
// Test Suite: route_feedback
// ===========================================================================

/**
 * route_feedback stores beta tips and comments on routes (FR-G2).
 * Each row represents a piece of text feedback from a user about a route.
 * The `score` column is a denormalized vote tally (maintained at the app layer).
 */
describe('route_feedback', () => {
  it('user can insert a beta tip for a route', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'feedback-insert@test.com');
      const gymId = await createTestGym(client, 'Feedback Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Insert a beta tip — the kind of advice climbers share about a route
      const result = await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'Start with the left crimp, then dyno to the jug')
         RETURNING id, score`,
        [routeId, userId]
      );
      expect(result.rows).toHaveLength(1);
      // Score should default to 0 (no votes yet)
      expect(result.rows[0].score).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('score defaults to 0', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'feedback-score@test.com');
      const gymId = await createTestGym(client, 'Score Gym');
      const routeId = await createTestRoute(client, gymId, 5);

      // Insert without specifying score — should default to 0
      const result = await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'Great warmup route!')
         RETURNING score`,
        [routeId, userId]
      );
      expect(result.rows[0].score).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('feedback is deleted when route is deleted (CASCADE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'feedback-cascade-route@test.com');
      const gymId = await createTestGym(client, 'Cascade Route Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Insert feedback linked to the route
      await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'This tip will vanish')`,
        [routeId, userId]
      );

      // Delete the route — CASCADE should remove the feedback too
      await client.query('DELETE FROM routes WHERE id = $1', [routeId]);

      // Verify the feedback was automatically deleted
      const remaining = await client.query(
        'SELECT id FROM route_feedback WHERE route_id = $1',
        [routeId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('feedback is deleted when user is deleted (CASCADE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'feedback-cascade-user@test.com');
      const gymId = await createTestGym(client, 'Cascade User Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'This feedback will vanish with the user')`,
        [routeId, userId]
      );

      // Delete the auth.users row — cascades to profiles → route_feedback
      await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);

      const remaining = await client.query(
        'SELECT id FROM route_feedback WHERE user_id = $1',
        [userId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: route_feedback_votes
// ===========================================================================

/**
 * route_feedback_votes allows users to up/down vote beta tips.
 * The composite PK (feedback_id, user_id) enforces one vote per user per tip.
 * A CHECK constraint limits vote values to 'up' or 'down'.
 */
describe('route_feedback_votes', () => {
  it('user can vote up on feedback', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'vote-up@test.com');
      const voterId = await createTestUser(client, 'voter@test.com');
      const gymId = await createTestGym(client, 'Vote Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Create a feedback entry to vote on
      const feedbackResult = await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'Heel hook the volume')
         RETURNING id`,
        [routeId, userId]
      );
      const feedbackId = feedbackResult.rows[0].id;

      // Another user votes up — indicating the tip was helpful
      const voteResult = await client.query(
        `INSERT INTO route_feedback_votes (feedback_id, user_id, vote)
         VALUES ($1, $2, 'up')
         RETURNING vote`,
        [feedbackId, voterId]
      );
      expect(voteResult.rows).toHaveLength(1);
      expect(voteResult.rows[0].vote).toBe('up');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('duplicate vote (same user+feedback) rejected by PK constraint', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'vote-dup-author@test.com');
      const voterId = await createTestUser(client, 'vote-dup-voter@test.com');
      const gymId = await createTestGym(client, 'Dup Vote Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      const feedbackResult = await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'Match at the lip') RETURNING id`,
        [routeId, userId]
      );
      const feedbackId = feedbackResult.rows[0].id;

      // First vote succeeds
      await client.query(
        `INSERT INTO route_feedback_votes (feedback_id, user_id, vote)
         VALUES ($1, $2, 'up')`,
        [feedbackId, voterId]
      );

      // Second vote from same user on same feedback — PK violation
      await expect(
        client.query(
          `INSERT INTO route_feedback_votes (feedback_id, user_id, vote)
           VALUES ($1, $2, 'down')`,
          [feedbackId, voterId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('vote CHECK constraint rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'vote-invalid-author@test.com');
      const voterId = await createTestUser(client, 'vote-invalid-voter@test.com');
      const gymId = await createTestGym(client, 'Invalid Vote Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      const feedbackResult = await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'Knee bar rest') RETURNING id`,
        [routeId, userId]
      );
      const feedbackId = feedbackResult.rows[0].id;

      // 'sideways' is not a valid vote direction — CHECK constraint rejects it
      await expect(
        client.query(
          `INSERT INTO route_feedback_votes (feedback_id, user_id, vote)
           VALUES ($1, $2, 'sideways')`,
          [feedbackId, voterId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: route_media
// ===========================================================================

/**
 * route_media stores videos and images attached to routes (FR-G2).
 * The `type` column is constrained to 'video' or 'image'.
 * The `ownership_affirmed` boolean tracks FR-K1 compliance (content ownership).
 */
describe('route_media', () => {
  it('insert with type="video" succeeds', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'media-video@test.com');
      const gymId = await createTestGym(client, 'Media Video Gym');
      const routeId = await createTestRoute(client, gymId, 15);

      const result = await client.query(
        `INSERT INTO route_media (route_id, user_id, url, type, ownership_affirmed)
         VALUES ($1, $2, 'https://storage.example.com/beta.mp4', 'video', true)
         RETURNING id, type, ownership_affirmed`,
        [routeId, userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].type).toBe('video');
      // FR-K1: user affirmed they own this content
      expect(result.rows[0].ownership_affirmed).toBe(true);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('insert with type="image" succeeds', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'media-image@test.com');
      const gymId = await createTestGym(client, 'Media Image Gym');
      const routeId = await createTestRoute(client, gymId, 8);

      const result = await client.query(
        `INSERT INTO route_media (route_id, user_id, url, type)
         VALUES ($1, $2, 'https://storage.example.com/hold-photo.jpg', 'image')
         RETURNING id, type, ownership_affirmed`,
        [routeId, userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].type).toBe('image');
      // ownership_affirmed defaults to false when not specified
      expect(result.rows[0].ownership_affirmed).toBe(false);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('invalid type rejected by CHECK constraint', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'media-invalid@test.com');
      const gymId = await createTestGym(client, 'Media Invalid Gym');
      const routeId = await createTestRoute(client, gymId, 5);

      // 'audio' is not a valid media type — CHECK constraint rejects it
      await expect(
        client.query(
          `INSERT INTO route_media (route_id, user_id, url, type)
           VALUES ($1, $2, 'https://storage.example.com/beta.mp3', 'audio')`,
          [routeId, userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: content_reports
// ===========================================================================

/**
 * content_reports is the moderation queue (FR-G3). Users can report
 * videos, feedback, or other users for abuse/spam. Reports default to
 * 'pending' status and can be reviewed by admins (via service_role).
 *
 * target_id is a polymorphic FK — it can reference route_media,
 * route_feedback, or profiles depending on target_type. No FK constraint
 * on target_id because it's polymorphic; referential integrity is
 * enforced at the app layer.
 */
describe('content_reports', () => {
  it('user can insert a report; status defaults to "pending"', async () => {
    await client.query('BEGIN');
    try {
      const reporterId = await createTestUser(client, 'reporter@test.com');
      const targetUserId = await createTestUser(client, 'reported-user@test.com');

      // Report another user — status should default to 'pending'
      const result = await client.query(
        `INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
         VALUES ($1, 'user', $2, 'Inappropriate display name')
         RETURNING id, status`,
        [reporterId, targetUserId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('pending');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('target_type CHECK constraint accepts valid types', async () => {
    await client.query('BEGIN');
    try {
      const reporterId = await createTestUser(client, 'reporter-valid@test.com');
      // Use a random UUID as target_id — polymorphic FK has no constraint
      const fakeTargetId = '00000000-0000-0000-0000-000000000001';

      // All three valid target types should be accepted
      for (const targetType of ['video', 'feedback', 'user']) {
        const result = await client.query(
          `INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
           VALUES ($1, $2, $3, 'Test reason')
           RETURNING id`,
          [reporterId, targetType, fakeTargetId]
        );
        expect(result.rows).toHaveLength(1);
      }
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('invalid target_type rejected by CHECK constraint', async () => {
    await client.query('BEGIN');
    try {
      const reporterId = await createTestUser(client, 'reporter-invalid@test.com');

      // 'comment' is not a valid target_type — CHECK constraint rejects it
      await expect(
        client.query(
          `INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
           VALUES ($1, 'comment', gen_random_uuid(), 'Spam')`,
          [reporterId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: follows
// ===========================================================================

/**
 * The follows table implements the follow/friend system (FR-G5).
 * Composite PK (follower_id, following_id) prevents duplicate follows.
 * A CHECK constraint prevents self-follows (follower_id != following_id).
 */
describe('follows', () => {
  it('user A can follow user B', async () => {
    await client.query('BEGIN');
    try {
      const userA = await createTestUser(client, 'follower@test.com');
      const userB = await createTestUser(client, 'following@test.com');

      const result = await client.query(
        `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)
         RETURNING follower_id, following_id`,
        [userA, userB]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].follower_id).toBe(userA);
      expect(result.rows[0].following_id).toBe(userB);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('unfollow (delete) works', async () => {
    await client.query('BEGIN');
    try {
      const userA = await createTestUser(client, 'unfollow-a@test.com');
      const userB = await createTestUser(client, 'unfollow-b@test.com');

      // Follow then unfollow
      await client.query(
        `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)`,
        [userA, userB]
      );

      const deleteResult = await client.query(
        `DELETE FROM follows
         WHERE follower_id = $1 AND following_id = $2`,
        [userA, userB]
      );
      expect(deleteResult.rowCount).toBe(1);

      // Confirm the follow is gone
      const remaining = await client.query(
        `SELECT * FROM follows
         WHERE follower_id = $1 AND following_id = $2`,
        [userA, userB]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('self-follow rejected by CHECK constraint', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'narcissist@test.com');

      // Trying to follow yourself — CHECK (follower_id != following_id) rejects this
      await expect(
        client.query(
          `INSERT INTO follows (follower_id, following_id)
           VALUES ($1, $1)`,
          [userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('duplicate follow rejected by PK constraint', async () => {
    await client.query('BEGIN');
    try {
      const userA = await createTestUser(client, 'dup-follow-a@test.com');
      const userB = await createTestUser(client, 'dup-follow-b@test.com');

      // First follow succeeds
      await client.query(
        `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)`,
        [userA, userB]
      );

      // Second follow (same pair) — PK violation
      await expect(
        client.query(
          `INSERT INTO follows (follower_id, following_id)
           VALUES ($1, $2)`,
          [userA, userB]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS policies on social tables
// ===========================================================================

/**
 * Behavioral tests for the 16 RLS policies on social tables.
 * Pattern: create data as superuser → switch to authenticated → test access.
 *
 * Key principle: ownership-based access. Users can create/delete their own
 * rows but cannot impersonate others. Most data is publicly readable by
 * any authenticated user (needed for feeds, route detail screens).
 */
describe('RLS: social tables', () => {
  it('authenticated user can read feedback (SELECT)', async () => {
    await client.query('BEGIN');
    try {
      // Create data as superuser
      const authorId = await createTestUser(client, 'rls-fb-author@test.com');
      const readerId = await createTestUser(client, 'rls-fb-reader@test.com');
      const gymId = await createTestGym(client, 'RLS Feedback Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'Public beta tip')`,
        [routeId, authorId]
      );

      // Switch to a different authenticated user — should still see the feedback
      await setAuthenticatedUser(client, readerId);

      const result = await client.query(
        `SELECT body FROM route_feedback WHERE route_id = $1`,
        [routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].body).toBe('Public beta tip');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('authenticated user can insert own feedback', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-fb-insert@test.com');
      const gymId = await createTestGym(client, 'RLS Insert Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Switch to authenticated user before inserting
      await setAuthenticatedUser(client, userId);

      // Insert feedback with user_id matching auth.uid() — should succeed
      const result = await client.query(
        `INSERT INTO route_feedback (route_id, user_id, body)
         VALUES ($1, $2, 'My beta tip')
         RETURNING id`,
        [routeId, userId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot insert feedback as another user (cross-user rejected)', async () => {
    await client.query('BEGIN');
    try {
      const user1Id = await createTestUser(client, 'rls-fb-spoofer@test.com');
      const user2Id = await createTestUser(client, 'rls-fb-victim@test.com');
      const gymId = await createTestGym(client, 'RLS Spoof Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Switch to user1
      await setAuthenticatedUser(client, user1Id);

      // Try to insert feedback with user2's ID — WITH CHECK (user_id = auth.uid())
      // should reject this because user1 is the authenticated user, not user2.
      // Note: we don't call resetToSuperuser() after this because the expected
      // error puts the transaction into an aborted state. ROLLBACK in the
      // finally block handles cleanup regardless.
      await expect(
        client.query(
          `INSERT INTO route_feedback (route_id, user_id, body)
           VALUES ($1, $2, 'Spoofed tip')`,
          [routeId, user2Id]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('authenticated user can insert and delete own follows', async () => {
    await client.query('BEGIN');
    try {
      const userA = await createTestUser(client, 'rls-follow-a@test.com');
      const userB = await createTestUser(client, 'rls-follow-b@test.com');

      // Switch to userA
      await setAuthenticatedUser(client, userA);

      // Insert a follow with follower_id = auth.uid() — should succeed
      const insertResult = await client.query(
        `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)
         RETURNING follower_id`,
        [userA, userB]
      );
      expect(insertResult.rows).toHaveLength(1);

      // Delete own follow — should succeed
      const deleteResult = await client.query(
        `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
        [userA, userB]
      );
      expect(deleteResult.rowCount).toBe(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user can only see own content_reports (not other reporters)', async () => {
    await client.query('BEGIN');
    try {
      const reporter1 = await createTestUser(client, 'rls-report-1@test.com');
      const reporter2 = await createTestUser(client, 'rls-report-2@test.com');
      const targetId = await createTestUser(client, 'rls-report-target@test.com');

      // Both reporters file reports (as superuser)
      await client.query(
        `INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
         VALUES ($1, 'user', $2, 'Reporter 1 reason')`,
        [reporter1, targetId]
      );
      await client.query(
        `INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
         VALUES ($1, 'user', $2, 'Reporter 2 reason')`,
        [reporter2, targetId]
      );

      // Switch to reporter1 — should only see their own report
      await setAuthenticatedUser(client, reporter1);

      const result = await client.query(
        'SELECT reason FROM content_reports'
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].reason).toBe('Reporter 1 reason');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot follow as another user (cross-user rejected)', async () => {
    await client.query('BEGIN');
    try {
      const user1Id = await createTestUser(client, 'rls-follow-spoof1@test.com');
      const user2Id = await createTestUser(client, 'rls-follow-spoof2@test.com');
      const user3Id = await createTestUser(client, 'rls-follow-target@test.com');

      // Switch to user1
      await setAuthenticatedUser(client, user1Id);

      // Try to insert a follow where follower_id is user2 (not the auth user).
      // WITH CHECK (follower_id = auth.uid()) should reject this.
      // Note: no resetToSuperuser() needed — the expected error aborts the
      // transaction, and ROLLBACK in the finally block handles cleanup.
      await expect(
        client.query(
          `INSERT INTO follows (follower_id, following_id)
           VALUES ($1, $2)`,
          [user2Id, user3Id]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('authenticated user can read follows (public for follower counts)', async () => {
    await client.query('BEGIN');
    try {
      const userA = await createTestUser(client, 'rls-follows-read-a@test.com');
      const userB = await createTestUser(client, 'rls-follows-read-b@test.com');
      const userC = await createTestUser(client, 'rls-follows-reader@test.com');

      // Create a follow relationship (as superuser)
      await client.query(
        `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)`,
        [userA, userB]
      );

      // Switch to a third user — should be able to read follows
      // (needed for follower counts and "who follows whom" features)
      await setAuthenticatedUser(client, userC);

      const result = await client.query(
        `SELECT follower_id, following_id FROM follows
         WHERE follower_id = $1 AND following_id = $2`,
        [userA, userB]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
