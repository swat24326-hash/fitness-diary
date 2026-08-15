-- Входящие звонки: направление + клиент может быть неизвестен + идемпотентность по mz_db_call_id.

ALTER TABLE public.club_call_log
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.club_call_log
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_call_log_direction_check'
  ) THEN
    ALTER TABLE public.club_call_log
      ADD CONSTRAINT club_call_log_direction_check
      CHECK (direction IN ('outbound', 'inbound'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_call_log_club_mz_db_call_id
  ON public.club_call_log (club_id, mz_db_call_id)
  WHERE mz_db_call_id IS NOT NULL AND length(trim(mz_db_call_id)) > 0;

COMMENT ON COLUMN public.club_call_log.direction IS
  'outbound = из Оси make_call; inbound = входящий с Android (webhook без исходящей команды)';
COMMENT ON COLUMN public.club_call_log.client_id IS
  'Клиент; NULL для входящего с неизвестного номера';
