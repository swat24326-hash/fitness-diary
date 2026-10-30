-- Инструкторы АЗ: клиент ↔ несколько инструкторов по направлениям (не clients.trainer_id).

CREATE TABLE IF NOT EXISTS public.client_az_instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  direction_type_id UUID NOT NULL REFERENCES public.membership_types (id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_az_instructors_client_instructor_direction_uq
    UNIQUE (client_id, instructor_id, direction_type_id)
);

CREATE INDEX IF NOT EXISTS idx_client_az_instructors_club
  ON public.client_az_instructors (club_id);

CREATE INDEX IF NOT EXISTS idx_client_az_instructors_client
  ON public.client_az_instructors (client_id);

CREATE INDEX IF NOT EXISTS idx_client_az_instructors_instructor
  ON public.client_az_instructors (instructor_id);

COMMENT ON TABLE public.client_az_instructors IS
  'Инструкторы АЗ клиента по направлению (Бокс/Степ…). Не путать с clients.trainer_id (ПЗ).';

ALTER TABLE public.client_az_instructors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_client_az_instructors_admin_all ON public.client_az_instructors;
DROP POLICY IF EXISTS fit_client_az_instructors_sales_manager ON public.client_az_instructors;
DROP POLICY IF EXISTS fit_client_az_instructors_instructor_select ON public.client_az_instructors;

CREATE POLICY fit_client_az_instructors_admin_all
  ON public.client_az_instructors
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_client_az_instructors_sales_manager
  ON public.client_az_instructors
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_sales_manager()
    AND club_id IS NOT NULL
    AND club_id = public.fit_auth_sales_manager_club_id()
  )
  WITH CHECK (
    public.fit_auth_is_sales_manager()
    AND club_id IS NOT NULL
    AND club_id = public.fit_auth_sales_manager_club_id()
  );

-- Инструктор видит только свои назначения (чат / «мои АЗ» позже).
CREATE POLICY fit_client_az_instructors_instructor_select
  ON public.client_az_instructors
  FOR SELECT
  TO authenticated
  USING (instructor_id = auth.uid());
