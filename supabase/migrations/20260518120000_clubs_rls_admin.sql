-- RLS для clubs: чтение всем authenticated, запись/удаление — только admin (fit_auth_is_admin).
-- Выполните в SQL Editor, если удаление клуба в админке даёт permission denied.

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_clubs_select ON public.clubs;
DROP POLICY IF EXISTS fit_clubs_admin_all ON public.clubs;

CREATE POLICY fit_clubs_select
  ON public.clubs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY fit_clubs_admin_all
  ON public.clubs
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());
