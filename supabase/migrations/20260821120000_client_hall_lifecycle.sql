-- Жизнь клиента по направлениям (ПЗ/ТЗ/АЗ): закрытие зала ≠ архив клуба.

CREATE TABLE IF NOT EXISTS public.client_hall_lifecycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  hall TEXT NOT NULL,
  closed_at TIMESTAMPTZ,
  close_reason TEXT,
  close_reason_at TIMESTAMPTZ,
  expected_return_on DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_hall_lifecycle_hall_check CHECK (hall IN ('pz', 'tz', 'az')),
  CONSTRAINT client_hall_lifecycle_client_hall_uq UNIQUE (client_id, hall),
  CONSTRAINT client_hall_lifecycle_reason_len CHECK (
    close_reason IS NULL OR char_length(close_reason) <= 200
  )
);

CREATE INDEX IF NOT EXISTS idx_client_hall_lifecycle_club_hall
  ON public.client_hall_lifecycle (club_id, hall);

CREATE INDEX IF NOT EXISTS idx_client_hall_lifecycle_client
  ON public.client_hall_lifecycle (client_id);

CREATE INDEX IF NOT EXISTS idx_client_hall_lifecycle_closed
  ON public.client_hall_lifecycle (club_id, hall, closed_at)
  WHERE closed_at IS NOT NULL;

COMMENT ON TABLE public.client_hall_lifecycle IS
  'Закрытие направления ПЗ/ТЗ/АЗ. Архив клуба = clients.archived_at.';

ALTER TABLE public.client_hall_lifecycle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_client_hall_lifecycle_admin_all ON public.client_hall_lifecycle;
DROP POLICY IF EXISTS fit_client_hall_lifecycle_trainer_select ON public.client_hall_lifecycle;
DROP POLICY IF EXISTS fit_client_hall_lifecycle_trainer_write ON public.client_hall_lifecycle;
DROP POLICY IF EXISTS fit_client_hall_lifecycle_sales_manager ON public.client_hall_lifecycle;
DROP POLICY IF EXISTS fit_client_hall_lifecycle_supervisor ON public.client_hall_lifecycle;

CREATE POLICY fit_client_hall_lifecycle_admin_all
  ON public.client_hall_lifecycle
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_client_hall_lifecycle_trainer_select
  ON public.client_hall_lifecycle
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_id
        AND c.trainer_id = auth.uid()
    )
  );

CREATE POLICY fit_client_hall_lifecycle_trainer_write
  ON public.client_hall_lifecycle
  FOR ALL
  TO authenticated
  USING (
    hall = 'pz'
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_id
        AND c.trainer_id = auth.uid()
    )
  )
  WITH CHECK (
    hall = 'pz'
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_id
        AND c.trainer_id = auth.uid()
    )
  );

CREATE POLICY fit_client_hall_lifecycle_sales_manager
  ON public.client_hall_lifecycle
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

CREATE POLICY fit_client_hall_lifecycle_supervisor
  ON public.client_hall_lifecycle
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_supervisor()
    AND club_id IS NOT NULL
    AND club_id = public.fit_auth_supervisor_club_id()
  )
  WITH CHECK (
    public.fit_auth_is_supervisor()
    AND club_id IS NOT NULL
    AND club_id = public.fit_auth_supervisor_club_id()
  );
