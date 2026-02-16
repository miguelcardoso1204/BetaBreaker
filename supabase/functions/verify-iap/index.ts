// supabase/functions/verify-iap/index.ts
//
// Edge Function: Server-Side IAP Receipt Verification
//
// PURPOSE:
// After a user purchases a subscription through the App Store or Play Store,
// the mobile app sends the receipt to this function for server-side validation.
// Client-side receipts can be forged — this function validates them with the
// store's API before granting pro access.
//
// FLOW:
//   1. Authenticate the caller via Bearer JWT (ensure it's a real logged-in user)
//   2. Parse body: { store, receipt, product_id, transaction_id }
//   3. Validate the receipt with Apple/Google servers
//   4. On valid: INSERT into subscription_events (idempotent via ON CONFLICT)
//   5. UPDATE profiles.tier = 'pro'
//   6. Return { success: true, tier: 'pro', expires_at }
//
// SECURITY:
// - User identity verified via supabase.auth.getUser()
// - Receipt validated with Apple/Google (prevents forged receipts)
// - DB writes use service_role (bypasses RLS) — only this function can write events
// - UNIQUE constraint on (store, store_transaction_id) prevents duplicate grants
//
// Following the patterns established by sign-qr:
// - CORS preflight handling
// - Auth header extraction → user-scoped client → getUser()
// - Service role client for DB writes
// - JSON error response helper

import { createClient } from "npm:@supabase/supabase-js@2";

// ── CORS Headers ─────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helper: JSON error response ──────────────────────────────────────
function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Helper: JSON success response ────────────────────────────────────
function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Apple receipt validation ─────────────────────────────────────────
// Validates a receipt with Apple's App Store Server API.
// In production, this would use the App Store Server API v2 with JWS.
// For now, we use the legacy verifyReceipt endpoint for simplicity.
//
// NOTE: The legacy verifyReceipt endpoint is being deprecated by Apple.
// A future iteration should migrate to the App Store Server API v2
// which uses signed JWS transactions instead of receipt blobs.
async function validateAppleReceipt(receipt: string): Promise<{
  valid: boolean;
  expiresAt: string | null;
}> {
  // Apple's shared secret for receipt validation (set via supabase secrets)
  const sharedSecret = Deno.env.get("APPLE_SHARED_SECRET");

  // Try production first, then sandbox (Apple's recommended approach).
  // If the production endpoint returns status 21007, the receipt is from
  // the sandbox environment — retry against the sandbox URL.
  const urls = [
    "https://buy.itunes.apple.com/verifyReceipt",
    "https://sandbox.itunes.apple.com/verifyReceipt",
  ];

  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "receipt-data": receipt,
        password: sharedSecret,
        "exclude-old-transactions": true,
      }),
    });

    const data = await response.json();

    // Status 0 = valid receipt
    if (data.status === 0) {
      // Extract the latest subscription expiration date
      const latestInfo = data.latest_receipt_info?.[0];
      const expiresMs = latestInfo?.expires_date_ms;
      const expiresAt = expiresMs
        ? new Date(parseInt(expiresMs)).toISOString()
        : null;

      return { valid: true, expiresAt };
    }

    // Status 21007 = sandbox receipt sent to production — try sandbox URL next
    if (data.status === 21007) continue;

    // Any other non-zero status = invalid receipt
    return { valid: false, expiresAt: null };
  }

  return { valid: false, expiresAt: null };
}

// ── Google receipt validation ────────────────────────────────────────
// Validates a receipt with Google Play Developer API.
// Requires a service account with access to the Play Developer API.
//
// NOTE: In production, this uses OAuth2 with a service account key.
// The service account JSON is stored as GOOGLE_SERVICE_ACCOUNT env var.
async function validateGoogleReceipt(
  receipt: string,
  productId: string
): Promise<{
  valid: boolean;
  expiresAt: string | null;
}> {
  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT");
  if (!serviceAccountJson) {
    console.error("GOOGLE_SERVICE_ACCOUNT env var not set");
    return { valid: false, expiresAt: null };
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);

    // Build a JWT for Google OAuth2 token exchange.
    // The service account signs a JWT → exchanges it for an access token
    // → uses the access token to call the Play Developer API.
    //
    // For now, we parse the purchase token from the receipt and call
    // the subscriptions.get endpoint to check its status.
    const purchaseToken = receipt;
    const packageName = "com.betabreaker";

    // Exchange service account credentials for an access token
    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: serviceAccount.token, // Simplified — production uses proper JWT signing
        }),
      }
    );

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return { valid: false, expiresAt: null };
    }

    // Check the subscription status with Google Play
    const subResponse = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const subData = await subResponse.json();

    // expiryTimeMillis is set for active subscriptions
    if (subData.expiryTimeMillis) {
      const expiresAt = new Date(
        parseInt(subData.expiryTimeMillis)
      ).toISOString();
      return { valid: true, expiresAt };
    }

    return { valid: false, expiresAt: null };
  } catch (err) {
    console.error("Google receipt validation error:", err);
    return { valid: false, expiresAt: null };
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
    // ── Step 1: Authenticate the caller ────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing Authorization header", 401);
    }

    // User-scoped client to verify identity
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return errorResponse("Invalid or expired auth token", 401);
    }

    // ── Step 2: Parse request body ─────────────────────────────────
    const body = await req.json();
    const { store, receipt, product_id, transaction_id } = body;

    if (!store || !receipt || !product_id || !transaction_id) {
      return errorResponse(
        "Missing required fields: store, receipt, product_id, transaction_id",
        400
      );
    }

    if (store !== "apple" && store !== "google") {
      return errorResponse("Invalid store. Must be 'apple' or 'google'", 400);
    }

    // ── Step 3: Validate receipt with store ─────────────────────────
    const validation =
      store === "apple"
        ? await validateAppleReceipt(receipt)
        : await validateGoogleReceipt(receipt, product_id);

    if (!validation.valid) {
      return errorResponse("Receipt validation failed", 403);
    }

    // ── Step 4: Record event + update tier (service role) ──────────
    // Service role bypasses RLS — only Edge Functions should write events.
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // INSERT with ON CONFLICT DO NOTHING for idempotency — if a webhook
    // already recorded this transaction, we skip the insert silently.
    await supabaseService.from("subscription_events").upsert(
      {
        user_id: user.id,
        event_type: "purchase",
        store,
        store_transaction_id: transaction_id,
        store_product_id: product_id,
        receipt_data: receipt,
        expires_at: validation.expiresAt,
      },
      {
        onConflict: "store,store_transaction_id",
        ignoreDuplicates: true,
      }
    );

    // Update the user's tier to 'pro'
    await supabaseService
      .from("profiles")
      .update({ tier: "pro" })
      .eq("id", user.id);

    // ── Step 5: Return success ──────────────────────────────────────
    return jsonResponse({
      success: true,
      tier: "pro",
      expires_at: validation.expiresAt,
    });
  } catch (err) {
    console.error("verify-iap error:", err);
    return errorResponse("Internal server error", 500);
  }
});
