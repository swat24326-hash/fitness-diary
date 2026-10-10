-- Привязка устройств тренера (STRATEGY §5.7): разрешённые / ждущие «Разрешить» админа / отозванные.
-- Читает и пишет только сервер (service); браузеру через /rest/v1 таблица не видна — как auth_sessions.
CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'revoked')),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ,
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS user_devices_pending_idx
  ON public.user_devices (created_at)
  WHERE status = 'pending';

ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS device_id TEXT;
CREATE INDEX IF NOT EXISTS auth_sessions_user_device_live_idx
  ON public.auth_sessions (user_id, device_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_devices FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.user_devices FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.user_devices FROM authenticated';
  END IF;
END $$;
