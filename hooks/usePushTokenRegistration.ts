/**
 * usePushTokenRegistration — App-Launch Side Effect for Push Token Setup
 *
 * This hook runs once when the user becomes authenticated and handles
 * the full push notification registration flow:
 *
 *   1. Request notification permissions from the OS
 *   2. If granted → get an Expo push token
 *   3. Persist the token in the push_tokens table
 *
 * WHY NOT TanStack Query?
 * This is a fire-and-forget side effect, not fetched data. There's no
 * cached result to invalidate or refetch. It runs once on auth change
 * and that's it. A plain useEffect is the right tool.
 *
 * ERROR HANDLING:
 * Push notifications are a nice-to-have, not a critical feature. If any
 * step fails (permissions denied, token fetch fails, DB insert fails),
 * we catch the error and expose it via the return value for debugging.
 * The app continues to work normally without push notifications.
 *
 * SIMULATOR NOTE:
 * getExpoPushTokenAsync throws on iOS Simulator (no push support).
 * The try/catch handles this gracefully — no expo-device check needed.
 */

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { useAuth } from "@/hooks/useAuth";
import { notificationsService } from "@/services/notifications.service";

/** Return type for debugging — not used by most consumers. */
interface PushTokenRegistrationState {
  /** The OS permission status after requesting (e.g., "granted", "denied"). */
  permissionStatus: string | null;
  /** The Expo push token string, or null if not yet obtained. */
  token: string | null;
  /** Any error that occurred during the registration flow. */
  error: Error | null;
}

export function usePushTokenRegistration(): PushTokenRegistrationState {
  const { user, isAuthenticated } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Skip entirely if the user isn't logged in — no point requesting
    // permissions or tokens for an anonymous session.
    if (!isAuthenticated || !user?.id) return;

    // Capture userId after the null check so TypeScript narrows it to string.
    // The inner async function can't see the narrowing from the guard above.
    const userId = user.id;
    let cancelled = false;

    async function registerToken() {
      try {
        // Step 1: Request notification permissions from the OS.
        // On iOS this shows the system permission dialog. On Android 13+
        // it shows a runtime permission prompt. Older Android grants by default.
        const { status } = await Notifications.requestPermissionsAsync();

        if (cancelled) return;
        setPermissionStatus(status);

        // Step 2: If permissions were denied, bail gracefully.
        // The app works fine without push — the user just won't get
        // real-time alerts for badges, follows, etc.
        if (status !== "granted") return;

        // Step 3: Get an Expo push token. This is the unique device
        // identifier that Expo's push service uses to route notifications.
        // projectId comes from app.json → extra.eas.projectId (set by EAS).
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const pushToken = await Notifications.getExpoPushTokenAsync({
          projectId,
        });

        if (cancelled) return;
        setToken(pushToken.data);

        // Step 4: Persist the token in the database so the backend
        // Edge Function can look up all tokens for a user when dispatching
        // push notifications. Platform.OS is "ios" or "android".
        await notificationsService.registerPushToken(
          userId,
          pushToken.data,
          Platform.OS
        );
      } catch (err) {
        // Catch everything — push registration failure should never crash
        // the app. Common failures: iOS Simulator (no push support),
        // network errors, UNIQUE constraint violations (harmless re-registration).
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    registerToken();

    // Cleanup: if the user logs out (or the component unmounts) before
    // the async flow completes, prevent state updates on unmounted component.
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  return { permissionStatus, token, error };
}
