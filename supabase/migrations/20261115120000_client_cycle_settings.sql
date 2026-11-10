-- Параметры упрощённого цикла клиентки в /me. Пишет только /api/client-me (service role).
-- Тренеру и админу через PostgREST не отдаём.

CREATE TABLE IF NOT EXISTS public.client_cycle_settings (
  client_id UUID PRIMARY KEY REFERENCES public.clients (id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  cycle_days INT NOT NULL DEFAULT 28,
  period_days INT NOT NULL DEFAULT 5,
  last_period_start DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_cycle_settings_cycle_days_check CHECK (cycle_days BETWEEN 21 AND 45),
  CONSTRAINT client_cycle_settings_period_days_check CHECK (period_days BETWEEN 1 AND 10),
  CONSTRAINT client_cycle_settings_period_lt_cycle CHECK (period_days < cycle_days),
  CONSTRAINT client_cycle_settings_enabled_start_check CHECK (
    enabled = false OR last_period_start IS NOT NULL
  )
);

COMMENT ON TABLE public.client_cycle_settings IS
  'Упрощённый цикл клиентки (/me). Только через client-me; не в trainer-pull.';

CREATE INDEX IF NOT EXISTS client_cycle_settings_updated_idx
  ON public.client_cycle_settings (updated_at DESC);

ALTER TABLE public.client_cycle_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_cycle_settings FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.client_cycle_settings FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.client_cycle_settings FROM authenticated';
  END IF;
END $$;
