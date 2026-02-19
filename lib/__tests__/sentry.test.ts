// lib/__tests__/sentry.test.ts
//
// Tests for the Sentry initialization module and PII scrubbing logic.
//
// These tests verify:
// 1. initSentry() skips Sentry.init when no DSN is configured
// 2. initSentry() calls Sentry.init with the correct options when DSN exists
// 3. scrubPii() strips email, username, display_name from event.user
// 4. scrubPii() preserves user.id (UUID — not PII)
// 5. scrubPii() replaces email addresses in breadcrumb messages/data
// 6. scrubPii() handles edge cases (no user, no breadcrumbs, empty data)

import type { ErrorEvent, Breadcrumb } from "@sentry/react-native";

// ── Import scrubPii statically ─────────────────────────────────────
// scrubPii is a pure function that doesn't read env vars, so it can
// be imported once without needing module re-isolation.
import { scrubPii } from "../sentry";

describe("initSentry", () => {
  // Save and restore the original env to avoid test pollution.
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mock call counts between tests
    jest.clearAllMocks();

    // Create a fresh copy of process.env for each test so we can
    // set EXPO_PUBLIC_SENTRY_DSN without affecting other tests.
    process.env = { ...originalEnv };

    // Clear the module cache so each test gets a fresh import of
    // sentry.ts. This is needed because sentry.ts creates the
    // navigationIntegration at module scope, and we need each test
    // to get a consistent pairing of sentry module + Sentry mock.
    jest.resetModules();
  });

  afterAll(() => {
    // Restore the original environment after all tests complete.
    process.env = originalEnv;
  });

  // Helper: after resetModules, require both the sentry module AND the
  // @sentry/react-native mock so they share the same module instance.
  // Without this, the mock's init() would be a different jest.fn() than
  // the one sentry.ts calls.
  function requireFresh() {
    const sentryMod = require("../sentry") as typeof import("../sentry");
    const SentryMock = require("@sentry/react-native") as typeof import("@sentry/react-native");
    return { ...sentryMod, SentryMock };
  }

  it("does NOT call Sentry.init when EXPO_PUBLIC_SENTRY_DSN is unset", () => {
    // When no DSN is configured (e.g., local dev without a Sentry project),
    // initSentry should silently skip initialization.
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    const { initSentry, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).not.toHaveBeenCalled();
  });

  it("does NOT call Sentry.init when EXPO_PUBLIC_SENTRY_DSN is empty string", () => {
    // An empty string is falsy in JS, so it should also skip init.
    process.env.EXPO_PUBLIC_SENTRY_DSN = "";
    const { initSentry, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).not.toHaveBeenCalled();
  });

  it("calls Sentry.init with the correct DSN", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://abc@sentry.io/123";
    const { initSentry, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://abc@sentry.io/123",
      })
    );
  });

  it("sets environment to 'development' in dev mode", () => {
    // __DEV__ is true in Jest (which uses the development build of RN).
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://abc@sentry.io/123";
    const { initSentry, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "development",
      })
    );
  });

  it("sets tracesSampleRate to 1.0 in dev mode", () => {
    // In development, we want 100% of performance traces for full visibility.
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://abc@sentry.io/123";
    const { initSentry, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 1.0,
      })
    );
  });

  it("enables auto session tracking", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://abc@sentry.io/123";
    const { initSentry, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enableAutoSessionTracking: true,
      })
    );
  });

  it("disables sendDefaultPii", () => {
    // We handle user identification explicitly — no auto-attached PII.
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://abc@sentry.io/123";
    const { initSentry, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        sendDefaultPii: false,
      })
    );
  });

  it("includes navigationIntegration in integrations array", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://abc@sentry.io/123";
    const { initSentry, navigationIntegration, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: expect.arrayContaining([navigationIntegration]),
      })
    );
  });

  it("passes scrubPii as the beforeSend callback", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://abc@sentry.io/123";
    const { initSentry, scrubPii: scrubPiiFn, SentryMock } = requireFresh();

    initSentry();

    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeSend: scrubPiiFn,
      })
    );
  });
});

describe("scrubPii", () => {
  // Helper to create an ErrorEvent (Event with type: undefined).
  // ErrorEvent is a subtype of Event used specifically for error events
  // (as opposed to transaction events). beforeSend only receives ErrorEvents.
  const makeEvent = (partial: Omit<ErrorEvent, "type">): ErrorEvent => ({
    type: undefined,
    ...partial,
  });

  it("strips email, username, and display_name from event.user", () => {
    const event = makeEvent({
      user: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "user@example.com",
        username: "climber42",
        display_name: "Jane Doe",
      } as ErrorEvent["user"] & { display_name?: string },
    });

    const result = scrubPii(event);

    // UUID is preserved — it's an opaque identifier, not PII.
    expect(result.user?.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    // PII fields are deleted.
    expect(result.user?.email).toBeUndefined();
    expect(result.user?.username).toBeUndefined();
    expect((result.user as Record<string, unknown>)?.display_name).toBeUndefined();
  });

  it("replaces email addresses in breadcrumb messages with [email]", () => {
    const event = makeEvent({
      breadcrumbs: [
        {
          message: "Login attempt for user@example.com failed",
          category: "auth",
        },
      ],
    });

    const result = scrubPii(event);

    expect(result.breadcrumbs![0].message).toBe(
      "Login attempt for [email] failed"
    );
  });

  it("replaces email addresses in breadcrumb data string values", () => {
    const event = makeEvent({
      breadcrumbs: [
        {
          message: "API call",
          data: {
            email: "user@example.com",
            url: "https://api.example.com/users?email=test@test.org",
            count: 42, // Non-string values should be left alone
          },
        },
      ],
    });

    const result = scrubPii(event);

    expect(result.breadcrumbs![0].data!.email).toBe("[email]");
    expect(result.breadcrumbs![0].data!.url).toBe(
      "https://api.example.com/users?email=[email]"
    );
    // Non-string values are unchanged
    expect(result.breadcrumbs![0].data!.count).toBe(42);
  });

  it("leaves non-PII breadcrumbs unchanged", () => {
    const event = makeEvent({
      breadcrumbs: [
        {
          message: "User tapped the send button",
          category: "ui.tap",
          data: { component: "SendButton", screen: "ChatScreen" },
        },
      ],
    });

    const result = scrubPii(event);

    expect(result.breadcrumbs![0].message).toBe(
      "User tapped the send button"
    );
    expect(result.breadcrumbs![0].data).toEqual({
      component: "SendButton",
      screen: "ChatScreen",
    });
  });

  it("handles events with no user context without throwing", () => {
    const event = makeEvent({
      message: "Something went wrong",
    });

    // Should not throw when event.user is undefined
    const result = scrubPii(event);

    expect(result.message).toBe("Something went wrong");
    expect(result.user).toBeUndefined();
  });

  it("handles events with no breadcrumbs without throwing", () => {
    const event = makeEvent({
      user: { id: "abc-123" },
    });

    // Should not throw when event.breadcrumbs is undefined
    const result = scrubPii(event);

    expect(result.user?.id).toBe("abc-123");
    expect(result.breadcrumbs).toBeUndefined();
  });

  it("handles breadcrumbs with no message or data", () => {
    const event = makeEvent({
      breadcrumbs: [
        { category: "navigation" } as Breadcrumb,
        { message: undefined, data: undefined } as unknown as Breadcrumb,
      ],
    });

    // Should not throw on breadcrumbs missing message/data fields
    const result = scrubPii(event);

    expect(result.breadcrumbs).toHaveLength(2);
    expect(result.breadcrumbs![0].category).toBe("navigation");
  });
});
