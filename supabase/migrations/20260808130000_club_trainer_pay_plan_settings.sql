-- Пороги часов месяца для уровней ЗП тренера (настройки клуба).

CREATE TABLE IF NOT EXISTS public.club_trainer_pay_plan_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.club_trainer_pay_plan_settings IS
  'Пороги часов календарного месяца → уровень ставки ЗП (1–3). Ставки ₽ — на membership_types.';
COMMENT ON COLUMN public.club_trainer_pay_plan_settings.config IS
  'JSON: workouts_l2_min, workouts_l3_min (целые тренировки месяца, включительно с порога; legacy hours_* читается в коде)';

ALTER TABLE public.club_trainer_pay_plan_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_trainer_pay_plan_settings_admin ON public.club_trainer_pay_plan_settings;
CREATE POLICY club_trainer_pay_plan_settings_admin ON public.club_trainer_pay_plan_settings
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());
