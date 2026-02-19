// lib/sentry.ts
//
// Sentry SDK initialization and PII scrubbing for error tracking.
//
// WHY SENTRY?
// Without error tracking, unhandled crashes and JS errors vanish silently.
// Sentry captures these errors, groups them by root cause, and surfaces them
// in a dashboard so we can fix bugs users actually hit.
//
// WHY PII SCRUBBING?
// Sentry events can accidentally include user data (emails in breadcrumbs,
// usernames in error messages). GDPR and good practice require us to strip
// personally identifiable information before it leaves the device. We keep
// only the user's UUID (not PII — it's an opaque identifier).
//
// WHY A SEPARATE MODULE?
// Sentry.init() must run at module scope (before any component renders) so
// it can capture errors from the very first render. Isolating it here keeps
// the root layout clean and makes the init + PII logic independently testable.

import * as Sentry from "@sentry/react-native";
import type { ErrorEvent, Breadcrumb } from "@sentry/react-native";

// Email regex for scrubbing PII from breadcrumb strings.
// Matches common email patterns like user@example.com.
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Navigation integration — created at module scope so it's available
 * for both Sentry.init() (as an integration) and the root layout
 * (to call registerNavigationContainer with the navigation ref).
 *
 * enableTimeToInitialDisplay tracks how long it takes from navigation
 * dispatch to the first rendered frame of the new screen — useful for
 * identifying slow screen transitions.
 */
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

/**
 * Scrubs personally identifiable information from Sentry events.
 *
 * Used as Sentry's `beforeSend` callback — every event passes through
 * this function before being transmitted to Sentry's servers.
 *
 * What we strip:
 * - user.email, user.username, user.display_name (PII fields)
 * - Email addresses found in breadcrumb messages and data values
 *
 * What we keep:
 * - user.id (UUID — opaque identifier, not PII)
 * - All other event data (stack traces, tags, contexts)
 */
export function scrubPii(event: ErrorEvent): ErrorEvent {
  // Strip PII fields from the user context, if present.
  // We keep user.id because UUIDs are opaque identifiers that can't
  // be used to identify a person without access to our database.
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    // display_name isn't a standard Sentry field but could be set
    // via setUser() — delete it defensively.
    delete (event.user as Record<string, unknown>).display_name;
  }

  // Scrub email addresses from breadcrumb messages and data values.
  // Breadcrumbs are a trail of events (clicks, API calls, console logs)
  // leading up to the error. They can accidentally contain email addresses
  // in log messages or request/response data.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(
      (breadcrumb: Breadcrumb): Breadcrumb => {
        // Clone the breadcrumb to avoid mutating the original
        const scrubbed = { ...breadcrumb };

        // Scrub email from the breadcrumb message (e.g., "Login attempt for user@example.com")
        if (typeof scrubbed.message === "string") {
          scrubbed.message = scrubbed.message.replace(EMAIL_REGEX, "[email]");
        }

        // Scrub email from data values (key-value metadata attached to breadcrumbs)
        if (scrubbed.data) {
          scrubbed.data = { ...scrubbed.data };
          for (const key of Object.keys(scrubbed.data)) {
            if (typeof scrubbed.data[key] === "string") {
              scrubbed.data[key] = (scrubbed.data[key] as string).replace(
                EMAIL_REGEX,
                "[email]"
              );
            }
          }
        }

        return scrubbed;
      }
    );
  }

  return event;
}

/**
 * Initialize the Sentry SDK.
 *
 * Call this at module scope in the root layout (before any component renders)
 * so Sentry captures errors from the very first render cycle.
 *
 * If EXPO_PUBLIC_SENTRY_DSN is not set, Sentry is silently disabled.
 * This is the expected state for local development without a Sentry project.
 */
export function initSentry(): void {
  // DSN (Data Source Name) is the URL that tells the Sentry SDK where to
  // send events. It's set via an environment variable so it can differ
  // between dev/staging/production and isn't hardcoded in the source.
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  // Early return if no DSN is configured — Sentry is optional for local dev.
  // This prevents Sentry from logging warnings about missing configuration.
  if (!dsn) return;

  Sentry.init({
    dsn,

    // Tag events with the environment so we can filter dev noise from
    // production errors in the Sentry dashboard.
    // __DEV__ is a React Native global that's true in development builds
    // and false in production (set by Metro bundler).
    environment: __DEV__ ? "development" : "production",

    // tracesSampleRate controls what percentage of transactions (performance
    // traces) are sent to Sentry. 1.0 = 100% in dev (we want full visibility),
    // 0.2 = 20% in production (to reduce costs and noise).
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,

    // Automatically track app sessions (foreground/background transitions).
    // This powers the "crash-free sessions" metric in Sentry's Release Health.
    enableAutoSessionTracking: true,

    // Wire up the React Navigation integration so Sentry creates performance
    // transactions for each screen navigation (e.g., "tabs → gym/[id]").
    integrations: [navigationIntegration],

    // Run every event through our PII scrubber before it leaves the device.
    beforeSend: scrubPii,

    // Don't automatically attach PII (IP address, cookies, etc.) to events.
    // We handle user identification explicitly via setUser() with just the UUID.
    sendDefaultPii: false,
  });
}
