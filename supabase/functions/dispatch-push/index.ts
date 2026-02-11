// supabase/functions/dispatch-push/index.ts
//
// Edge Function: Push Notification Dispatcher (Step 10.2)
//
// PURPOSE:
// Receives a notification payload, persists it to the `notifications` table,
// checks the user's push preferences and tokens, and sends push notifications
// via the Expo Push API. This is a backend utility function — it's called by
// Postgres triggers (via pg_net in future steps), not by clients directly.
//
// FLOW:
//   1. Validate Authorization header contains the service_role key
//   2. Parse + validate request body (user_id, type, title, body required)
//   3. INSERT notification row into `notifications` table
//   4. Map notification type → preference category
//   5. Check `notification_preferences` for opt-out
//   6. Fetch push tokens from `push_tokens`
//   7. Send to Expo Push API (fire-and-forget)
//   8. Return result with notification_id and push status
//
// WHY SERVICE-ROLE AUTH (NOT USER JWT)?
// This function is a system-level utility. It's invoked by Postgres triggers
// or other backend processes, not by end users. The service_role key acts as
// a shared secret between the database and the Edge Function. Client-facing
// notification endpoints would go through RLS instead.
//
// WHY ALWAYS INSERT THE NOTIFICATION?
// The `notifications` table powers the in-app notification center (Step 10.3).
// Push is just one delivery channel — even if push is skipped (user opted out,
// no tokens registered), the notification still appears in-app when they open
// the notification list.

import { createClient } from "npm:@supabase/supabase-js@2";

// ── CORS Headers ─────────────────────────────────────────────────────
// Standard CORS headers following the sign-qr pattern. Required for any
// HTTP client to call the function (though in practice, only backend
// processes will call this endpoint).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helper: JSON error response ──────────────────────────────────────
// Standardized error response builder matching the sign-qr pattern.
function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Helper: JSON success response ────────────────────────────────────
function successResponse(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Type → Category mapping ──────────────────────────────────────────
// Maps notification types (stored in the `type` column) to preference
// categories (stored in `notification_preferences.category`). This mapping
// comes from the SQL CHECK constraints on both tables:
//   - friend_send → friends
//   - route_retirement → routes
//   - comp_update → comps
//   - rank_change, badge_earned → achievements
//   - general → always sent (no category check)
const TYPE_TO_CATEGORY: Record<string, string | null> = {
  friend_send: "friends",
  route_retirement: "routes",
  comp_update: "comps",
  rank_change: "achievements",
  badge_earned: "achievements",
  general: null, // null means "always send, skip preference check"
};

// Valid notification types — matches the CHECK constraint on notifications.type
const VALID_TYPES = Object.keys(TYPE_TO_CATEGORY);

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // Only accept POST — this is a write operation
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    // ── Step 1: Validate service-role authorization ──────────────
    // Unlike sign-qr which validates user JWTs, this function only
    // accepts the service_role key. We compare the Bearer token
    // directly against the SUPABASE_SERVICE_ROLE_KEY env var.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing Authorization header", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (token !== serviceRoleKey) {
      return errorResponse("Invalid service role key", 401);
    }

    // ── Step 2: Parse and validate request body ─────────────────
    // Required fields: user_id (uuid), type (valid enum), title, body
    // Optional: data (jsonb payload for deep linking)
    const body = await req.json();
    const { user_id, type, title, body: notifBody, data } = body;

    if (!user_id || typeof user_id !== "string") {
      return errorResponse("Missing or invalid user_id", 400);
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return errorResponse(
        `Missing or invalid type. Must be one of: ${VALID_TYPES.join(", ")}`,
        400
      );
    }
    if (!title || typeof title !== "string") {
      return errorResponse("Missing or invalid title", 400);
    }
    if (!notifBody || typeof notifBody !== "string") {
      return errorResponse("Missing or invalid body", 400);
    }

    // ── Step 3: Create service-role Supabase client ─────────────
    // Service role bypasses all RLS policies, which is required because
    // the `notifications` table has no INSERT policy for authenticated
    // users — only system processes can create notifications.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // ── Step 4: Insert notification row ─────────────────────────
    // Always insert, regardless of push preferences or token availability.
    // This ensures the notification appears in the in-app notification
    // center even if push delivery is skipped.
    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert({
        user_id,
        type,
        title,
        body: notifBody,
        data: data ?? {},
      })
      .select("id")
      .single();

    if (insertError || !notification) {
      console.error("Failed to insert notification:", insertError);
      return errorResponse("Failed to create notification", 500);
    }

    const notificationId = notification.id;

    // ── Step 5: Check notification preferences ──────────────────
    // Map the notification type to its preference category. If the
    // category is null (i.e., "general"), skip the preference check
    // entirely — general notifications always send.
    const category = TYPE_TO_CATEGORY[type];

    if (category !== null) {
      // Opt-out model: no row = enabled. We only need to check if
      // a row exists with enabled = false.
      const { data: pref } = await supabase
        .from("notification_preferences")
        .select("enabled")
        .eq("user_id", user_id)
        .eq("category", category)
        .maybeSingle();

      // If an explicit preference row exists and is disabled, skip push
      if (pref && pref.enabled === false) {
        return successResponse({
          notification_id: notificationId,
          pushed: false,
          reason: "opted_out",
        });
      }
    }

    // ── Step 6: Fetch push tokens ───────────────────────────────
    // A user can have multiple tokens (phone + tablet). We send to
    // all of them. If they have none, we report that — the in-app
    // notification was still created in Step 4.
    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", user_id);

    if (tokenError) {
      console.error("Failed to fetch push tokens:", tokenError);
      // Non-fatal — notification was already created
      return successResponse({
        notification_id: notificationId,
        pushed: false,
        reason: "token_fetch_error",
      });
    }

    if (!tokens || tokens.length === 0) {
      return successResponse({
        notification_id: notificationId,
        pushed: false,
        reason: "no_tokens",
      });
    }

    // ── Step 7: Send to Expo Push API ───────────────────────────
    // Fire-and-forget: we attempt the push but don't fail the request
    // if Expo's API is down or rejects the tokens. Push is best-effort.
    // The Expo Push API accepts an array of messages in a single request.
    const pushTokens = tokens.map((t: { token: string }) => t.token);

    try {
      const pushResponse = await fetch(
        "https://exp.host/--/api/v2/push/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            to: pushTokens,
            title,
            body: notifBody,
            data: data ?? {},
          }),
        }
      );

      if (!pushResponse.ok) {
        // Log the failure but don't fail the request — notification
        // was already persisted and will appear in-app.
        const errBody = await pushResponse.text();
        console.error(
          `Expo Push API error: ${pushResponse.status} ${errBody}`
        );
      }
    } catch (pushErr) {
      // Network error reaching Expo's API — log and continue
      console.error("Expo Push API network error:", pushErr);
    }

    // ── Step 8: Return success ──────────────────────────────────
    return successResponse({
      notification_id: notificationId,
      pushed: true,
      token_count: pushTokens.length,
    });
  } catch (err) {
    // Catch-all for unexpected errors (JSON parse failures, etc.)
    console.error("dispatch-push error:", err);
    return errorResponse("Internal server error", 500);
  }
});
