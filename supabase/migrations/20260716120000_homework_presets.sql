-- Шаблоны домашних заданий по клубу (калькулятор ДЗ FIT-CITY).

CREATE TABLE IF NOT EXISTS public.homework_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT '',
  description TEXT,
  items JSONB NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT homework_presets_title_len CHECK (char_length(trim(title)) >= 1 AND char_length(trim(title)) <= 80),
  CONSTRAINT homework_presets_direction_len CHECK (char_length(trim(direction)) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_homework_presets_club_id ON public.homework_presets (club_id);
CREATE INDEX IF NOT EXISTS idx_homework_presets_club_active ON public.homework_presets (club_id, is_active);

COMMENT ON TABLE public.homework_presets IS 'Шаблоны ДЗ — свой набор каждого клуба; тренер применяет на планшете.';

ALTER TABLE public.homework_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_homework_presets_admin_all ON public.homework_presets;
DROP POLICY IF EXISTS fit_homework_presets_trainer_read ON public.homework_presets;

CREATE POLICY fit_homework_presets_admin_all
  ON public.homework_presets
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_homework_presets_trainer_read
  ON public.homework_presets
  FOR SELECT
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
    AND is_active IS NOT DISTINCT FROM true
  );
