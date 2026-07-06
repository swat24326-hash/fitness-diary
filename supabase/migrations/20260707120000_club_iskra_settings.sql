-- Настройки ЭВС «ИСКРА» на клуб (дополнение к базовому промпту в коде).

CREATE TABLE IF NOT EXISTS public.club_iskra_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  prompt_append text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_iskra_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_iskra_settings_admin ON public.club_iskra_settings;
CREATE POLICY club_iskra_settings_admin ON public.club_iskra_settings
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());
