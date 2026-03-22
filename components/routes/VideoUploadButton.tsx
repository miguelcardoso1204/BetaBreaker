/**
 * VideoUploadButton — Self-Contained Video Upload Flow (Step 12.1)
 *
 * Orchestrates the entire upload pipeline:
 *   1. Tap → ActionSheet (Record Video / Choose from Library)
 *   2. Launch expo-image-picker (camera or gallery, videos only)
 *   3. Validate constraints (duration, size, resolution, MIME type)
 *   4. Show OwnershipModal (FR-K1 compliance)
 *   5. On confirm → pass file URI to useUploadVideo → Cloudinary upload
 *
 * This is a "smart" component — it manages picker state, validation,
 * and the modal internally. The parent only needs to pass `routeId`.
 *
 * WHY AN ALERT-BASED ACTION SHEET?
 * ActionSheetIOS only works on iOS. For cross-platform, we use Alert
 * with three buttons. On iOS, Alert with 3+ buttons renders as an
 * action sheet automatically. On Android, it renders as a dialog.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system/next';
import { Image } from 'expo-image';
import { Video, Upload, CheckCircle, AlertCircle } from 'lucide-react-native';

import { useUploadVideo } from '@/hooks/useMedia';
import { useAuth } from '@/hooks/useAuth';
import {
  validateVideoForUpload,
  VIDEO_MAX_DURATION_SECONDS,
} from '@/utils/videoValidation';
import { OwnershipModal } from './OwnershipModal';
import { useTranslation } from 'react-i18next';

export interface VideoUploadButtonProps {
  /** The route this video will be associated with. */
  routeId: string;
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

  // Local URI of the uploaded video — kept after upload for the thumbnail preview.
  const [uploadedVideoUri, setUploadedVideoUri] = useState<string | null>(null);

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

      // Get file size using the new expo-file-system File API.
      // The picker doesn't always include fileSize, and we need it
      // for the 150 MB validation check.
      const file = new File(uri);
      const fileSize = file.size ?? 0;

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
   *
   * Simply passes the file URI and MIME type to the mutation.
   * The hook handles uploading to Cloudinary and creating the DB row.
   */
  const handleOwnershipConfirm = useCallback(async () => {
    if (!pendingVideo || !user?.id) return;

    setShowOwnershipModal(false);

    // Keep the local URI so we can show a thumbnail preview on success.
    const videoUri = pendingVideo.uri;

    uploadMutation.mutate(
      {
        uri: pendingVideo.uri,
        mimeType: pendingVideo.mimeType,
      },
      {
        onSuccess: () => {
          setUploadedVideoUri(videoUri);
        },
      }
    );

    setPendingVideo(null);
  }, [pendingVideo, user?.id, routeId, uploadMutation]);

  const isUploading = uploadMutation.isPending;
  const isError = uploadMutation.isError;
  const isSuccess = uploadMutation.isSuccess && !!uploadedVideoUri;

  return (
    <>
      {isSuccess ? (
        /* ── Success state: video thumbnail with checkmark overlay.
            Tappable so the user can replace the video if needed. ── */
        <Pressable
          testID="video-upload-button"
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={t("video.tapToReplace")}
          className="rounded-xl overflow-hidden"
        >
          <Image
            source={{ uri: uploadedVideoUri }}
            style={{ width: "100%", height: 180, borderRadius: 12 }}
            contentFit="cover"
          />
          <View className="absolute inset-0 bg-black/40 items-center justify-center rounded-xl">
            <CheckCircle size={36} color="#22C55E" />
            <Text className="text-white font-semibold mt-2">
              {t("video.uploadSuccess")}
            </Text>
            <Text className="text-white/70 text-xs mt-1">
              {t("video.tapToReplace")}
            </Text>
          </View>
        </Pressable>
      ) : isError ? (
        /* ── Error state: red border with error message ── */
        <Pressable
          testID="video-upload-button"
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={t("video.tapToRetry")}
          className="items-center justify-center py-6 rounded-xl border-2 border-dashed border-red-500"
        >
          <AlertCircle size={28} color="#EF4444" />
          <Text className="text-red-400 font-semibold mt-2">
            {t("video.uploadFailed")}
          </Text>
          <Text className="text-text-secondary text-xs mt-1">
            {t("video.tapToRetry")}
          </Text>
        </Pressable>
      ) : (
        /* ── Default / uploading state ── */
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
      )}

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
