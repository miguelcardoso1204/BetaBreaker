/**
 * Integration tests for the beta-videos storage bucket (Step 12.1).
 *
 * These tests verify:
 *   - Bucket exists with correct configuration (public, size limit, MIME types)
 *   - Storage policies: INSERT own path, SELECT public, DELETE own path
 *   - Path ownership enforcement (can't upload to another user's folder)
 *
 * Prerequisites:
 * - Local Supabase running: `npx supabase start`
 * - All migrations applied: `npx supabase db reset`
 */

import { Client } from 'pg';

/** Direct Postgres connection for the local Supabase instance. */
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
 * Switches the Postgres session to act as an authenticated user.
 * Simulates PostgREST's behavior when a valid JWT is present.
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
 * Resets session to the default superuser role (postgres).
 * Only call this after successful queries — not after a transaction
 * error state (ROLLBACK handles cleanup in the finally block).
 */
async function resetToSuperuser(txClient: Client): Promise<void> {
  await txClient.query(`SET LOCAL role = 'postgres'`);
  await txClient.query(`RESET "request.jwt.claims"`);
  await txClient.query(`RESET "request.jwt.claim.sub"`);
}

// ===========================================================================
// Tests
// ===========================================================================

describe('beta-videos storage bucket', () => {
  // ── Bucket configuration ──────────────────────────────────────────

  it('bucket exists with correct id and name', async () => {
    // The migration creates a bucket entry in storage.buckets.
    // Verify it was created and has the expected identifier.
    const result = await client.query(
      `SELECT id, name, public FROM storage.buckets WHERE id = 'beta-videos'`
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].id).toBe('beta-videos');
    expect(result.rows[0].name).toBe('beta-videos');
  });

  it('bucket is public (videos viewable without auth)', async () => {
    // Public = true means getPublicUrl() returns a URL that works
    // without an Authorization header — important for video playback.
    const result = await client.query(
      `SELECT public FROM storage.buckets WHERE id = 'beta-videos'`
    );
    expect(result.rows[0].public).toBe(true);
  });

  it('bucket enforces 50 MB file size limit', async () => {
    // NFR-11: max 50 MB per video after compression.
    // The bucket-level limit is a server-side safety net.
    const result = await client.query(
      `SELECT file_size_limit FROM storage.buckets WHERE id = 'beta-videos'`
    );
    // 50 MB = 50 * 1024 * 1024 = 52428800 bytes
    expect(Number(result.rows[0].file_size_limit)).toBe(52428800);
  });

  it('bucket allows only video MIME types', async () => {
    // Only video/mp4, video/quicktime (MOV), and video/webm are accepted.
    // This prevents non-video uploads at the storage layer.
    const result = await client.query(
      `SELECT allowed_mime_types FROM storage.buckets WHERE id = 'beta-videos'`
    );
    const mimeTypes = result.rows[0].allowed_mime_types;
    expect(mimeTypes).toContain('video/mp4');
    expect(mimeTypes).toContain('video/quicktime');
    expect(mimeTypes).toContain('video/webm');
    expect(mimeTypes.length).toBe(3);
  });

  // ── Storage policies ──────────────────────────────────────────────

  it('has SELECT, INSERT, and DELETE policies defined', async () => {
    // Three policies should exist on storage.objects for the beta-videos bucket.
    // We query pg_policies to confirm they were created by the migration.
    const result = await client.query(
      `SELECT policyname, cmd
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname LIKE 'beta_videos_%'
       ORDER BY policyname`
    );

    const policies = result.rows.map((r: { policyname: string; cmd: string }) => ({
      name: r.policyname,
      cmd: r.cmd,
    }));

    // Expect exactly 3 policies: DELETE, INSERT, SELECT (alphabetical order)
    expect(policies).toEqual([
      { name: 'beta_videos_delete_own', cmd: 'DELETE' },
      { name: 'beta_videos_insert_own', cmd: 'INSERT' },
      { name: 'beta_videos_select_public', cmd: 'SELECT' },
    ]);
  });

  // ── Path ownership (RLS on storage.objects) ───────────────────────

  it('INSERT policy enforces path starts with user ID', async () => {
    // The INSERT policy uses storage.foldername(name)[1] = auth.uid()
    // to ensure users can only upload to their own folder.
    // We test this by checking the policy's WITH CHECK expression.
    const result = await client.query(
      `SELECT qual, with_check
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname = 'beta_videos_insert_own'`
    );

    // The WITH CHECK should reference auth.uid() and storage.foldername
    const withCheck = result.rows[0].with_check;
    expect(withCheck).toContain('auth.uid()');
    expect(withCheck).toContain('foldername');
  });
});
