-- Авто-ДЗ по воскресеньям (docs/HOMEWORK_AUTO.md § шаг 2): настройки клиента и расписание блока.
-- Одна строка на клиента, id постоянный от client_id (src/lib/homework/auto/homeworkAutoScheduleCore.js).
-- Пишет только сервер: планшет — через push-record (authorizePush), задания — cron на ВМ в client_plans.

CREATE TABLE IF NOT EXISTS public.homework_auto (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  goal TEXT NOT NULL,
  level SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  avoid JSONB NOT NULL DEFAULT '[]'::jsonb,
  sessions SMALLINT NOT NULL DEFAULT 2 CHECK (sessions IN (2, 3)),
  sex TEXT CHECK (sex IN ('male', 'female')),
  -- Тренер подтвердил: несмотря на противопоказания в карточке, ограничений для домашних упражнений нет.
  limits_ok BOOLEAN NOT NULL DEFAULT false,
  -- Воскресенье недели 1 текущего блока; неделя блока = (воскресенье - anchor) / 7 по кругу из 4.
  anchor_date DATE NOT NULL,
  block_shift INTEGER NOT NULL DEFAULT 0,
  skip_date DATE,
  updated_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS homework_auto_enabled_idx
  ON public.homework_auto (id)
  WHERE enabled;

ALTER TABLE public.homework_auto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.homework_auto FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.homework_auto FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.homework_auto FROM authenticated';
  END IF;
END $$;
