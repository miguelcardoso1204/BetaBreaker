// supabase/functions/redeem-promo/index.ts
//
// Edge Function: Promo Code Redemption
//
// PURPOSE:
// When a user enters a promo code in the Paywall's PromoCodeInput, this
// function validates the code and grants a trial period of Pro access.
//
// FLOW:
//   1. Authenticate the caller via Bearer JWT
//   2. Parse body: { code }
//   3. Look up the promo code — must exist, be active, and have uses left
//   4. Check the code type is 'trial' (only supported type for now)
//   5. Check user hasn't already used a trial (UNIQUE(user_id) in user_trials)
//   6. INSERT into user_trials with calculated expires_at
//   7. INCREMENT promo_codes.current_uses
//   8. UPDATE profiles.tier = 'pro'
//   9. Return { success, tier, trial_expires_at, duration_days }
//
// SECURITY:
// - User identity verified via supabase.auth.getUser()
// - DB writes use service_role (bypasses RLS) — clients can't write directly
// - One trial per user enforced by UNIQUE constraint on user_trials.user_id
//
// Mirrors the verify-iap Edge Function patterns: CORS, auth, service_role writes.

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

    // User-scoped client to verify identity via the JWT
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
    const { code } = body;

    if (!code || typeof code !== "string") {
      return errorResponse("Missing required field: code", 400);
    }

    // ── Service role client for all DB writes ──────────────────────
    // Bypasses RLS — promo_codes and user_trials have no INSERT policies
    // for authenticated users. Only this Edge Function can write to them.
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Step 3: Look up the promo code ─────────────────────────────
    const { data: promoCode, error: lookupError } = await supabaseService
      .from("promo_codes")
      .select("*")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();

    if (lookupError) {
      console.error("Promo code lookup error:", lookupError);
      return errorResponse("Internal server error", 500);
    }

    if (!promoCode) {
      return errorResponse("Invalid or inactive promo code", 404);
    }

    // ── Step 4: Check uses remaining ───────────────────────────────
    if (promoCode.current_uses >= promoCode.max_uses) {
      return errorResponse("This promo code has been fully redeemed", 409);
    }

    // ── Step 5: Check code type is 'trial' ─────────────────────────
    // 'discount' type is reserved for future use — we only handle trials.
    if (promoCode.type !== "trial") {
      return errorResponse("Unsupported promo code type", 400);
    }

    // ── Step 6: Check user hasn't already had a trial ──────────────
    const { data: existingTrial } = await supabaseService
      .from("user_trials")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingTrial) {
      return errorResponse("You have already used a trial", 409);
    }

    // ── Step 7: Calculate trial expiration ──────────────────────────
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + promoCode.duration_days);

    // ── Step 8: Insert trial record ────────────────────────────────
    const { error: trialInsertError } = await supabaseService
      .from("user_trials")
      .insert({
        user_id: user.id,
        promo_code_id: promoCode.id,
        expires_at: expiresAt.toISOString(),
      });

    if (trialInsertError) {
      console.error("Trial insert error:", trialInsertError);
      // UNIQUE violation = user already has a trial (race condition guard)
      if (trialInsertError.code === "23505") {
        return errorResponse("You have already used a trial", 409);
      }
      return errorResponse("Internal server error", 500);
    }

    // ── Step 9: Increment promo code usage counter ─────────────────
    await supabaseService
      .from("promo_codes")
      .update({ current_uses: promoCode.current_uses + 1 })
      .eq("id", promoCode.id);

    // ── Step 10: Upgrade user tier to pro ───────────────────────────
    await supabaseService
      .from("profiles")
      .update({ tier: "pro" })
      .eq("id", user.id);

    // ── Step 11: Return success ────────────────────────────────────
    return jsonResponse({
      success: true,
      tier: "pro",
      trial_expires_at: expiresAt.toISOString(),
      duration_days: promoCode.duration_days,
    });
  } catch (err) {
    console.error("redeem-promo error:", err);
    return errorResponse("Internal server error", 500);
  }
});
