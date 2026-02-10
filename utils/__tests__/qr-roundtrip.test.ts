// utils/__tests__/qr-roundtrip.test.ts
//
// End-to-end keypair verification: signs a JWT with the REAL private key
// (the same one the sign-qr Edge Function uses) and verifies it with
// `verifyQrToken()` using the REAL public key from lib/constants.ts.
//
// WHY THIS TEST EXISTS:
// The unit tests in qr.test.ts use a freshly generated test keypair and
// mock the public key. This test uses the ACTUAL production keypair to
// confirm that:
//   1. The private key in supabase/.env.local and the public key in
//      lib/constants.ts are a matched pair
//   2. Tokens signed by the Edge Function will be verifiable by the client
//
// If someone regenerates one key without updating the other, this test
// catches the mismatch immediately.
//
// SETUP:
// The private key is loaded from the QR_PRIVATE_KEY environment variable.
// In jest.config.js (unit project), we don't set this env var — but we
// read it from supabase/.env.local in beforeAll below using fs.

import { SignJWT, importJWK } from 'jose';
import { verifyQrToken } from '../qr';
import * as fs from 'fs';
import * as path from 'path';

describe('QR keypair roundtrip', () => {
  // The private key JWK loaded from supabase/.env.local
  let privateKeyJwk: Record<string, string>;

  beforeAll(() => {
    // Read the private key from supabase/.env.local — the same file the
    // Edge Function reads in production (via Deno.env). We parse it manually
    // here since Jest doesn't auto-load .env files.
    const envPath = path.resolve(__dirname, '../../supabase/.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');

    // Find the QR_PRIVATE_KEY line and extract the JSON value.
    // The line format is: QR_PRIVATE_KEY={"kty":"EC",...}
    const match = envContent.match(/^QR_PRIVATE_KEY=(.+)$/m);
    if (!match) {
      throw new Error(
        'QR_PRIVATE_KEY not found in supabase/.env.local — ' +
        'run the keypair generation script first (see Step 7.2)'
      );
    }

    privateKeyJwk = JSON.parse(match[1]);
  });

  it('token signed with QR_PRIVATE_KEY verifies with QR_PUBLIC_KEY', async () => {
    // This mirrors exactly what the sign-qr Edge Function does:
    // import the private JWK, create a JWT with route and gym claims,
    // and sign it with ES256.
    const routeId = 'aabbccdd-1234-5678-abcd-000000000001';
    const gymId = 'aabbccdd-1234-5678-abcd-000000000002';

    const privateKey = await importJWK(privateKeyJwk, 'ES256');

    const token = await new SignJWT({ gym_id: gymId })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(routeId)
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(privateKey);

    // Now verify with the real public key from constants.ts — this is
    // exactly what the scan screen does when a climber scans a QR code.
    const result = await verifyQrToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe(routeId);
      expect(result.payload.gym_id).toBe(gymId);
      expect(result.payload.iat).toBeGreaterThan(0);
      expect(result.payload.exp).toBeGreaterThan(result.payload.iat);
    }
  });
});
