-- Зал desk-клиента из Excel закрытий (ТЗ / АЗ); NULL = обычный клиент с тренером.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS desk_hall TEXT NULL;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_desk_hall_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_desk_hall_check
  CHECK (desk_hall IS NULL OR desk_hall IN ('tz', 'az'));

CREATE INDEX IF NOT EXISTS idx_clients_club_desk_hall
  ON public.clients (club_id, desk_hall)
  WHERE desk_hall IS NOT NULL;

COMMENT ON COLUMN public.clients.desk_hall IS
  'Desk ТЗ/АЗ из Excel закрытий; без персонального тренера (holding). NULL = обычный клиент.';
