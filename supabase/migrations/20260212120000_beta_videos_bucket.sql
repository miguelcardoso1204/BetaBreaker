-- ==========================================================================
-- Migration: Beta Videos Storage Bucket (Step 12.1)
-- ==========================================================================
-- Creates a Supabase Storage bucket for beta video uploads.
-- Videos are stored at: beta-videos/<user_id>/<route_id>/<timestamp>.<ext>
--
-- Bucket config:
--   - Public: true (anyone can view via public URL)
--   - Max file size: 50 MB (NFR-11)
--   - Allowed MIME types: mp4, quicktime (MOV), webm
--
-- Storage policies (RLS for storage.objects):
--   - SELECT: public read (videos are viewable by everyone)
--   - INSERT: authenticated users, path must start with their user ID
--   - DELETE: authenticated users can remove their own uploads
-- ==========================================================================

-- Create the bucket for beta video uploads.
-- public = true means getPublicUrl() returns a URL that doesn't need auth.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'beta-videos',
  'beta-videos',
  true,
  52428800, -- 50 MB in bytes
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;  -- idempotent for repeated resets

-- SELECT policy: anyone (including anon) can read video files.
-- Public bucket, but we still need an explicit policy on storage.objects.
CREATE POLICY beta_videos_select_public ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'beta-videos');

-- INSERT policy: authenticated users can upload, but only to paths
-- that start with their own user ID. This prevents users from
-- overwriting each other's files.
-- Path format: <user_id>/<route_id>/<timestamp>.<ext>
CREATE POLICY beta_videos_insert_own ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'beta-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE policy: authenticated users can remove their own uploads.
-- Same path-ownership check as INSERT.
CREATE POLICY beta_videos_delete_own ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'beta-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
