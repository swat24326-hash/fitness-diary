-- Настройки «Качество ведения» на клуб (веса осей + тумблеры правил).

CREATE TABLE IF NOT EXISTS public.club_coach_quality_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.club_coach_quality_settings IS 'Веса и тумблеры оценки качества ведения тренеров (одинаково для админа и тренера).';
COMMENT ON COLUMN public.club_coach_quality_settings.config IS 'JSON: weightCare/Depth/Bag + toggle*';

ALTER TABLE public.club_coach_quality_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_coach_quality_settings_admin ON public.club_coach_quality_settings;
CREATE POLICY club_coach_quality_settings_admin ON public.club_coach_quality_settings
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());
