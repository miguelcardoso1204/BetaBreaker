-- ===========================================================================
-- Remove non-Portuguese gyms
-- ===========================================================================
-- Cleans up any old US/test gyms that were previously inserted into the
-- remote database. Only keeps the 8 verified Portuguese climbing gyms.
-- ===========================================================================

DELETE FROM public.gyms
WHERE id NOT IN (
  '10000000-0000-0000-0000-000000000001',  -- Vertigo Climbing Center
  '10000000-0000-0000-0000-000000000002',  -- 9.8 Gravity Climbing
  '10000000-0000-0000-0000-000000000003',  -- Escala25
  '10000000-0000-0000-0000-000000000004',  -- São Rock Climbing
  '10000000-0000-0000-0000-000000000005',  -- The North Wall
  '10000000-0000-0000-0000-000000000006',  -- Vertical Escalada
  '10000000-0000-0000-0000-000000000007',  -- PROA Climbing Center
  '10000000-0000-0000-0000-000000000008'   -- Zone Climb
);
