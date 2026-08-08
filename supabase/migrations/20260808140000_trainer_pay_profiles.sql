-- Кабинет тренера: план / без плана + ±₽ к ставке за тренировку.

CREATE TABLE IF NOT EXISTS public.trainer_pay_profiles (
  trainer_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  on_plan boolean NOT NULL DEFAULT true,
  rate_adjustment_rub numeric(10, 2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_pay_profiles_club_id
  ON public.trainer_pay_profiles (club_id);

COMMENT ON TABLE public.trainer_pay_profiles IS
  'Кабинет тренера: on_plan (уровни по порогам клуба) / без плана (= ур.3); rate_adjustment_rub ± к ставке за тренировку.';
COMMENT ON COLUMN public.trainer_pay_profiles.on_plan IS
  'true — уровень по числу тренировок месяца; false — всегда уровень 3';
COMMENT ON COLUMN public.trainer_pay_profiles.rate_adjustment_rub IS
  'Надбавка (+) или минус (−) в ₽ к ставке типа карты за каждую тренировку';

ALTER TABLE public.trainer_pay_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trainer_pay_profiles_admin ON public.trainer_pay_profiles;
CREATE POLICY trainer_pay_profiles_admin ON public.trainer_pay_profiles
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());
