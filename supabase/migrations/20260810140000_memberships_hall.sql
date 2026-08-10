-- memberships.hall: зал абона (pz|tz|az). Один client — несколько залов.
-- Backfill из clients.desk_hall; иначе pz.
-- Актуально: 2026-08-10. Канон: docs/CLIENT_MULTI_HALL.md

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS hall TEXT;

UPDATE public.memberships m
SET hall = CASE
  WHEN c.desk_hall IN ('tz', 'az') THEN c.desk_hall
  ELSE 'pz'
END
FROM public.clients c
WHERE m.client_id = c.id
  AND (m.hall IS NULL OR btrim(m.hall) = '');

UPDATE public.memberships
SET hall = 'pz'
WHERE hall IS NULL OR btrim(hall) = '';

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_hall_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_hall_check
  CHECK (hall IN ('pz', 'tz', 'az'));

ALTER TABLE public.memberships
  ALTER COLUMN hall SET DEFAULT 'pz';

ALTER TABLE public.memberships
  ALTER COLUMN hall SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_client_hall
  ON public.memberships (client_id, hall);

COMMENT ON COLUMN public.memberships.hall IS
  'Зал абонемента: pz|tz|az. Один клиент может иметь абоны разных залов.';
