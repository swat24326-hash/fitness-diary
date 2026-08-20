-- Ориентир возврата для причины «Вернётся позже».

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS expected_return_on DATE;

COMMENT ON COLUMN public.clients.expected_return_on IS
  'Ожидаемая дата возврата при archive_reason «Вернётся позже»; очищается при restore';

CREATE INDEX IF NOT EXISTS idx_clients_club_expected_return_on
  ON public.clients (club_id, expected_return_on)
  WHERE expected_return_on IS NOT NULL AND archived_at IS NOT NULL;
