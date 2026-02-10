// utils/qr.ts
//
// Pure utility for verifying QR code JWT tokens scanned from gym routes.
//
// HOW QR CODES WORK IN BETA BREAKER:
// Each climbing route in a gym has a physical QR code on the wall next to it.
// The QR contains a JWT (JSON Web Token) signed by the gym's Edge Function
// using an EC P-256 private key. When a climber scans the QR, this module
// verifies the JWT's signature using the app's embedded public key, extracts
// the route and gym IDs from the claims, and returns them to the scan screen.
//
// WHY JWT INSTEAD OF A PLAIN URL?
// JWTs are tamper-proof — if someone tries to modify the route_id inside the
// QR code, the signature check will fail. This prevents fake QR codes from
// redirecting climbers to wrong routes or injecting malicious data.
//
// DEPENDENCIES:
// - `jose` — isomorphic JWT library that works in React Native (no Node.js
//   crypto needed). Uses the Web Crypto API under the hood.
// - `QR_PUBLIC_KEY` from constants — the EC P-256 public key in JWK format.

import { jwtVerify, importJWK } from 'jose';
import { QR_PUBLIC_KEY } from '@/lib/constants';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Shape of the JWT claims we expect in a route QR code.
 *
 * These claims are set by the sign-qr Edge Function when generating the JWT:
 *   sub    — the route's UUID (standard JWT "subject" claim)
 *   gym_id — which gym the route belongs to (custom claim)
 *   iat    — "issued at" timestamp (standard JWT claim)
 *   exp    — expiration timestamp (standard JWT claim)
 */
export interface QrPayload {
  sub: string;      // route_id (UUID)
  gym_id: string;   // gym_id (UUID)
  iat: number;      // issued at (Unix seconds)
  exp: number;      // expires at (Unix seconds)
}

/**
 * Discriminated union for QR verification results.
 *
 * Using a discriminated union (tagged by `ok`) is a common pattern for
 * operations that can either succeed or fail with an error message.
 * The caller uses `if (result.ok)` to narrow the type — TypeScript
 * then knows the payload exists on the success branch and the error
 * exists on the failure branch.
 */
export type QrResult =
  | { ok: true; payload: QrPayload }
  | { ok: false; error: string };

// ── Verification ─────────────────────────────────────────────────────

/**
 * Verify a scanned QR string as a valid signed JWT.
 *
 * Steps:
 * 1. Import the app's public key from JWK format into a CryptoKey
 * 2. Call jose's `jwtVerify` which checks signature + expiration
 * 3. Extract `sub` (route_id) and `gym_id` from the verified payload
 * 4. Validate that both required claims are present
 *
 * @param token - The raw string scanned from the QR code (should be a JWT)
 * @returns A QrResult — either `{ ok: true, payload }` or `{ ok: false, error }`
 */
export async function verifyQrToken(token: string): Promise<QrResult> {
  try {
    // Step 1: Convert the JWK (plain JSON object) into a CryptoKey that
    // jose can use for signature verification. We specify 'ES256' as the
    // expected algorithm to prevent algorithm confusion attacks.
    const publicKey = await importJWK(QR_PUBLIC_KEY, 'ES256');

    // Step 2: Verify the JWT's signature and check expiration.
    // jwtVerify throws if the signature is invalid, the token is expired,
    // or the token is malformed. The `algorithms` option restricts which
    // signing algorithms are accepted — only ES256 (ECDSA P-256).
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['ES256'],
    });

    // Step 3: Extract the required claims from the verified payload.
    const sub = payload.sub;
    const gymId = payload.gym_id as string | undefined;

    // Step 4: Validate that both route_id and gym_id are present.
    // The JWT signature being valid doesn't guarantee the claims are
    // complete — a misconfigured Edge Function could omit fields.
    if (!sub || !gymId) {
      return {
        ok: false,
        error: 'Missing required claims: sub (route_id) and gym_id are both required',
      };
    }

    // All checks passed — return the extracted payload.
    return {
      ok: true,
      payload: {
        sub,
        gym_id: gymId,
        iat: payload.iat ?? 0,
        exp: payload.exp ?? 0,
      },
    };
  } catch (err) {
    // Catch all jose errors (invalid signature, expired, malformed JWT)
    // and convert them to a user-friendly error message.
    const message = err instanceof Error ? err.message : 'Unknown QR verification error';

    // jose uses specific error messages we can surface directly:
    // - "JWS signature verification failed" → wrong key / tampered token
    // - '"exp" claim timestamp check failed' → expired token
    // - "Invalid Compact JWE/JWS" → malformed JWT string
    return {
      ok: false,
      error: message.includes('exp')
        ? 'QR code has expired — ask the gym to refresh it'
        : `Invalid QR code: ${message}`,
    };
  }
}
