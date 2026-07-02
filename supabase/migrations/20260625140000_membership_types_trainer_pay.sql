ALTER TABLE public.membership_types
ADD COLUMN IF NOT EXISTS trainer_pay_per_session NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.membership_types
DROP CONSTRAINT IF EXISTS membership_types_trainer_pay_nonneg;

ALTER TABLE public.membership_types
ADD CONSTRAINT membership_types_trainer_pay_nonneg CHECK (trainer_pay_per_session >= 0);
