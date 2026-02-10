// utils/__tests__/qr.test.ts
//
// Tests for QR code JWT verification — the logic that validates scanned
// QR codes from gym routes.
//
// HOW IT WORKS:
// Each QR code on a gym wall contains a JWT (JSON Web Token) signed with
// an EC P-256 private key. When a climber scans the QR, `verifyQrToken()`
// checks the signature using the app's embedded public key. If valid, the
// JWT's claims tell us which route and gym the QR belongs to.
//
// TEST STRATEGY:
// We generate a test EC P-256 keypair in `beforeAll` using jose's
// `generateKeyPair('ES256')`. The private key signs test tokens; we mock
// `@/lib/constants` to provide the test public key (exported as JWK) so
// `verifyQrToken` uses our test key for verification.
//
// This avoids coupling tests to the placeholder key in constants.ts —
// tests own their own keypair and can create any token scenario.

import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import type { JWK } from 'jose';
import { verifyQrToken } from '../qr';
import type { QrPayload, QrResult } from '../qr';

// ── Test keypair management ──────────────────────────────────────────

// These will hold the test keypair, generated once before all tests.
// CryptoKey is the Web Crypto API type that jose uses for key operations.
let privateKey: CryptoKey;
let publicKeyJwk: JWK;

// Mock @/lib/constants to use our test public key instead of the
// placeholder key in constants.ts. The mock factory runs synchronously
// (jest.mock is hoisted), so we set a default value and update it
// in beforeAll after key generation.
jest.mock('@/lib/constants', () => ({
  // Return a getter that reads the current publicKeyJwk value.
  // This works because the mock factory closure captures the module
  // scope, and `publicKeyJwk` is updated in beforeAll before tests run.
  get QR_PUBLIC_KEY() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const testModule = require('../../utils/__tests__/qr.test');
    return testModule.__TEST_PUBLIC_KEY__;
  },
}));

// Export the public key so the mock above can access it.
// This is a workaround for jest.mock hoisting — we can't use a closure
// variable directly because the mock factory runs before `beforeAll`.
export let __TEST_PUBLIC_KEY__: JWK = {};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Creates a signed JWT with the given claims using the test private key.
 * Convenience wrapper around jose's SignJWT builder pattern.
 */
async function createTestToken(claims: {
  sub?: string;
  gym_id?: string;
  iat?: number;
  exp?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({
    ...(claims.gym_id !== undefined && { gym_id: claims.gym_id }),
  })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt(claims.iat ?? now);

  // Set subject (route_id) if provided
  if (claims.sub !== undefined) {
    builder.setSubject(claims.sub);
  }

  // Set expiration — default to 1 hour from now
  if (claims.exp !== undefined) {
    builder.setExpirationTime(claims.exp);
  } else {
    builder.setExpirationTime('1h');
  }

  return builder.sign(privateKey);
}

// ── Setup ────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Generate a fresh EC P-256 keypair for testing. ES256 = ECDSA using
  // P-256 curve and SHA-256 hash — the same algorithm our QR system uses.
  const keyPair = await generateKeyPair('ES256');
  privateKey = keyPair.privateKey;

  // Export the public key as JWK so our mock @/lib/constants can serve it.
  publicKeyJwk = await exportJWK(keyPair.publicKey);
  publicKeyJwk.kty = 'EC';
  publicKeyJwk.crv = 'P-256';

  // Update the exported test key so the mock can read it.
  __TEST_PUBLIC_KEY__ = publicKeyJwk;
});

// ── Tests ────────────────────────────────────────────────────────────

describe('verifyQrToken', () => {
  it('returns ok with payload for a valid token', async () => {
    // A properly signed token with all required claims should pass
    // verification and return the extracted route_id and gym_id.
    const routeId = '550e8400-e29b-41d4-a716-446655440000';
    const gymId = '660e8400-e29b-41d4-a716-446655440001';

    const token = await createTestToken({ sub: routeId, gym_id: gymId });
    const result = await verifyQrToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe(routeId);
      expect(result.payload.gym_id).toBe(gymId);
      expect(typeof result.payload.iat).toBe('number');
      expect(typeof result.payload.exp).toBe('number');
    }
  });

  it('returns error for an expired token', async () => {
    // Tokens with a past expiration should be rejected. The gym should
    // regenerate QR codes periodically, so stale tokens indicate either
    // the QR hasn't been refreshed or someone is replaying an old code.
    const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

    const token = await createTestToken({
      sub: 'route-123',
      gym_id: 'gym-456',
      exp: pastExp,
    });
    const result = await verifyQrToken(token);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain('expired');
    }
  });

  it('returns error for a token signed with the wrong key', async () => {
    // A token signed with a different private key should fail signature
    // verification — this detects tampered or forged QR codes.
    const wrongKeyPair = await generateKeyPair('ES256');

    const token = await new SignJWT({ gym_id: 'gym-789' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('route-abc')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(wrongKeyPair.privateKey);

    const result = await verifyQrToken(token);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns error for a malformed non-JWT string', async () => {
    // Random strings (not valid JWTs) should be caught gracefully rather
    // than crashing. Users might accidentally scan non-route QR codes.
    const result = await verifyQrToken('this-is-not-a-jwt');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns error for a token missing the gym_id claim', async () => {
    // Even if the signature is valid, our QR payload requires both `sub`
    // (route_id) and `gym_id`. A token without gym_id is malformed.
    const builder = new SignJWT({})
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('route-no-gym')
      .setIssuedAt()
      .setExpirationTime('1h');

    const token = await builder.sign(privateKey);
    const result = await verifyQrToken(token);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain('missing');
    }
  });

  it('accepts a token with a future iat (not yet issued)', async () => {
    // Clock skew between the server and client is normal. A token with
    // a slightly future `iat` should still be accepted as long as the
    // signature is valid and the token hasn't expired.
    const futureIat = Math.floor(Date.now() / 1000) + 60; // 1 minute from now

    const token = await createTestToken({
      sub: 'route-future',
      gym_id: 'gym-future',
      iat: futureIat,
    });
    const result = await verifyQrToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('route-future');
      expect(result.payload.gym_id).toBe('gym-future');
    }
  });
});
