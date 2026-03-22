-- Add a quality/enjoyment rating column to route_ascents.
-- This captures how "good" or "fun" a climber thinks a route is,
-- separate from perceived_grade (which captures difficulty).
-- Nullable: null means the user chose not to rate, and it won't
-- count toward the average displayed on the route detail page.
ALTER TABLE public.route_ascents
  ADD COLUMN rating smallint CHECK (rating >= 1 AND rating <= 5);
