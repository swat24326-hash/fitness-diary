-- Приложение клиента v1 (/me): вход по приглашению из клуба, только просмотр своих данных.
-- Читает и пишет только сервер (service); браузеру через /rest/v1 таблицы не видны.

CREATE TABLE IF NOT EXISTS public.client_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS client_invites_client_open_idx
  ON public.client_invites (client_id)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS public.client_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  invite_id UUID REFERENCES public.client_invites (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refresh_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS client_sessions_client_live_idx
  ON public.client_sessions (client_id)
  WHERE revoked_at IS NULL;

-- «Моя следующая тренировка»: поиск слотов ежедневника по клиенту.
CREATE INDEX IF NOT EXISTS idx_trainer_schedule_client_ids_gin
  ON public.trainer_schedule_entries USING gin (client_ids jsonb_path_ops);

ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_invites FROM PUBLIC;
REVOKE ALL ON public.client_sessions FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.client_invites FROM anon';
    EXECUTE 'REVOKE ALL ON public.client_sessions FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.client_invites FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.client_sessions FROM authenticated';
  END IF;
END $$;
