-- Журнал списаний занятий desk АЗ на абонементе (даты визитов).
-- used_trainings остаётся счётчиком; session_visits — даты для истории и дневного отчёта.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS session_visits JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.memberships.session_visits IS
  'Desk АЗ: журнал списаний [{id, date, created_at}]. Не дневник ПЗ.';
