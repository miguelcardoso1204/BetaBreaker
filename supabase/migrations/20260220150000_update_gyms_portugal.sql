-- ===========================================================================
-- Update gyms to Portuguese climbing gyms
-- ===========================================================================
-- The previous seed migration used ON CONFLICT DO NOTHING, which skipped
-- inserts because these IDs already had US gym data. This migration
-- overwrites them with the correct Portuguese gym data.
-- ===========================================================================

UPDATE public.gyms SET
  name = 'Vertigo Climbing Center',
  address = 'Av. Infante D. Henrique 334, Armazém 6, 1800-224 Lisboa',
  latitude = 38.7340, longitude = -9.1050,
  social_links = '{"instagram": "@vertigoclimbing", "website": "https://vertigoclimbing.pt"}'::jsonb,
  default_grade_system = 'font',
  operating_hours = '{"monday":{"open":"07:00","close":"23:00"},"wednesday":{"open":"07:00","close":"23:00"},"friday":{"open":"07:00","close":"23:00"},"tuesday":{"open":"10:00","close":"23:00"},"thursday":{"open":"10:00","close":"23:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"18:00"}}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000001';

UPDATE public.gyms SET
  name = '9.8 Gravity Climbing',
  address = 'Av. Severiano Falcão 3B, 2685-379 Prior Velho',
  latitude = 38.7960, longitude = -9.1230,
  social_links = '{"instagram": "@9.8_gravity_climbing", "website": "https://98gravity.pt"}'::jsonb,
  default_grade_system = 'font',
  operating_hours = '{"monday":{"open":"10:00","close":"23:00"},"tuesday":{"open":"10:00","close":"23:00"},"wednesday":{"open":"10:00","close":"23:00"},"thursday":{"open":"10:00","close":"23:00"},"friday":{"open":"10:00","close":"23:00"},"saturday":{"open":"10:00","close":"23:00"},"sunday":{"open":"10:00","close":"23:00"}}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000002';

UPDATE public.gyms SET
  name = 'Escala25',
  address = 'Av. da Índia, Pilar 7 da Ponte 25 de Abril, 1349-028 Lisboa',
  latitude = 38.6945, longitude = -9.1790,
  social_links = '{"instagram": "@escala25", "website": "https://escala25.com"}'::jsonb,
  default_grade_system = 'font',
  operating_hours = '{"monday":{"open":"14:00","close":"22:00"},"tuesday":{"open":"10:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"21:00"},"saturday":{"open":"10:00","close":"18:00"},"sunday":{"open":"10:00","close":"18:00"}}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000003';

UPDATE public.gyms SET
  name = 'São Rock Climbing',
  address = 'R. de Godim 312, 4300-277 Porto',
  latitude = 41.1490, longitude = -8.5850,
  social_links = '{"instagram": "@saorockclimbing", "website": "http://saorockclimbing.com"}'::jsonb,
  default_grade_system = 'font',
  operating_hours = '{"monday":{"open":"16:00","close":"22:00"},"tuesday":{"open":"08:30","close":"22:00"},"wednesday":{"open":"08:30","close":"22:00"},"thursday":{"open":"08:30","close":"22:00"},"friday":{"open":"08:30","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"}}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000004';

UPDATE public.gyms SET
  name = 'The North Wall',
  address = 'R. do Tronco 375, Núcleo Empresarial SARCOL, São Mamede de Infesta',
  latitude = 41.1870, longitude = -8.6050,
  social_links = '{"instagram": "@thenorthwallclimbing", "website": "https://thenorthwall.pt"}'::jsonb,
  default_grade_system = 'font',
  operating_hours = '{"monday":{"open":"10:00","close":"22:00"},"tuesday":{"open":"10:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"22:00"},"saturday":{"open":"10:00","close":"18:00"},"sunday":{"open":"10:00","close":"14:00"}}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000005';

UPDATE public.gyms SET
  name = 'Vertical Escalada',
  address = 'R. Eça de Queiroz, 8400-018 Lagoa',
  latitude = 37.1350, longitude = -8.4530,
  social_links = '{"instagram": "@verticalescalada.pt", "website": "https://verticalescalada.pt"}'::jsonb,
  default_grade_system = 'font',
  operating_hours = '{"monday":{"open":"17:00","close":"22:00"},"tuesday":{"open":"17:00","close":"22:00"},"wednesday":{"open":"17:00","close":"22:00"},"thursday":{"open":"17:00","close":"22:00"},"friday":{"open":"17:00","close":"22:00"},"saturday":{"open":"10:00","close":"18:00"}}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000006';

UPDATE public.gyms SET
  name = 'PROA Climbing Center',
  address = 'Av. Menéres 858, 4450-189 Matosinhos',
  latitude = 41.1820, longitude = -8.6890,
  social_links = '{"instagram": "@proaclimbingcenter", "website": "https://proaclimbingcenter.com"}'::jsonb,
  default_grade_system = 'font',
  operating_hours = '{"monday":{"open":"10:00","close":"20:00"},"tuesday":{"open":"16:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"20:00"}}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000007';

UPDATE public.gyms SET
  name = 'Zone Climb',
  address = 'Tv. Joaquim Lopes Pintor 81, 4400-750 Vila Nova de Gaia',
  latitude = 41.1114, longitude = -8.6210,
  social_links = '{"instagram": "@zoneclimbpt", "website": "https://zone.com.pt"}'::jsonb,
  default_grade_system = 'font',
  operating_hours = '{"monday":{"open":"07:00","close":"22:00"},"tuesday":{"open":"07:00","close":"22:00"},"wednesday":{"open":"07:00","close":"22:00"},"thursday":{"open":"07:00","close":"22:00"},"friday":{"open":"07:00","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"20:00"}}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000008';
