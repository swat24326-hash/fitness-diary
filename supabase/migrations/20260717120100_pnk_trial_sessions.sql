-- ПНК: число бесплатных тренировок (1 или 2)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pnk_trial_sessions smallint;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_pnk_trial_sessions_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_pnk_trial_sessions_check
  CHECK (pnk_trial_sessions IS NULL OR pnk_trial_sessions IN (1, 2));

COMMENT ON COLUMN public.clients.pnk_trial_sessions IS
  'Сколько бесплатных в плане ПНК: 1 или 2. Задаётся при создании.';

UPDATE public.clients
SET pnk_trial_sessions = 1
WHERE lifecycle IN ('pnk', 'pnk_lost')
  AND pnk_trial_sessions IS NULL;
