// app/(tabs)/__tests__/scan.test.tsx
//
// Tests for the QR Scanner screen — camera-powered barcode scanning
// that verifies route QR codes and offers navigation/quick-log actions.
//
// MOCK STRATEGY:
// - expo-camera: Mocked as a plain View with testID. We simulate barcode
//   scans by extracting and calling the onBarcodeScanned prop.
// - @/utils/qr: Mocked to control verification results per test.
// - expo-router: Mocked to verify navigation calls.
// - QuickLogSheet: Mocked as a simple View to avoid session hook complexity.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────

// Track whether camera permissions have been granted.
// Each test can configure this via mockPermission/mockRequestPermission.
const mockRequestPermission = jest.fn();
const mockPermission = { granted: false, canAskAgain: true };
const mockUseCameraPermissions = jest.fn(() => [mockPermission, mockRequestPermission]);

// Mock expo-camera: CameraView is a plain View that captures props
// (especially onBarcodeScanned) so we can simulate barcode scans.
jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (props: any) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => mockUseCameraPermissions(),
  };
});

// Mock the QR verification utility — each test controls the result.
const mockVerifyQrToken = jest.fn();
jest.mock('@/utils/qr', () => ({
  verifyQrToken: (...args: any[]) => mockVerifyQrToken(...args),
}));

// Mock expo-router for navigation verification.
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// Mock useScores hook for active event detection after a QR scan.
const mockActiveEventsData = { activeEvents: [] as any[], isLoading: false, error: null };
jest.mock('@/hooks/useScores', () => ({
  useActiveEventsForRoute: () => mockActiveEventsData,
}));

// Mock QuickLogSheet as a simple View to avoid deep dependency tree.
jest.mock('@/components/session', () => {
  const { View, Text } = require('react-native');
  return {
    QuickLogSheet: ({ visible, routeId }: any) =>
      visible ? (
        <View testID="quick-log-sheet">
          <Text>QuickLog for {routeId}</Text>
        </View>
      ) : null,
  };
});

// Mock lucide-react-native icons as Text elements (same pattern as other tests).
jest.mock('lucide-react-native', () => ({
  Camera: (props: any) => {
    const { Text } = require('react-native');
    return <Text testID="icon-Camera" {...props}>Camera</Text>;
  },
  ScanLine: (props: any) => {
    const { Text } = require('react-native');
    return <Text testID="icon-ScanLine" {...props}>ScanLine</Text>;
  },
  CheckCircle: (props: any) => {
    const { Text } = require('react-native');
    return <Text testID="icon-CheckCircle" {...props}>CheckCircle</Text>;
  },
  XCircle: (props: any) => {
    const { Text } = require('react-native');
    return <Text testID="icon-XCircle" {...props}>XCircle</Text>;
  },
  Eye: (props: any) => {
    const { Text } = require('react-native');
    return <Text testID="icon-Eye" {...props}>Eye</Text>;
  },
  ClipboardList: (props: any) => {
    const { Text } = require('react-native');
    return <Text testID="icon-ClipboardList" {...props}>ClipboardList</Text>;
  },
  RotateCcw: (props: any) => {
    const { Text } = require('react-native');
    return <Text testID="icon-RotateCcw" {...props}>RotateCcw</Text>;
  },
  Trophy: (props: any) => {
    const { Text } = require('react-native');
    return <Text testID="icon-Trophy" {...props}>Trophy</Text>;
  },
}));

// Import the component under test AFTER mocks are in place.
import ScanScreen from '../scan';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Simulate a barcode scan by finding CameraView and calling its
 * onBarcodeScanned prop with the given data.
 */
function simulateBarcodeScan(data: string) {
  const cameraView = screen.getByTestId('camera-view');
  const onBarcodeScanned = cameraView.props.onBarcodeScanned;
  if (onBarcodeScanned) {
    onBarcodeScanned({ type: 'qr', data });
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ScanScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: permission not granted (each test overrides as needed)
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: true },
      mockRequestPermission,
    ]);
    // Default: no active events for the scanned route
    mockActiveEventsData.activeEvents = [];
  });

  it('requests camera permission on mount and shows prompt when not granted', () => {
    // When the scanner screen opens without camera permission, it should
    // show an explanation screen with a button to request permission.
    // This is better UX than immediately showing a system permission dialog.
    render(<ScanScreen />);

    // Should show permission explanation text
    expect(screen.getByText(/camera access/i)).toBeOnTheScreen();
    // Should show a button to grant permission
    expect(screen.getByText(/grant permission/i)).toBeOnTheScreen();

    // Pressing the button should trigger the permission request
    fireEvent.press(screen.getByText(/grant permission/i));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('shows camera view when permission is granted', () => {
    // Once the user grants camera access, the screen should show the
    // camera preview with QR barcode scanning enabled.
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
    ]);

    render(<ScanScreen />);

    // Camera view should be rendered with QR barcode settings
    const cameraView = screen.getByTestId('camera-view');
    expect(cameraView).toBeOnTheScreen();
    expect(cameraView.props.barcodeScannerSettings).toEqual(
      expect.objectContaining({ barcodeTypes: ['qr'] })
    );
  });

  it('calls verifyQrToken when a barcode is scanned', async () => {
    // When the camera detects a QR code, the screen should pass the
    // scanned data to verifyQrToken for JWT verification.
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
    ]);
    mockVerifyQrToken.mockResolvedValue({
      ok: true,
      payload: { sub: 'route-1', gym_id: 'gym-1', iat: 1000, exp: 9999 },
    });

    render(<ScanScreen />);
    simulateBarcodeScan('some.jwt.token');

    await waitFor(() => {
      expect(mockVerifyQrToken).toHaveBeenCalledWith('some.jwt.token');
    });
  });

  it('shows success overlay with route actions on valid QR', async () => {
    // After a valid QR scan, the screen should show a confirmation
    // overlay with two action buttons: "View Route" and "Quick Log".
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
    ]);
    mockVerifyQrToken.mockResolvedValue({
      ok: true,
      payload: { sub: 'route-abc', gym_id: 'gym-xyz', iat: 1000, exp: 9999 },
    });

    render(<ScanScreen />);
    simulateBarcodeScan('valid.jwt.token');

    await waitFor(() => {
      expect(screen.getByText(/route found/i)).toBeOnTheScreen();
    });

    // Both action buttons should be available
    expect(screen.getByText(/view route/i)).toBeOnTheScreen();
    expect(screen.getByText(/quick log/i)).toBeOnTheScreen();
  });

  it('shows error message on invalid QR', async () => {
    // When verification fails (invalid signature, expired, malformed),
    // the screen should show an error message and a "Scan Again" button
    // to let the user try a different QR code.
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
    ]);
    mockVerifyQrToken.mockResolvedValue({
      ok: false,
      error: 'QR code has expired — ask the gym to refresh it',
    });

    render(<ScanScreen />);
    simulateBarcodeScan('invalid.token');

    // The heading "Invalid QR Code" should appear in the error overlay
    await waitFor(() => {
      expect(screen.getByText('Invalid QR Code')).toBeOnTheScreen();
    });

    // The specific error message from verifyQrToken should be shown
    expect(screen.getByText(/expired/i)).toBeOnTheScreen();

    // "Scan Again" button should be visible to reset the scanner
    expect(screen.getByText(/scan again/i)).toBeOnTheScreen();
  });

  it('navigates to route detail on "View Route" press', async () => {
    // Pressing "View Route" should navigate to the route detail screen
    // using the gym_id and route_id extracted from the QR JWT.
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
    ]);
    mockVerifyQrToken.mockResolvedValue({
      ok: true,
      payload: { sub: 'route-123', gym_id: 'gym-456', iat: 1000, exp: 9999 },
    });

    render(<ScanScreen />);
    simulateBarcodeScan('valid.route.token');

    await waitFor(() => {
      expect(screen.getByText(/view route/i)).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText(/view route/i));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/gym/gym-456/route/route-123');
  });

  // ── Comp Score integration tests ───────────────────────────────────

  it('shows "Comp Score" button when route is in an active event', async () => {
    // After a successful QR scan, if the scanned route is part of an
    // ongoing competition, a "Comp Score" button should appear alongside
    // "View Route" and "Quick Log".
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
    ]);
    mockVerifyQrToken.mockResolvedValue({
      ok: true,
      payload: { sub: 'route-comp', gym_id: 'gym-1', iat: 1000, exp: 9999 },
    });
    // Simulate an active event containing this route
    mockActiveEventsData.activeEvents = [
      { id: 'event-1', name: 'Spring Comp', status: 'ongoing' },
    ];

    render(<ScanScreen />);
    simulateBarcodeScan('valid.comp.token');

    await waitFor(() => {
      expect(screen.getByText(/route found/i)).toBeOnTheScreen();
    });

    expect(screen.getByText(/comp score/i)).toBeOnTheScreen();
  });

  it('hides "Comp Score" button when no active event', async () => {
    // If the scanned route is NOT in any active competition, the
    // "Comp Score" button should not appear.
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
    ]);
    mockVerifyQrToken.mockResolvedValue({
      ok: true,
      payload: { sub: 'route-no-comp', gym_id: 'gym-1', iat: 1000, exp: 9999 },
    });
    mockActiveEventsData.activeEvents = [];

    render(<ScanScreen />);
    simulateBarcodeScan('valid.no-comp.token');

    await waitFor(() => {
      expect(screen.getByText(/route found/i)).toBeOnTheScreen();
    });

    expect(screen.queryByText(/comp score/i)).toBeNull();
  });

  it('navigates to event screen on "Comp Score" press', async () => {
    // Pressing "Comp Score" should navigate to the event detail screen
    // using the first active event's ID.
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, canAskAgain: true },
      mockRequestPermission,
    ]);
    mockVerifyQrToken.mockResolvedValue({
      ok: true,
      payload: { sub: 'route-xyz', gym_id: 'gym-1', iat: 1000, exp: 9999 },
    });
    mockActiveEventsData.activeEvents = [
      { id: 'event-42', name: 'Bouldering League', status: 'ongoing' },
    ];

    render(<ScanScreen />);
    simulateBarcodeScan('valid.event.token');

    await waitFor(() => {
      expect(screen.getByText(/comp score/i)).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText(/comp score/i));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/events/event-42');
  });
});
