/**
 * Cloudinary Configuration & Upload Helper
 *
 * Uploads videos directly to Cloudinary from the client using an unsigned
 * upload preset. This bypasses Supabase Storage entirely — React Native's
 * Blob serialization breaks with Supabase's upload API (0-byte files),
 * but FormData with file:// URIs works correctly with Cloudinary's REST API.
 *
 * HOW IT WORKS:
 *   1. Build a FormData with the file URI (React Native handles file:// natively)
 *   2. POST to Cloudinary's upload endpoint with an unsigned preset
 *   3. Cloudinary returns a URL and public ID for the uploaded video
 *
 * The unsigned preset "beta_videos" must be configured in the Cloudinary
 * dashboard (Settings → Upload → Upload Presets) with:
 *   - Signing mode: Unsigned
 *   - Folder: beta-videos
 *   - Resource type: Video
 *   - Max file size: 150 MB
 */

/** Cloud name from environment — set in .env.local */
const CLOUDINARY_CLOUD_NAME =
  process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';

/** Cloudinary video upload endpoint for our cloud */
export const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

/** Name of the unsigned upload preset configured in Cloudinary dashboard */
const UPLOAD_PRESET = 'beta_videos';

/**
 * Upload a video to Cloudinary using an unsigned preset.
 *
 * Uses FormData with the raw file URI — React Native's fetch correctly
 * reads file:// URIs when passed as { uri, type, name } objects inside
 * FormData. This is the key difference from Supabase Storage, which
 * requires Blob/ArrayBuffer (broken in RN).
 *
 * @param uri - Local file URI from expo-image-picker (file:///...)
 * @param mimeType - MIME type (e.g., 'video/mp4')
 * @returns Object with the Cloudinary URL and public ID
 */
export async function uploadToCloudinary(
  uri: string,
  mimeType: string
): Promise<{ url: string; publicId: string }> {
  const formData = new FormData();

  // React Native's FormData accepts { uri, type, name } objects for file uploads.
  // This tells fetch to read the file from disk and stream it — no Blob needed.
  formData.append('file', {
    uri,
    type: mimeType,
    name: `upload.${mimeType === 'video/quicktime' ? 'mov' : 'mp4'}`,
  } as any);

  formData.append('upload_preset', UPLOAD_PRESET);

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudinary upload failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();

  return {
    url: data.secure_url,
    publicId: data.public_id,
  };
}
