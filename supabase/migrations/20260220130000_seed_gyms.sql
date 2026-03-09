-- ===========================================================================
-- Seed Gym Data
-- ===========================================================================
-- Inserts all gyms into the remote database. Previously this data lived only
-- in seed.sql (which only runs during local `supabase db reset`). We need it
-- as a migration so `supabase db push` applies it to the remote database.
--
-- ON CONFLICT DO NOTHING makes this idempotent — safe to re-run.
-- ===========================================================================

-- Vertigo Climbing Center — Lisboa (Marvila)
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Vertigo Climbing Center',
  'Av. Infante D. Henrique 334, Armazém 6, 1800-224 Lisboa',
  38.7340, -9.1050,
  '{"instagram": "@vertigoclimbing", "website": "https://vertigoclimbing.pt"}'::jsonb,
  'font',
  '{"monday":{"open":"07:00","close":"23:00"},"wednesday":{"open":"07:00","close":"23:00"},"friday":{"open":"07:00","close":"23:00"},"tuesday":{"open":"10:00","close":"23:00"},"thursday":{"open":"10:00","close":"23:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"18:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 9.8 Gravity Climbing — Prior Velho
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  '9.8 Gravity Climbing',
  'Av. Severiano Falcão 3B, 2685-379 Prior Velho',
  38.7960, -9.1230,
  '{"instagram": "@9.8_gravity_climbing", "website": "https://98gravity.pt"}'::jsonb,
  'font',
  '{"monday":{"open":"10:00","close":"23:00"},"tuesday":{"open":"10:00","close":"23:00"},"wednesday":{"open":"10:00","close":"23:00"},"thursday":{"open":"10:00","close":"23:00"},"friday":{"open":"10:00","close":"23:00"},"saturday":{"open":"10:00","close":"23:00"},"sunday":{"open":"10:00","close":"23:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Escala25 — Lisboa (Pilar 7)
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'Escala25',
  'Av. da Índia, Pilar 7 da Ponte 25 de Abril, 1349-028 Lisboa',
  38.6945, -9.1790,
  '{"instagram": "@escala25", "website": "https://escala25.com"}'::jsonb,
  'font',
  '{"monday":{"open":"14:00","close":"22:00"},"tuesday":{"open":"10:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"21:00"},"saturday":{"open":"10:00","close":"18:00"},"sunday":{"open":"10:00","close":"18:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- São Rock Climbing — Porto
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  'São Rock Climbing',
  'R. de Godim 312, 4300-277 Porto',
  41.1490, -8.5850,
  '{"instagram": "@saorockclimbing", "website": "http://saorockclimbing.com"}'::jsonb,
  'font',
  '{"monday":{"open":"16:00","close":"22:00"},"tuesday":{"open":"08:30","close":"22:00"},"wednesday":{"open":"08:30","close":"22:00"},"thursday":{"open":"08:30","close":"22:00"},"friday":{"open":"08:30","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- The North Wall — São Mamede de Infesta
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000005',
  'The North Wall',
  'R. do Tronco 375, Núcleo Empresarial SARCOL, São Mamede de Infesta',
  41.1870, -8.6050,
  '{"instagram": "@thenorthwallclimbing", "website": "https://thenorthwall.pt"}'::jsonb,
  'font',
  '{"monday":{"open":"10:00","close":"22:00"},"tuesday":{"open":"10:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"22:00"},"saturday":{"open":"10:00","close":"18:00"},"sunday":{"open":"10:00","close":"14:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Vertical Escalada — Lagoa (Algarve)
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000006',
  'Vertical Escalada',
  'R. Eça de Queiroz, 8400-018 Lagoa',
  37.1350, -8.4530,
  '{"instagram": "@verticalescalada.pt", "website": "https://verticalescalada.pt"}'::jsonb,
  'font',
  '{"monday":{"open":"17:00","close":"22:00"},"tuesday":{"open":"17:00","close":"22:00"},"wednesday":{"open":"17:00","close":"22:00"},"thursday":{"open":"17:00","close":"22:00"},"friday":{"open":"17:00","close":"22:00"},"saturday":{"open":"10:00","close":"18:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- PROA Climbing Center — Matosinhos
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000007',
  'PROA Climbing Center',
  'Av. Menéres 858, 4450-189 Matosinhos',
  41.1820, -8.6890,
  '{"instagram": "@proaclimbingcenter", "website": "https://proaclimbingcenter.com"}'::jsonb,
  'font',
  '{"monday":{"open":"10:00","close":"20:00"},"tuesday":{"open":"16:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"20:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Zone Climb — Vila Nova de Gaia
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000008',
  'Zone Climb',
  'Tv. Joaquim Lopes Pintor 81, 4400-750 Vila Nova de Gaia',
  41.1114, -8.6210,
  '{"instagram": "@zoneclimbpt", "website": "https://zone.com.pt"}'::jsonb,
  'font',
  '{"monday":{"open":"07:00","close":"22:00"},"tuesday":{"open":"07:00","close":"22:00"},"wednesday":{"open":"07:00","close":"22:00"},"thursday":{"open":"07:00","close":"22:00"},"friday":{"open":"07:00","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"20:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
