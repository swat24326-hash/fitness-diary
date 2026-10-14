-- Библиотека домашних упражнений — правки админа (docs/HOMEWORK_AUTO.md, «Библиотека»).
-- Встроенные упражнения живут в коде (src/lib/homework/library/); строка здесь с тем же id — правка,
-- с новым id — своё упражнение, is_active = false — убрано из подбора. Одна библиотека на всю сеть.
-- Пишет только сервер: админ — через push-record (authorizePush); читают trainer-pull, admin-data и cron авто-ДЗ.

CREATE TABLE IF NOT EXISTS public.homework_library (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{1,64}$'),
  -- поля упражнения (name, pattern, level, equip, unit, avoid, goals, focus, how, cue…) — src/lib/homework/library/homeworkLibrary.js
  entry JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.homework_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.homework_library FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.homework_library FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.homework_library FROM authenticated';
  END IF;
END $$;
