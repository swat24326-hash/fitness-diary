-- Приложение клиента, фаза Б: push-напоминание о завтрашней тренировке.
-- Подписка привязана к сессии клиента: выход и «Отключить все входы» гасят напоминания сразу.
-- Читает и пишет только сервер (service); браузеру через /rest/v1 таблицы не видны.

CREATE TABLE IF NOT EXISTS public.client_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.client_sessions (id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_push_subscriptions_client_idx
  ON public.client_push_subscriptions (client_id);

-- Журнал отправленного: одно напоминание на клиента и слот, повторный запуск cron не дублирует.
CREATE TABLE IF NOT EXISTS public.client_reminder_log (
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  start_minutes INT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, day_date, start_minutes)
);

CREATE INDEX IF NOT EXISTS client_reminder_log_day_idx
  ON public.client_reminder_log (day_date);

ALTER TABLE public.client_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_push_subscriptions FROM PUBLIC;
REVOKE ALL ON public.client_reminder_log FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.client_push_subscriptions FROM anon';
    EXECUTE 'REVOKE ALL ON public.client_reminder_log FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.client_push_subscriptions FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.client_reminder_log FROM authenticated';
  END IF;
END $$;
