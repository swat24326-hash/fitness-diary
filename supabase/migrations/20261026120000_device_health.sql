-- Центр сбоев устройств (docs/DEVICE_HEALTH.md): что не так на планшете тренера, одна строка на устройство.
-- problems — коды с самого планшета (отчёт admin-data device-health), server_problems — что увидел сервер
-- (cron deviceHealthJob: «на связи, а данные не грузит»). Пишет и читает только сервер, как user_devices.
CREATE TABLE IF NOT EXISTS public.device_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  club_id UUID,
  label TEXT,
  bundle_id TEXT,
  problems JSONB NOT NULL DEFAULT '[]'::jsonb,
  server_problems JSONB NOT NULL DEFAULT '[]'::jsonb,
  queue_count INTEGER NOT NULL DEFAULT 0,
  last_report_at TIMESTAMPTZ,
  last_pull_ok_at TIMESTAMPTZ,
  problem_since TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  notified_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_at TIMESTAMPTZ,
  resolved_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS device_health_last_report_idx ON public.device_health (last_report_at DESC);

ALTER TABLE public.device_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_health FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.device_health FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.device_health FROM authenticated';
  END IF;
END $$;
