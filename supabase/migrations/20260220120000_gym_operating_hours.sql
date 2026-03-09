-- Add operating_hours JSONB column to gyms table.
--
-- Stores weekly opening hours as a JSON object keyed by lowercase day name:
--   {
--     "monday":    { "open": "06:00", "close": "22:00" },
--     "tuesday":   { "open": "06:00", "close": "22:00" },
--     ...
--     "sunday":    { "open": "08:00", "close": "20:00" }
--   }
--
-- Null means hours not set (displayed as "Hours not available").
-- A missing day key means closed that day.

ALTER TABLE public.gyms
  ADD COLUMN operating_hours jsonb DEFAULT NULL;

COMMENT ON COLUMN public.gyms.operating_hours IS
  'Weekly opening hours as JSON: { "monday": { "open": "HH:MM", "close": "HH:MM" }, ... }';
