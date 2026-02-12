/**
 * VideoUploadButton Component Tests (Step 12.1)
 *
 * Tests the self-contained upload flow orchestrator:
 *   Tap → ActionSheet → ImagePicker → Validate → OwnershipModal → Upload
 *
 * This component ties together several concerns:
 *   - expo-image-picker for recording or selecting a video
 *   - videoValidation utils for constraint checking
 *   - OwnershipModal for FR-K1 compliance
 *   - useUploadVideo mutation for the actual upload
 *
 * We mock all external dependencies and test the orchestration logic.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, ActionSheetIOS, Platform } from 'react-native';

// ── Mocks ─────────────────────────────────────────────────────────

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Videos: 'Videos' },
}));

// Mock expo-file-system for getInfoAsync (file size check)
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
}));

// Mock the useUploadVideo hook
jest.mock('@/hooks/useMedia', () => ({
  useUploadVideo: jest.fn(),
}));

// Mock useAuth for the user ID
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}));

// Mock lucide icons
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return {
    Video: (props: any) => <View testID="icon-video" {...props} />,
    Upload: (props: any) => <View testID="icon-upload" {...props} />,
    ShieldCheck: (props: any) => <View testID="icon-shield-check" {...props} />,
    Square: (props: any) => <View testID="icon-square" {...props} />,
    CheckSquare: (props: any) => <View testID="icon-check-square" {...props} />,
  };
});

// Mock videoValidation — we test the real validators separately
jest.mock('@/utils/videoValidation', () => ({
  validateVideoForUpload: jest.fn(),
  buildStoragePath: jest.fn(),
  VIDEO_MAX_DURATION_SECONDS: 60,
  VIDEO_MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,
}));

import { VideoUploadButton } from '../VideoUploadButton';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useUploadVideo } from '@/hooks/useMedia';
import { validateVideoForUpload, buildStoragePath } from '@/utils/videoValidation';

const mockMutate = jest.fn();
const mockUseUploadVideo = useUploadVideo as jest.Mock;

describe('VideoUploadButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: mutation is idle
    mockUseUploadVideo.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it('renders the upload button', () => {
    render(<VideoUploadButton routeId="route-1" />);

    expect(screen.getByTestId('video-upload-button')).toBeOnTheScreen();
    expect(screen.getByText('Add Beta Video')).toBeOnTheScreen();
  });

  it('shows action options when pressed', () => {
    // On Android, we show a custom Alert-based action sheet.
    // On iOS, we'd use ActionSheetIOS. We test the Alert path.
    jest.spyOn(Alert, 'alert');

    render(<VideoUploadButton routeId="route-1" />);
    fireEvent.press(screen.getByTestId('video-upload-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Add Beta Video',
      'Choose a source',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Record Video' }),
        expect.objectContaining({ text: 'Choose from Library' }),
        expect.objectContaining({ text: 'Cancel' }),
      ])
    );
  });

  it('shows validation errors when video fails checks', async () => {
    // Simulate picking a video from the library
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: 'file:///video.mp4',
        duration: 90000, // 90 seconds in ms — over the limit
        width: 1920,
        height: 1080,
        mimeType: 'video/mp4',
      }],
    });

    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({
      exists: true,
      size: 10 * 1024 * 1024,
    });

    // Validation fails
    (validateVideoForUpload as jest.Mock).mockReturnValueOnce({
      valid: false,
      errors: ['Video must be 60 seconds or less (got 90s).'],
    });

    jest.spyOn(Alert, 'alert');

    render(<VideoUploadButton routeId="route-1" />);
    fireEvent.press(screen.getByTestId('video-upload-button'));

    // Simulate tapping "Choose from Library"
    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const libraryButton = alertCalls[0][2].find(
      (btn: any) => btn.text === 'Choose from Library'
    );
    await act(async () => {
      libraryButton.onPress();
    });

    // Should show a validation error alert
    await waitFor(() => {
      const secondAlert = (Alert.alert as jest.Mock).mock.calls[1];
      expect(secondAlert[0]).toBe('Video Not Accepted');
      expect(secondAlert[1]).toContain('60 seconds');
    });
  });

  it('shows ownership modal when video passes validation', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: 'file:///video.mp4',
        duration: 30000,
        width: 1920,
        height: 1080,
        mimeType: 'video/mp4',
      }],
    });

    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({
      exists: true,
      size: 10 * 1024 * 1024,
    });

    (validateVideoForUpload as jest.Mock).mockReturnValueOnce({
      valid: true,
      errors: [],
    });

    jest.spyOn(Alert, 'alert');

    render(<VideoUploadButton routeId="route-1" />);
    fireEvent.press(screen.getByTestId('video-upload-button'));

    // Tap "Choose from Library"
    const libraryButton = (Alert.alert as jest.Mock).mock.calls[0][2].find(
      (btn: any) => btn.text === 'Choose from Library'
    );
    await act(async () => {
      libraryButton.onPress();
    });

    // OwnershipModal should now be visible
    await waitFor(() => {
      expect(screen.getByText('Content Ownership')).toBeOnTheScreen();
    });
  });

  it('triggers upload mutation when ownership is affirmed', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: 'file:///video.mp4',
        duration: 30000,
        width: 1920,
        height: 1080,
        mimeType: 'video/mp4',
      }],
    });

    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({
      exists: true,
      size: 10 * 1024 * 1024,
    });

    (validateVideoForUpload as jest.Mock).mockReturnValueOnce({
      valid: true,
      errors: [],
    });

    (buildStoragePath as jest.Mock).mockReturnValueOnce(
      'user-1/route-1/12345.mp4'
    );

    // Mock global fetch for the blob conversion
    global.fetch = jest.fn().mockResolvedValueOnce({
      blob: () => Promise.resolve(new Blob(['video-data'])),
    }) as jest.Mock;

    jest.spyOn(Alert, 'alert');

    render(<VideoUploadButton routeId="route-1" />);
    fireEvent.press(screen.getByTestId('video-upload-button'));

    // Pick from library
    const libraryButton = (Alert.alert as jest.Mock).mock.calls[0][2].find(
      (btn: any) => btn.text === 'Choose from Library'
    );
    await act(async () => {
      libraryButton.onPress();
    });

    // Check the ownership checkbox
    await waitFor(() => {
      expect(screen.getByText('Content Ownership')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByTestId('ownership-checkbox'));

    // Press Upload
    await act(async () => {
      fireEvent.press(screen.getByTestId('ownership-upload-button'));
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          storagePath: 'user-1/route-1/12345.mp4',
          mimeType: 'video/mp4',
        })
      );
    });
  });

  it('does nothing when user cancels the picker', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: [],
    });

    jest.spyOn(Alert, 'alert');

    render(<VideoUploadButton routeId="route-1" />);
    fireEvent.press(screen.getByTestId('video-upload-button'));

    const libraryButton = (Alert.alert as jest.Mock).mock.calls[0][2].find(
      (btn: any) => btn.text === 'Choose from Library'
    );
    await act(async () => {
      libraryButton.onPress();
    });

    // No validation alert, no modal, no mutation
    expect(validateVideoForUpload).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows loading state during upload', () => {
    mockUseUploadVideo.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      isError: false,
      error: null,
    });

    render(<VideoUploadButton routeId="route-1" />);

    expect(screen.getByText('Uploading...')).toBeOnTheScreen();
  });

  it('disables button during upload', () => {
    mockUseUploadVideo.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      isError: false,
      error: null,
    });

    render(<VideoUploadButton routeId="route-1" />);

    const button = screen.getByTestId('video-upload-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });
});
