-- Вход в приложение тренера на телефоне (/coach) по QR с планшета тренера.
-- Ссылка одноразовая; первый открывший её телефон закрепляется (device_id) и ждёт «Разрешить» админа.
-- Читает и пишет только сервер (service); браузеру через /rest/v1 таблица не видна.

CREATE TABLE IF NOT EXISTS public.coach_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS coach_invites_user_open_idx
  ON public.coach_invites (user_id)
  WHERE used_at IS NULL;

ALTER TABLE public.coach_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_invites FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.coach_invites FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.coach_invites FROM authenticated';
  END IF;
END $$;
