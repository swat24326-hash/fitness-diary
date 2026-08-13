-- Облачный журнал клубных звонков (Мои Звонки calls.make_call).

CREATE TABLE IF NOT EXISTS public.club_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  sent_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_call_log_status_check CHECK (status IN ('ok', 'fail')),
  CONSTRAINT club_call_log_phone_len CHECK (
    phone IS NULL OR char_length(phone) <= 20
  ),
  CONSTRAINT club_call_log_error_len CHECK (
    error_message IS NULL OR char_length(error_message) <= 200
  )
);

CREATE INDEX IF NOT EXISTS idx_club_call_log_club_created
  ON public.club_call_log (club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_call_log_club_client_created
  ON public.club_call_log (club_id, client_id, created_at DESC);

COMMENT ON TABLE public.club_call_log IS
  'Журнал исходящих звонков клуба через Мои Звонки (команда API ok/fail).';

ALTER TABLE public.club_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_club_call_log_admin_all ON public.club_call_log;
DROP POLICY IF EXISTS fit_club_call_log_sales_manager ON public.club_call_log;

CREATE POLICY fit_club_call_log_admin_all
  ON public.club_call_log
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_club_call_log_sales_manager
  ON public.club_call_log
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
  )
  WITH CHECK (
    public.fit_auth_is_sales_manager()
    AND club_id = public.fit_auth_sales_manager_club_id()
  );
