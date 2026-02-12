// app/(tabs)/scan.tsx
//
// QR Scanner Screen — camera-powered barcode scanner for gym route QR codes.
//
// HOW IT WORKS:
// 1. Checks camera permission (requests if needed, shows explanation if denied)
// 2. Renders a live camera preview with QR barcode detection enabled
// 3. When a QR code is detected, verifies the JWT signature using verifyQrToken()
// 4. On success: shows a "Route found!" overlay with View Route / Quick Log actions
// 5. On failure: shows an error message with a "Scan Again" button
//
// ACCESSING THIS SCREEN:
// This screen is hidden from the tab bar (href: null in _layout.tsx) and is
// accessed via a long-press on the center FAB, which opens an action menu
// with a "Scan QR Code" option. It's registered as a tab screen (not a modal)
// so that back navigation returns to the previous tab seamlessly.
//
// DUPLICATE SCAN PREVENTION:
// A `scanned` state flag is set to true after the first barcode detection.
// While true, subsequent onBarcodeScanned callbacks are ignored. This prevents
// rapid-fire duplicate verifications when the camera continuously detects the
// same QR code in its field of view. The flag resets when the user taps
// "Scan Again" or navigates away.

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Camera, CheckCircle, XCircle, Eye, ClipboardList, RotateCcw, Trophy } from 'lucide-react-native';

import { verifyQrToken } from '@/utils/qr';
import type { QrPayload } from '@/utils/qr';
import { QuickLogSheet } from '@/components/session';
import { useActiveEventsForRoute } from '@/hooks/useScores';

// ── Types ────────────────────────────────────────────────────────────

/** Represents the possible states of the scanner after a scan attempt. */
type ScanState =
  | { status: 'idle' }
  | { status: 'verifying' }
  | { status: 'success'; payload: QrPayload }
  | { status: 'error'; message: string };

// ── Component ────────────────────────────────────────────────────────

export default function ScanScreen() {
  const router = useRouter();

  // Camera permission hook from expo-camera. Returns the current permission
  // status and a function to request permission. The hook handles both iOS
  // and Android permission flows automatically.
  const [permission, requestPermission] = useCameraPermissions();

  // Tracks the current scan state — idle, verifying, success, or error.
  // Using a discriminated union (tagged by `status`) instead of multiple
  // boolean flags makes impossible states impossible (e.g., can't be both
  // "success" and "error" at the same time).
  const [scanState, setScanState] = useState<ScanState>({ status: 'idle' });

  // Whether the QuickLogSheet is visible (opened from the success overlay).
  const [showQuickLog, setShowQuickLog] = useState(false);

  // Flag to prevent duplicate scans while processing or showing results.
  const [scanned, setScanned] = useState(false);

  // Check if the scanned route is part of any active competition.
  // The hook is disabled until a successful scan provides a route ID.
  const scannedRouteId = scanState.status === 'success' ? scanState.payload.sub : null;
  const { activeEvents } = useActiveEventsForRoute(scannedRouteId);

  /**
   * Called by CameraView when a barcode is detected in the camera feed.
   *
   * WHY useCallback?
   * CameraView re-renders on every frame. Without useCallback, a new
   * function reference would be created each render, potentially causing
   * unnecessary re-subscriptions to the barcode scanner.
   */
  const handleBarcodeScanned = useCallback(
    async ({ data }: { type: string; data: string }) => {
      // Ignore if we've already scanned (prevents rapid-fire duplicates)
      if (scanned) return;

      setScanned(true);
      setScanState({ status: 'verifying' });

      // Verify the scanned data as a valid signed JWT
      const result = await verifyQrToken(data);

      if (result.ok) {
        setScanState({ status: 'success', payload: result.payload });
      } else {
        setScanState({ status: 'error', message: result.error });
      }
    },
    [scanned]
  );

  /**
   * Reset the scanner to accept a new QR code.
   * Called when the user taps "Scan Again" after a successful or failed scan.
   */
  const handleScanAgain = () => {
    setScanned(false);
    setScanState({ status: 'idle' });
    setShowQuickLog(false);
  };

  /**
   * Navigate to the route detail screen for the scanned route.
   * URL format: /gym/{gymId}/route/{routeId}
   */
  const handleViewRoute = () => {
    if (scanState.status === 'success') {
      router.push(`/gym/${scanState.payload.gym_id}/route/${scanState.payload.sub}`);
    }
  };

  /**
   * Open the QuickLogSheet to log an ascent for the scanned route.
   */
  const handleQuickLog = () => {
    setShowQuickLog(true);
  };

  /**
   * Navigate to the event detail screen for competition scoring.
   * If multiple active events contain this route, navigates to the first one
   * (multi-event picker is future work).
   */
  const handleCompScore = () => {
    if (activeEvents.length > 0) {
      router.push(`/events/${activeEvents[0].id}` as any);
    }
  };

  // ── Permission Not Granted State ──────────────────────────────────

  // If permission hasn't been granted yet, show an explanation screen.
  // This is better UX than jumping straight to the system dialog — users
  // understand WHY the app needs camera access before being asked.
  if (!permission?.granted) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        {/* Camera icon as visual context */}
        <Camera size={64} color="#7C3AED" strokeWidth={1.5} />

        <Text className="text-foreground text-xl font-bold mt-6 text-center">
          Camera Access Required
        </Text>

        <Text className="text-muted-foreground text-base mt-3 text-center leading-6">
          To scan QR codes on climbing routes, Beta Breaker needs access
          to your camera. Your camera feed is processed locally and never
          recorded or uploaded.
        </Text>

        <Pressable
          onPress={requestPermission}
          className="bg-accent rounded-xl px-8 py-4 mt-8"
          accessibilityRole="button"
          accessibilityLabel="Grant camera permission"
        >
          <Text className="text-white font-semibold text-base">
            Grant Permission
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Camera + Scanner State ────────────────────────────────────────

  return (
    <View className="flex-1 bg-black">
      {/* Live camera preview with QR barcode detection.
          barcodeScannerSettings restricts detection to QR codes only —
          we don't want to accidentally trigger on barcodes, Data Matrix,
          or other symbologies that might be on product packaging nearby. */}
      <CameraView
        testID="camera-view"
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        {/* Viewfinder overlay — semi-transparent border with a clear center
            that guides the user to aim their camera at the QR code. */}
        <View className="flex-1 items-center justify-center">
          {scanState.status === 'idle' && (
            <View className="items-center">
              {/* Viewfinder box — 250x250 with rounded corners and white border */}
              <View
                className="w-64 h-64 rounded-2xl border-2 border-white/60"
                style={{ backgroundColor: 'transparent' }}
              />
              <Text className="text-white text-base mt-4 font-medium">
                Point at a route QR code
              </Text>
            </View>
          )}

          {/* Verifying state — show a loading indicator */}
          {scanState.status === 'verifying' && (
            <View className="bg-black/70 rounded-2xl px-8 py-6 items-center">
              <Text className="text-white text-lg font-semibold">
                Verifying...
              </Text>
            </View>
          )}

          {/* Success overlay — route found with action buttons */}
          {scanState.status === 'success' && (
            <View className="bg-black/80 rounded-2xl px-8 py-6 mx-6 items-center">
              <CheckCircle size={48} color="#22C55E" strokeWidth={2} />
              <Text className="text-white text-xl font-bold mt-3">
                Route Found!
              </Text>

              {/* Action buttons row */}
              <View className="flex-row gap-3 mt-5">
                {/* View Route button — navigates to route detail screen */}
                <Pressable
                  onPress={handleViewRoute}
                  className="bg-accent rounded-xl px-5 py-3 flex-row items-center gap-2"
                  accessibilityRole="button"
                >
                  <Eye size={18} color="#FFFFFF" strokeWidth={2} />
                  <Text className="text-white font-semibold">View Route</Text>
                </Pressable>

                {/* Quick Log button — opens QuickLogSheet inline */}
                <Pressable
                  onPress={handleQuickLog}
                  className="bg-green-600 rounded-xl px-5 py-3 flex-row items-center gap-2"
                  accessibilityRole="button"
                >
                  <ClipboardList size={18} color="#FFFFFF" strokeWidth={2} />
                  <Text className="text-white font-semibold">Quick Log</Text>
                </Pressable>

                {/* Comp Score button — shown only when the scanned route is
                    part of an active competition. Navigates to the event
                    detail screen where the athlete can submit their score. */}
                {activeEvents.length > 0 && (
                  <Pressable
                    onPress={handleCompScore}
                    className="bg-amber-600 rounded-xl px-5 py-3 flex-row items-center gap-2"
                    accessibilityRole="button"
                  >
                    <Trophy size={18} color="#FFFFFF" strokeWidth={2} />
                    <Text className="text-white font-semibold">Comp Score</Text>
                  </Pressable>
                )}
              </View>

              {/* Scan Again button — resets scanner for the next QR code */}
              <Pressable
                onPress={handleScanAgain}
                className="mt-4 flex-row items-center gap-2"
                accessibilityRole="button"
              >
                <RotateCcw size={16} color="#9CA3AF" strokeWidth={2} />
                <Text className="text-gray-400 text-sm">Scan Again</Text>
              </Pressable>
            </View>
          )}

          {/* Error overlay — invalid QR with retry option */}
          {scanState.status === 'error' && (
            <View className="bg-black/80 rounded-2xl px-8 py-6 mx-6 items-center">
              <XCircle size={48} color="#EF4444" strokeWidth={2} />
              <Text className="text-white text-lg font-bold mt-3">
                Invalid QR Code
              </Text>
              <Text className="text-gray-400 text-sm mt-2 text-center">
                {scanState.message}
              </Text>

              {/* Scan Again button — resets scanner to try a different QR */}
              <Pressable
                onPress={handleScanAgain}
                className="bg-accent rounded-xl px-6 py-3 mt-5 flex-row items-center gap-2"
                accessibilityRole="button"
              >
                <RotateCcw size={18} color="#FFFFFF" strokeWidth={2} />
                <Text className="text-white font-semibold">Scan Again</Text>
              </Pressable>
            </View>
          )}
        </View>
      </CameraView>

      {/* QuickLogSheet — rendered as a bottom sheet overlay when the user
          taps "Quick Log" after a successful scan. Receives the scanned
          route_id and handles ascent logging via the session hooks. */}
      {scanState.status === 'success' && (
        <QuickLogSheet
          routeId={scanState.payload.sub}
          visible={showQuickLog}
          onDismiss={() => setShowQuickLog(false)}
        />
      )}
    </View>
  );
}
