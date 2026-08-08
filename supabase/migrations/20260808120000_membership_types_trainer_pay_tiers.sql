-- Три ставки ЗП тренера на типе карты (уровни 1–3 по часам месяца — логика позже).
-- trainer_pay_per_session остаётся = уровень 1 (совместимость со старым расчётом ЗП).

ALTER TABLE public.membership_types
  ADD COLUMN IF NOT EXISTS trainer_pay_l1 NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS trainer_pay_l2 NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS trainer_pay_l3 NUMERIC(10, 2);

UPDATE public.membership_types
SET
  trainer_pay_l1 = COALESCE(trainer_pay_l1, trainer_pay_per_session, 0),
  trainer_pay_l2 = COALESCE(trainer_pay_l2, trainer_pay_per_session, 0),
  trainer_pay_l3 = COALESCE(trainer_pay_l3, trainer_pay_per_session, 0)
WHERE trainer_pay_l1 IS NULL
   OR trainer_pay_l2 IS NULL
   OR trainer_pay_l3 IS NULL;

ALTER TABLE public.membership_types
  ALTER COLUMN trainer_pay_l1 SET DEFAULT 0,
  ALTER COLUMN trainer_pay_l2 SET DEFAULT 0,
  ALTER COLUMN trainer_pay_l3 SET DEFAULT 0;

ALTER TABLE public.membership_types
  ALTER COLUMN trainer_pay_l1 SET NOT NULL,
  ALTER COLUMN trainer_pay_l2 SET NOT NULL,
  ALTER COLUMN trainer_pay_l3 SET NOT NULL;

ALTER TABLE public.membership_types
  DROP CONSTRAINT IF EXISTS membership_types_trainer_pay_l1_nonneg,
  DROP CONSTRAINT IF EXISTS membership_types_trainer_pay_l2_nonneg,
  DROP CONSTRAINT IF EXISTS membership_types_trainer_pay_l3_nonneg;

ALTER TABLE public.membership_types
  ADD CONSTRAINT membership_types_trainer_pay_l1_nonneg CHECK (trainer_pay_l1 >= 0),
  ADD CONSTRAINT membership_types_trainer_pay_l2_nonneg CHECK (trainer_pay_l2 >= 0),
  ADD CONSTRAINT membership_types_trainer_pay_l3_nonneg CHECK (trainer_pay_l3 >= 0);

COMMENT ON COLUMN public.membership_types.trainer_pay_l1 IS 'Ставка тренера за тренировку, уровень 1 (₽)';
COMMENT ON COLUMN public.membership_types.trainer_pay_l2 IS 'Ставка тренера за тренировку, уровень 2 (₽)';
COMMENT ON COLUMN public.membership_types.trainer_pay_l3 IS 'Ставка тренера за тренировку, уровень 3 / макс (₽)';
