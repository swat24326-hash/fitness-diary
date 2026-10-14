-- Анкета здоровья клиента (docs/HEALTH_SCREENING.md): ответы «да / нет» с уточнением, отдельно от health_cards,
-- чтобы сохранение карточки / рациона целой строкой не затирало анкету.
-- Одна строка на клиента, id постоянный от client_id (src/lib/health/healthScreeningCore.js).
-- Пишет только сервер: планшет — через push-record (authorizePush); читает trainer-pull и cron авто-ДЗ.

CREATE TABLE IF NOT EXISTS public.health_screenings (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  -- { v, clearance, zones, bones, women, life, cleared? } — ключи из src/lib/health/healthScreeningCatalog.js
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_screenings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.health_screenings FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.health_screenings FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.health_screenings FROM authenticated';
  END IF;
END $$;
