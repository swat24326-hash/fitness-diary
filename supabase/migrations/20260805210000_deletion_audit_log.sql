-- Журнал удалений: кто / когда / кого (после hard delete карточки след остаётся).

CREATE TABLE IF NOT EXISTS public.deletion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES public.clubs (id) ON DELETE SET NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT,
  entity_card_number TEXT,
  entity_phone TEXT,
  trainer_id UUID,
  trainer_name TEXT,
  deleted_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  deleted_by_name TEXT,
  deleted_by_role TEXT,
  source TEXT NOT NULL DEFAULT 'push',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deletion_audit_log_table_check CHECK (
    entity_table IN ('clients')
  ),
  CONSTRAINT deletion_audit_log_source_check CHECK (
    source IN ('push', 'pnk_api', 'admin_api')
  ),
  CONSTRAINT deletion_audit_log_name_len CHECK (
    entity_name IS NULL OR char_length(entity_name) <= 200
  )
);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_club_created
  ON public.deletion_audit_log (club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_created
  ON public.deletion_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_entity
  ON public.deletion_audit_log (entity_table, entity_id);

COMMENT ON TABLE public.deletion_audit_log IS
  'Журнал жёстких удалений (MVP: clients). Пишет service role при push/API; UI — админ.';

ALTER TABLE public.deletion_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_deletion_audit_log_admin_all ON public.deletion_audit_log;
DROP POLICY IF EXISTS fit_deletion_audit_log_sales_manager_read ON public.deletion_audit_log;

CREATE POLICY fit_deletion_audit_log_admin_all
  ON public.deletion_audit_log
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

-- Менеджер клуба — только чтение своего клуба (вопросы «кто удалил» на ресепшене).
CREATE POLICY fit_deletion_audit_log_sales_manager_read
  ON public.deletion_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.fit_auth_is_sales_manager()
    AND club_id IS NOT NULL
    AND club_id = public.fit_auth_sales_manager_club_id()
  );
