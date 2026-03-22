-- Add logo_url column to gyms table.
-- Stores a URL to the gym's logo image, displayed on session cards
-- and gym detail screens. Nullable because not all gyms have logos.
ALTER TABLE gyms ADD COLUMN logo_url text;
