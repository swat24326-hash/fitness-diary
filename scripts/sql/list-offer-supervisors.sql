-- Кто из управляющих принял оферту (read-only).
SELECT
  u.login,
  coalesce(u.name, '') AS name,
  u.role,
  coalesce(u.offer_version, '') AS offer_version,
  (u.offer_accepted_at IS NOT NULL) AS accepted,
  coalesce(c.name, '') AS club
FROM public.users u
LEFT JOIN public.clubs c ON c.id = u.club_id
WHERE lower(trim(u.role::text)) IN ('supervisor', 'управляющий')
ORDER BY accepted ASC, c.name NULLS LAST, u.login;
