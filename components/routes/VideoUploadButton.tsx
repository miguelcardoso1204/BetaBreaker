/**
 * VideoUploadButton — Self-Contained Video Upload Flow (Step 12.1)
 *
 * Orchestrates the entire upload pipeline:
 *   1. Tap → ActionSheet (Record Video / Choose from Library)
 *   2. Launch expo-image-picker (camera or gallery, videos only)
 *   3. Validate constraints (duration, size, resolution, MIME type)
 *   4. Show OwnershipModal (FR-K1 compliance)
 *   5. On confirm → fetch blob from URI → trigger useUploadVideo mutation
 *
 * This is a "smart" component — it manages picker state, validation,
 * and the modal internally. The parent only needs to pass `routeId`.
 *
 * WHY AN ALERT-BASED ACTION SHEET?
 * ActionSheetIOS only works on iOS. For cross-platform, we use Alert
 * with three buttons. On iOS, Alert with 3+ buttons renders as an
 * action sheet automatically. On Android, it renders as a dialog.
 *
 * WHY FETCH() FOR BLOB CONVERSION?
 * expo-image-picker returns a `file://` URI, but Supabase Storage's
 * upload() expects a Blob. The simplest cross-platform way to convert
 * a local file URI to a Blob is `fetch(uri).then(r => r.blob())`.
 * This works because `fetch` handles `file://` URIs in React Native.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Video, Upload } from 'lucide-react-native';

import { useUploadVideo } from '@/hooks/useMedia';
import { useAuth } from '@/hooks/useAuth';
import {
  validateVideoForUpload,
  buildStoragePath,
  VIDEO_MAX_DURATION_SECONDS,
} from '@/utils/videoValidation';
import { OwnershipModal } from './OwnershipModal';
import { useTranslation } from 'react-i18next';

export interface VideoUploadButtonProps {
  /** The route this video will be associated with. */
  routeId: string;
}

/**
 * Extracts the file extension from a MIME type.
 * Falls back to 'mp4' for unknown types.
 */
function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return map[mimeType] ?? 'mp4';
}

export function VideoUploadButton({ routeId }: VideoUploadButtonProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uploadMutation = useUploadVideo(routeId);

  // State for the selected video (held between picker and modal)
  const [pendingVideo, setPendingVideo] = useState<{
    uri: string;
    mimeType: string;
    fileSize: number;
  } | null>(null);

  // OwnershipModal visibility
  const [showOwnershipModal, setShowOwnershipModal] = useState(false);

  /**
   * Process a picked video: validate, then show ownership modal.
   */
  const handlePickResult = useCallback(
    async (result: ImagePicker.ImagePickerResult) => {
      // User cancelled the picker
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const mimeType = asset.mimeType ?? 'video/mp4';

      // Get file size from expo-file-system (the picker doesn't always
      // include it, and we need it for the 50 MB check)
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const fileSize = (fileInfo as any).size ?? 0;

      // Convert duration from ms (picker) to seconds (validation)
      const durationSeconds = (asset.duration ?? 0) / 1000;

      // Run all validation checks at once
      const validation = validateVideoForUpload({
        durationSeconds,
        fileSizeBytes: fileSize,
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        mimeType,
      });

      if (!validation.valid) {
        // Show all errors to the user so they can fix everything at once
        Alert.alert(
          t('video.notAccepted'),
          validation.errors.join('\n')
        );
        return;
      }

      // Video passed validation — store it and show the ownership modal
      setPendingVideo({ uri, mimeType, fileSize });
      setShowOwnershipModal(true);
    },
    []
  );

  /**
   * Show the source selection dialog.
   */
  const handlePress = useCallback(() => {
    Alert.alert(t('video.addBetaVideo'), t('video.chooseSource'), [
      {
        text: t('video.recordVideo'),
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['videos'],
            videoMaxDuration: VIDEO_MAX_DURATION_SECONDS,
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
          });
          handlePickResult(result);
        },
      },
      {
        text: t('video.chooseFromLibrary'),
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
          });
          handlePickResult(result);
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }, [handlePickResult]);

  /**
   * User confirmed ownership — start the upload.
   */
  const handleOwnershipConfirm = useCallback(async () => {
    if (!pendingVideo || !user?.id) return;

    setShowOwnershipModal(false);

    const ext = mimeToExtension(pendingVideo.mimeType);
    const storagePath = buildStoragePath(user.id, routeId, ext);

    // Convert the local file URI to a Blob using fetch().
    // React Native's fetch() supports file:// URIs natively.
    const response = await fetch(pendingVideo.uri);
    const blob = await response.blob();

    uploadMutation.mutate({
      blob,
      storagePath,
      mimeType: pendingVideo.mimeType,
    });

    setPendingVideo(null);
  }, [pendingVideo, user?.id, routeId, uploadMutation]);

  const isUploading = uploadMutation.isPending;

  return (
    <>
      <Pressable
        testID="video-upload-button"
        onPress={isUploading ? undefined : handlePress}
        disabled={isUploading}
        accessibilityRole="button"
        accessibilityLabel={isUploading ? t('video.uploading') : t('video.addBetaVideo')}
        accessibilityState={{ disabled: isUploading }}
        className={`items-center justify-center py-6 rounded-xl border-2 border-dashed border-border ${
          isUploading ? 'opacity-50' : ''
        }`}
      >
        {isUploading ? (
          <>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text className="text-text-secondary mt-2">{t("video.uploading")}</Text>
          </>
        ) : (
          <>
            <Video size={28} color="#6B7280" />
            <Text className="text-text-secondary mt-2">{t("video.addBetaVideo")}</Text>
          </>
        )}
      </Pressable>

      <OwnershipModal
        visible={showOwnershipModal}
        onConfirm={handleOwnershipConfirm}
        onDismiss={() => {
          setShowOwnershipModal(false);
          setPendingVideo(null);
        }}
      />
    </>
  );
}
