-- Снимок Стратегии / playbook (закрытия ДК + галочки «купил») — один на клуб/месяц.
-- Чтобы админ и менеджер на любом устройстве видели последний «Посчитать».

ALTER TABLE public.club_sales_plan
  ADD COLUMN IF NOT EXISTS strategy_snapshot jsonb NULL;

COMMENT ON COLUMN public.club_sales_plan.strategy_snapshot IS
  'Снимок playbook Стратегии: candidates, confirmedClosings, pack; прогресс месяца — из дней отчёта, не отсюда';
