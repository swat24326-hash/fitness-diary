-- Облачный журнал клубных SMS (Мои Звонки): кто / кому / когда / сценарий.

CREATE TABLE IF NOT EXISTS public.club_sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  sent_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  scenario TEXT NOT NULL DEFAULT 'custom',
  message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_sms_log_scenario_check CHECK (
    scenario IN ('birthdays', 'expiring', 'expired_recent', 'stale', 'custom')
  ),
  CONSTRAINT club_sms_log_preview_len CHECK (
    message_preview IS NULL OR char_length(message_preview) <= 200
  )
);

CREATE INDEX IF NOT EXISTS idx_club_sms_log_club_created
  ON public.club_sms_log (club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_sms_log_club_client_created
  ON public.club_sms_log (club_id, client_id, created_at DESC);

COMMENT ON TABLE public.club_sms_log IS
  'Журнал SMS клуба через Мои Звонки: общий для админа и менеджеров клуба.';

ALTER TABLE public.club_sms_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_club_sms_log_admin_all ON public.club_sms_log;
DROP POLICY IF EXISTS fit_club_sms_log_sales_manager ON public.club_sms_log;

CREATE POLICY fit_club_sms_log_admin_all
  ON public.club_sms_log
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_club_sms_log_sales_manager
  ON public.club_sms_log
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
