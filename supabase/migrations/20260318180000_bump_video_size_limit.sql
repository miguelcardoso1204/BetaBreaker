-- Bump beta-videos bucket file size limit from 50 MB to 150 MB.
-- The client-side validation was updated to allow 150 MB uploads.
UPDATE storage.buckets
SET file_size_limit = 157286400  -- 150 MB in bytes (150 * 1024 * 1024)
WHERE id = 'beta-videos';
