-- Migration: Add pinned_badge_ids column to profiles
--
-- Allows users to "pin" earned badges to their profile for display.
-- The number of pinned badges is limited by the user's subscription tier:
--   - Free tier: max 1 pinned badge
--   - Pro tier: max 3 pinned badges
--
-- WHY A TRIGGER INSTEAD OF A CHECK CONSTRAINT?
-- array_length() returns NULL for empty arrays, which makes a CHECK constraint
-- awkward to write (NULL passes CHECK constraints by default). A BEFORE trigger
-- gives us clear error messages for each tier and handles the empty-array edge
-- case naturally — array_length('{}'::uuid[], 1) IS NULL, so the > 1 / > 3
-- comparisons evaluate to NULL (falsy), letting empty arrays through.

-- Add the column: a UUID array defaulting to empty.
-- Each UUID references a badge the user has earned and wants to display.
ALTER TABLE public.profiles
  ADD COLUMN pinned_badge_ids uuid[] NOT NULL DEFAULT '{}';

-- Trigger function: enforce pin limits based on subscription tier.
-- Runs BEFORE INSERT OR UPDATE so invalid data never reaches the table.
CREATE OR REPLACE FUNCTION public.enforce_pinned_badge_limit()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Free users can pin at most 1 badge
  IF NEW.tier = 'free' AND array_length(NEW.pinned_badge_ids, 1) > 1 THEN
    RAISE EXCEPTION 'Free tier allows max 1 pinned badge'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Pro users can pin at most 3 badges
  IF NEW.tier = 'pro' AND array_length(NEW.pinned_badge_ids, 1) > 3 THEN
    RAISE EXCEPTION 'Pro tier allows max 3 pinned badges'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger to profiles — fires on every INSERT or UPDATE.
-- FOR EACH ROW means it checks each individual row being modified.
CREATE TRIGGER trg_enforce_pinned_badges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pinned_badge_limit();
