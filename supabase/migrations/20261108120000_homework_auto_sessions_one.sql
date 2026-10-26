-- Авто-ДЗ допускает 1, 2 или 3 занятия в неделю (docs/HOMEWORK_AUTO.md).
-- Старый check только (2, 3) ломал Sync при «1» — homework_auto_sessions_check.

ALTER TABLE public.homework_auto
  DROP CONSTRAINT IF EXISTS homework_auto_sessions_check;

ALTER TABLE public.homework_auto
  ADD CONSTRAINT homework_auto_sessions_check CHECK (sessions IN (1, 2, 3));
