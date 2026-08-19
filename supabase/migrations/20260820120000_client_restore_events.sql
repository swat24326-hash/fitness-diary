-- Журнал «Вернуть из архива» для KPI reactivation (retention).

CREATE TABLE IF NOT EXISTS public.client_restore_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  trainer_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  restored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prior_archived_at TIMESTAMPTZ,
  prior_archive_reason TEXT,
  restored_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'push',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_restore_events_source_check CHECK (
    source IN ('push', 'admin_api')
  ),
  CONSTRAINT client_restore_events_prior_reason_len CHECK (
    prior_archive_reason IS NULL OR char_length(prior_archive_reason) <= 200
  )
);

CREATE INDEX IF NOT EXISTS idx_client_restore_events_club_restored
  ON public.client_restore_events (club_id, restored_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_restore_events_client
  ON public.client_restore_events (client_id, restored_at DESC);

COMMENT ON TABLE public.client_restore_events IS
  'Restore клиента (archived_at → null). Service role при push; чтение — admin / API retention.';

ALTER TABLE public.client_restore_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_client_restore_events_admin_all ON public.client_restore_events;
DROP POLICY IF EXISTS fit_client_restore_events_sales_manager_read ON public.client_restore_events;

CREATE POLICY fit_client_restore_events_admin_all
  ON public.client_restore_events
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_client_restore_events_sales_manager_read
  ON public.client_restore_events
  FOR SELECT
  TO authenticated
  USING (
    public.fit_auth_is_sales_manager()
    AND club_id IS NOT NULL
    AND club_id = public.fit_auth_sales_manager_club_id()
  );
