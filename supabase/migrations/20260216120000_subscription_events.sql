-- Step 13.1: Subscription Events Table
--
-- Records every subscription lifecycle event (purchase, renewal, cancellation,
-- expiration, restore). This is the source of truth for billing history.
--
-- WHY A SEPARATE TABLE (NOT JUST profiles.tier)?
-- The `profiles.tier` column is the live entitlement flag — "can this user
-- access pro features RIGHT NOW?" But we also need:
--   1. An audit trail of all billing events (debugging, support, refunds)
--   2. Store transaction IDs for cross-referencing with Apple/Google dashboards
--   3. Expiration timestamps for future "your subscription expires in 3 days" UX
--
-- WRITE ACCESS:
-- Only the service_role can INSERT into this table (Edge Functions: verify-iap,
-- billing-webhook). The authenticated role has NO insert/update/delete policies,
-- so even if a user sends raw SQL via PostgREST, RLS blocks the write.
-- Users can only READ their own subscription history.

CREATE TABLE subscription_events (
  -- Primary key — UUID for global uniqueness across all events
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The user this event belongs to. CASCADE ensures cleanup if user is deleted.
  user_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- What happened: purchase, renewal, cancellation, expiration, or restore.
  -- CHECK constraint enforces only valid event types (matches SUBSCRIPTION_EVENT_TYPES
  -- in lib/constants.ts).
  event_type            text NOT NULL CHECK (event_type IN ('purchase','renewal','cancellation','expiration','restore')),

  -- Which store processed this event: 'apple' or 'google'.
  -- Needed to route receipt validation to the correct API.
  store                 text NOT NULL CHECK (store IN ('apple','google')),

  -- The store's unique transaction identifier. Used for:
  --   1. Deduplication via UNIQUE constraint (idempotent webhook handling)
  --   2. Cross-referencing with App Store Connect / Google Play Console
  store_transaction_id  text NOT NULL,

  -- The product ID purchased (e.g., 'com.betabreaker.pro.monthly').
  -- Stored here so we can verify it matches our expected products.
  store_product_id      text NOT NULL,

  -- Raw receipt data from the store. Stored for potential re-validation
  -- or dispute resolution. NULL for webhook-originated events where
  -- the store only sends a notification (not a full receipt).
  receipt_data          text,

  -- When the subscription period expires. NULL for cancellation events
  -- (the user cancelled but access continues until the existing expires_at).
  -- Used for "your subscription expires on..." UI messaging.
  expires_at            timestamptz,

  -- When this event was recorded. Immutable — events are append-only.
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- UNIQUE constraint on (store, transaction_id) ensures idempotent writes.
  -- If a webhook fires twice for the same transaction, the second INSERT
  -- is silently rejected (the Edge Function uses ON CONFLICT DO NOTHING).
  UNIQUE (store, store_transaction_id)
);

-- Enable RLS — mandatory on every table in Beta Breaker.
-- Without this, any authenticated user could query all subscription events.
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Index for efficient lookups by user. Most queries are "get events for user X",
-- so this index makes those O(log n) instead of full table scans.
CREATE INDEX idx_sub_events_user ON subscription_events(user_id);

-- Users can view their own subscription history (for the Subscriptions screen).
-- auth.uid() returns the caller's user ID from their JWT — PostgREST sets this
-- automatically from the Authorization header.
CREATE POLICY "select_own_events" ON subscription_events
  FOR SELECT USING (auth.uid() = user_id);

-- NO INSERT/UPDATE/DELETE policies for the authenticated role.
-- With RLS enabled and no permissive INSERT policy, any direct client INSERT
-- will be blocked. Only the service_role (used by Edge Functions) bypasses
-- RLS entirely, so only verify-iap and billing-webhook can write events.
