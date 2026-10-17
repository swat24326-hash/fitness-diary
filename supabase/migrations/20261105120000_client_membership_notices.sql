-- Оповещение клиенту «абонемент заканчивается» (и закладка kind под другие сценарии).
-- Пишет cron/service role; клиент читает свои и ставит read_at через /api/client-me.

CREATE TABLE IF NOT EXISTS public.client_membership_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expiring', 'expired_recent', 'stale')),
  membership_end_date DATE NOT NULL,
  days_left INT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ
);

-- Один раз на событие: клиент + сценарий + дата конца абона.
CREATE UNIQUE INDEX IF NOT EXISTS client_membership_notices_once_uidx
  ON public.client_membership_notices (client_id, kind, membership_end_date);

CREATE INDEX IF NOT EXISTS client_membership_notices_client_idx
  ON public.client_membership_notices (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS client_membership_notices_notify_idx
  ON public.client_membership_notices (created_at)
  WHERE notified_at IS NULL;

ALTER TABLE public.client_membership_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_membership_notices FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.client_membership_notices FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.client_membership_notices FROM authenticated';
  END IF;
END $$;
