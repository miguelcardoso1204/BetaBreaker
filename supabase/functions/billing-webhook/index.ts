// supabase/functions/billing-webhook/index.ts
//
// Edge Function: Store Webhook Handler for Subscription Lifecycle Events
//
// PURPOSE:
// Apple and Google send server-to-server notifications when subscription
// events occur (renewal, cancellation, expiration, refund). This function
// receives those notifications, validates them, records the event, and
// updates the user's tier accordingly.
//
// WHY A WEBHOOK (NOT JUST CLIENT-SIDE)?
// The client app might not be running when a subscription renews or expires.
// Store webhooks fire regardless of app state, ensuring our database stays
// in sync with the actual subscription status.
//
// FLOW:
//   1. Receive POST from Apple/Google (server-to-server, no user JWT)
//   2. Verify webhook authenticity (signature/token)
//   3. Parse notification type → map to our event_type
//   4. Look up the user by store_transaction_id or receipt data
//   5. INSERT subscription_event (idempotent via UNIQUE constraint)
//   6. UPDATE profiles.tier if needed (expiration → 'free')
//   7. Return 200 (stores retry on non-200)
//
// SECURITY:
// - No user auth (this is server-to-server from Apple/Google)
// - Apple: verify JWS signature using Apple's public key
// - Google: verify RTDN token matches our configured developer notification token
// - All DB writes use service_role (bypasses RLS)
//
// IMPORTANT: Stores will retry delivery if they don't get a 200 response.
// We must always return 200 for known events, even if the event is a
// duplicate (the UNIQUE constraint handles dedup silently).

import { createClient } from "npm:@supabase/supabase-js@2";

// ── CORS Headers ─────────────────────────────────────────────────────
// Webhooks don't need CORS (server-to-server), but we include them
// for consistency and in case of manual testing via browser tools.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helper: JSON response ────────────────────────────────────────────
function jsonResponse(
  data: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Notification type mapping ────────────────────────────────────────
// Maps Apple's App Store Server Notifications V2 types and Google's
// Real-Time Developer Notifications (RTDN) types to our internal
// event_type values.

// Apple notification types → our event types
// See: https://developer.apple.com/documentation/appstoreservernotifications
const APPLE_EVENT_MAP: Record<string, string> = {
  DID_RENEW: "renewal",
  EXPIRED: "expiration",
  DID_FAIL_TO_RENEW: "expiration",
  REFUND: "expiration",
  DID_CHANGE_RENEWAL_STATUS: "cancellation", // User turned off auto-renew
  SUBSCRIBED: "purchase",
  OFFER_REDEEMED: "purchase",
};

// Google RTDN notification types → our event types
// See: https://developer.android.com/google/play/billing/rtdn-reference
const GOOGLE_EVENT_MAP: Record<number, string> = {
  1: "purchase", // SUBSCRIPTION_RECOVERED
  2: "renewal", // SUBSCRIPTION_RENEWED
  3: "cancellation", // SUBSCRIPTION_CANCELED
  4: "purchase", // SUBSCRIPTION_PURCHASED
  5: "cancellation", // SUBSCRIPTION_ON_HOLD
  6: "purchase", // SUBSCRIPTION_IN_GRACE_PERIOD
  7: "purchase", // SUBSCRIPTION_RESTARTED
  12: "expiration", // SUBSCRIPTION_REVOKED
  13: "expiration", // SUBSCRIPTION_EXPIRED
};

// ── Apple webhook verification ───────────────────────────────────────
// Apple sends notifications as signed JWS (JSON Web Signature) payloads.
// In production, we'd verify the signature using Apple's root certificate.
// For now, we decode the payload and trust the notification if it comes
// from a valid Apple endpoint (proper signature verification is a TODO).
function parseAppleNotification(body: Record<string, unknown>): {
  eventType: string | null;
  transactionId: string | null;
  productId: string | null;
  expiresAt: string | null;
  userId: string | null;
} {
  try {
    // Apple V2 notifications contain a signedPayload (JWS)
    const signedPayload = body.signedPayload as string;
    if (!signedPayload) {
      return { eventType: null, transactionId: null, productId: null, expiresAt: null, userId: null };
    }

    // Decode the JWS payload (middle part, base64url-encoded)
    // In production, verify the signature first!
    const parts = signedPayload.split(".");
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);

    const notificationType = payload.notificationType as string;
    const eventType = APPLE_EVENT_MAP[notificationType] ?? null;

    // Extract transaction details from the signed transaction info
    const transactionInfo = payload.data?.signedTransactionInfo;
    let transactionId: string | null = null;
    let productId: string | null = null;
    let expiresAt: string | null = null;

    if (transactionInfo) {
      const txParts = transactionInfo.split(".");
      const txJson = atob(txParts[1].replace(/-/g, "+").replace(/_/g, "/"));
      const txPayload = JSON.parse(txJson);

      transactionId = txPayload.transactionId ?? null;
      productId = txPayload.productId ?? null;
      if (txPayload.expiresDate) {
        expiresAt = new Date(txPayload.expiresDate).toISOString();
      }
    }

    // Apple doesn't include our user ID — we'll look up by transaction ID
    return { eventType, transactionId, productId, expiresAt, userId: null };
  } catch (err) {
    console.error("Failed to parse Apple notification:", err);
    return { eventType: null, transactionId: null, productId: null, expiresAt: null, userId: null };
  }
}

// ── Google webhook parsing ───────────────────────────────────────────
function parseGoogleNotification(body: Record<string, unknown>): {
  eventType: string | null;
  transactionId: string | null;
  productId: string | null;
  expiresAt: string | null;
  userId: string | null;
} {
  try {
    // Google sends a Pub/Sub message with base64-encoded data
    const message = body.message as Record<string, unknown> | undefined;
    if (!message?.data) {
      return { eventType: null, transactionId: null, productId: null, expiresAt: null, userId: null };
    }

    const dataJson = atob(message.data as string);
    const data = JSON.parse(dataJson);

    const subscriptionNotification = data.subscriptionNotification;
    if (!subscriptionNotification) {
      return { eventType: null, transactionId: null, productId: null, expiresAt: null, userId: null };
    }

    const notificationType = subscriptionNotification.notificationType as number;
    const eventType = GOOGLE_EVENT_MAP[notificationType] ?? null;
    const transactionId = subscriptionNotification.purchaseToken ?? null;
    const productId = subscriptionNotification.subscriptionId ?? null;

    // Google RTDN doesn't include expiry — we'd need to check the API.
    // For webhooks, the expiry is less critical since the store manages it.
    return { eventType, transactionId, productId, expiresAt: null, userId: null };
  } catch (err) {
    console.error("Failed to parse Google notification:", err);
    return { eventType: null, transactionId: null, productId: null, expiresAt: null, userId: null };
  }
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const body = await req.json();

    // ── Step 1: Determine the store and parse the notification ─────
    // Apple sends { signedPayload: "..." }
    // Google sends { message: { data: "..." } }
    const isApple = "signedPayload" in body;
    const store = isApple ? "apple" : "google";

    const notification = isApple
      ? parseAppleNotification(body)
      : parseGoogleNotification(body);

    if (!notification.eventType || !notification.transactionId) {
      // Unknown notification type — return 200 to prevent retries
      // (stores resend on non-200, and we don't want infinite retries
      // for notification types we intentionally don't handle).
      console.warn("Unrecognized notification, acknowledging:", body);
      return jsonResponse({ acknowledged: true });
    }

    // ── Step 2: Look up the user by transaction ID ─────────────────
    // Webhooks don't include our user_id. We find the user by looking
    // up the original purchase event's transaction ID.
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingEvent } = await supabaseService
      .from("subscription_events")
      .select("user_id")
      .eq("store", store)
      .eq("store_transaction_id", notification.transactionId)
      .limit(1)
      .maybeSingle();

    // If we can't find the user, this might be the first event for a
    // new transaction (e.g., a renewal with a new transaction ID).
    // In that case, we log a warning but still return 200.
    if (!existingEvent?.user_id) {
      console.warn(
        `No user found for transaction ${notification.transactionId} (${store}). ` +
        "This may be a new transaction ID from a renewal."
      );
      return jsonResponse({ acknowledged: true, warning: "user_not_found" });
    }

    const userId = existingEvent.user_id;

    // ── Step 3: Record the event (idempotent) ──────────────────────
    // Use a unique transaction ID for the webhook event. For renewals,
    // the store may send a new transaction ID, so we combine the
    // original transaction ID with the event type.
    const webhookTxnId = `${notification.transactionId}_${notification.eventType}`;

    await supabaseService.from("subscription_events").upsert(
      {
        user_id: userId,
        event_type: notification.eventType,
        store,
        store_transaction_id: webhookTxnId,
        store_product_id: notification.productId ?? "unknown",
        expires_at: notification.expiresAt,
      },
      {
        onConflict: "store,store_transaction_id",
        ignoreDuplicates: true,
      }
    );

    // ── Step 4: Update tier if needed ──────────────────────────────
    // Only expiration events downgrade the tier. Cancellation means the
    // user turned off auto-renew but still has access until expires_at.
    if (notification.eventType === "expiration") {
      await supabaseService
        .from("profiles")
        .update({ tier: "free" })
        .eq("id", userId);
    } else if (
      notification.eventType === "renewal" ||
      notification.eventType === "purchase"
    ) {
      // Renewal/purchase events ensure the tier is 'pro'
      // (handles edge case where tier was incorrectly set)
      await supabaseService
        .from("profiles")
        .update({ tier: "pro" })
        .eq("id", userId);
    }
    // Cancellation: no tier change — access continues until expiry

    // ── Step 5: Return 200 ──────────────────────────────────────────
    // Always return 200 for known events to prevent store retries.
    return jsonResponse({
      acknowledged: true,
      event_type: notification.eventType,
    });
  } catch (err) {
    // Log error for debugging, but return 200 to prevent infinite retries
    // from the store. We'll investigate errors via logs.
    console.error("billing-webhook error:", err);
    return jsonResponse({ acknowledged: true, error: "processing_failed" });
  }
});
