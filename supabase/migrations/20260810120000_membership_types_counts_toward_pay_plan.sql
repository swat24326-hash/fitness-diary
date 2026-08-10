-- Галочка «В план»: тип карты ПЗ участвует в порогах плана ЗП (ур. 1–3).
-- Независимо от ставок ₽; backfill: true если есть оплата > 0, иначе false.

ALTER TABLE public.membership_types
  ADD COLUMN IF NOT EXISTS counts_toward_pay_plan boolean;

UPDATE public.membership_types
SET counts_toward_pay_plan = (
  COALESCE(trainer_pay_l1, 0) > 0
  OR COALESCE(trainer_pay_l2, 0) > 0
  OR COALESCE(trainer_pay_l3, 0) > 0
  OR COALESCE(trainer_pay_per_session, 0) > 0
)
WHERE counts_toward_pay_plan IS NULL;

ALTER TABLE public.membership_types
  ALTER COLUMN counts_toward_pay_plan SET DEFAULT true;

UPDATE public.membership_types
SET counts_toward_pay_plan = true
WHERE counts_toward_pay_plan IS NULL;

ALTER TABLE public.membership_types
  ALTER COLUMN counts_toward_pay_plan SET NOT NULL;

COMMENT ON COLUMN public.membership_types.counts_toward_pay_plan IS
  'Учитывать завершённые тренировки по этому типу в порогах плана ЗП (ур. 1–3). Ставки ₽ — отдельно.';
