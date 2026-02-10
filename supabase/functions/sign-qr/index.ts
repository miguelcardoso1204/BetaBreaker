// supabase/functions/sign-qr/index.ts
//
// Edge Function: QR Code Signing for Gym Routes
//
// PURPOSE:
// Generates signed JWT tokens that gym admins print as QR codes on route
// labels. When a climber scans the QR, the client-side `verifyQrToken()`
// (utils/qr.ts) verifies the signature using the embedded public key and
// extracts the route/gym IDs.
//
// FLOW:
//   1. Admin sends POST with { route_id } + their auth token
//   2. We verify the admin's identity via Supabase Auth
//   3. We look up the route to get its gym_id (service role — bypasses RLS)
//   4. We check the admin has gym_admin or super_admin role at that gym
//   5. We sign a JWT with route_id (sub), gym_id, iat, exp (30 days)
//   6. Return { token } — the admin prints this as a QR code
//
// WHY EDGE FUNCTION (NOT CLIENT-SIDE)?
// The private signing key must never leave the server. If it were in the
// client bundle, anyone could forge QR codes for any route. Edge Functions
// run in Deno on Supabase's infrastructure — the private key stays in env.
//
// SECURITY:
// - User identity verified via supabase.auth.getUser() (validates their JWT)
// - DB queries use service_role client (bypasses RLS) for reliable lookups
// - Role check ensures only gym_admin+ can generate QR codes
// - Private key loaded from QR_PRIVATE_KEY env var (never in code)
//
// THIS IS THE PROJECT'S FIRST EDGE FUNCTION — it establishes patterns
// (CORS handling, auth extraction, service role client, error responses)
// that future Edge Functions (push dispatch, billing webhooks) will follow.

// Deno Edge Functions use npm: specifiers — the Supabase runtime resolves
// these automatically without a package.json or node_modules directory.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importJWK } from "npm:jose@5";

// ── CORS Headers ─────────────────────────────────────────────────────
// Every Edge Function response needs CORS headers so the mobile app (and
// any web client) can call it. These are permissive for development —
// production should restrict Access-Control-Allow-Origin to the app domain.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helper: JSON error response ──────────────────────────────────────
// Standardized error response builder. Every error path returns JSON with
// an `error` field and the appropriate HTTP status code.
function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Main handler ─────────────────────────────────────────────────────
// Deno.serve() registers this function as the request handler. Supabase
// routes all requests to /functions/v1/sign-qr here.
Deno.serve(async (req: Request) => {
  // Handle CORS preflight (OPTIONS) requests. Browsers send these before
  // the actual POST to check if the server allows the request. Return 200
  // with CORS headers and no body.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // Only accept POST requests — this is a write operation (generating a token).
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    // ── Step 1: Authenticate the caller ────────────────────────────
    // Extract the Authorization header (Bearer <jwt>) that the admin's
    // app sent. We use this to create a user-scoped Supabase client that
    // can verify who they are.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing Authorization header", 401);
    }

    // Create a user-scoped Supabase client using the caller's JWT.
    // SUPABASE_URL and SUPABASE_ANON_KEY are auto-injected by the
    // Supabase runtime — we don't need to set them in .env.local.
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Verify the caller's identity. getUser() validates the JWT and
    // returns the user object (id, email, etc.) if the token is valid.
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return errorResponse("Invalid or expired auth token", 401);
    }

    // ── Step 2: Parse and validate the request body ────────────────
    // The admin sends { route_id: "<uuid>" } to specify which route
    // they want to generate a QR code for.
    const body = await req.json();
    const routeId = body?.route_id;

    if (!routeId || typeof routeId !== "string") {
      return errorResponse("Missing or invalid route_id in request body", 400);
    }

    // ── Step 3: Look up the route using service role ───────────────
    // We use the service_role key (not the user's token) because:
    //   - Archived routes are hidden from non-setters by RLS
    //   - We need the gym_id from the route regardless of its status
    // The service role bypasses all RLS policies.
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: route, error: routeError } = await supabaseService
      .from("routes")
      .select("id, gym_id")
      .eq("id", routeId)
      .single();

    if (routeError || !route) {
      return errorResponse("Route not found", 404);
    }

    // ── Step 4: Verify the caller has admin role at this gym ───────
    // Only gym_admin and super_admin roles can generate QR codes.
    // We check the user_gym_roles table using the service role client
    // (bypasses RLS which normally restricts who can see roles).
    const { data: roleRow } = await supabaseService
      .from("user_gym_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("gym_id", route.gym_id)
      .in("role", ["gym_admin", "super_admin"])
      .maybeSingle();

    if (!roleRow) {
      return errorResponse(
        "Insufficient permissions — gym_admin or super_admin role required",
        403
      );
    }

    // ── Step 5: Sign the QR JWT ────────────────────────────────────
    // Load the EC P-256 private key from the environment. The key is
    // stored as a JWK JSON string in QR_PRIVATE_KEY.
    const privateKeyEnv = Deno.env.get("QR_PRIVATE_KEY");
    if (!privateKeyEnv) {
      // This is a server configuration error, not a user error.
      console.error("QR_PRIVATE_KEY environment variable is not set");
      return errorResponse("Internal server error", 500);
    }

    // Parse the JWK JSON and import it as a CryptoKey for signing.
    const privateKeyJwk = JSON.parse(privateKeyEnv);
    const privateKey = await importJWK(privateKeyJwk, "ES256");

    // Build and sign the JWT. Claims:
    //   sub    — route UUID (standard JWT "subject")
    //   gym_id — which gym the route belongs to (custom claim)
    //   iat    — issued at (set automatically by setIssuedAt)
    //   exp    — 30 days from now (QR codes on gym walls last a while)
    const token = await new SignJWT({ gym_id: route.gym_id })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject(routeId)
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(privateKey);

    // ── Step 6: Return the signed token ────────────────────────────
    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Catch-all for unexpected errors (JSON parse failures, crypto errors, etc.)
    // Log the actual error for debugging but return a generic message to the client.
    console.error("sign-qr error:", err);
    return errorResponse("Internal server error", 500);
  }
});
