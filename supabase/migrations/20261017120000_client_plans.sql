-- Задание от тренера и рацион, отправленные клиенту в приложение /me (docs/CLIENT_APP.md § «Задание и питание от тренера»).
-- Снимок того, что отправили: тренер правит черновик дальше — у клиента остаётся отправленное.
-- Пишет только сервер: планшет — через push-record (authorizePush), клиент — через /api/client-me (отметка «просмотрено»).

CREATE TABLE IF NOT EXISTS public.client_plans (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('homework', 'nutrition')),
  -- Белый список полей — src/lib/clientPlans/clientPlanCore.js (без заметок тренера и опросника здоровья).
  payload JSONB NOT NULL,
  -- Цифры для плитки на главной клиента, чтобы не тянуть весь снимок каждую минуту.
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_seen_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_plans_client_kind_idx
  ON public.client_plans (client_id, kind, sent_at DESC);

-- Отложенные push после тихих часов (cron на ВМ).
CREATE INDEX IF NOT EXISTS client_plans_notify_idx
  ON public.client_plans (sent_at)
  WHERE notified_at IS NULL;

ALTER TABLE public.client_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_plans FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.client_plans FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.client_plans FROM authenticated';
  END IF;
END $$;
