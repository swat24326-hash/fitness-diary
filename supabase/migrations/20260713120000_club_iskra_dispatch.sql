-- ИСКРА Dispatch: внутренние сообщения и задачи сотрудникам клуба.

CREATE TABLE IF NOT EXISTS public.club_iskra_dispatch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'task' CHECK (kind IN ('message', 'task')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'dismissed')),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('iskra_insight', 'iskra_manual', 'admin')),
  insight_key text NOT NULL DEFAULT '',
  period_year integer,
  period_month integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS club_iskra_dispatch_recipient_idx
  ON public.club_iskra_dispatch (recipient_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS club_iskra_dispatch_club_sender_idx
  ON public.club_iskra_dispatch (club_id, sender_user_id, created_at DESC);

COMMENT ON TABLE public.club_iskra_dispatch IS
  'Сообщения и задачи от ИСКРЫ/админа сотрудникам клуба (тренеры, позже управляющие).';

ALTER TABLE public.club_iskra_dispatch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_iskra_dispatch_admin ON public.club_iskra_dispatch;
CREATE POLICY club_iskra_dispatch_admin ON public.club_iskra_dispatch
  FOR ALL
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

DROP POLICY IF EXISTS club_iskra_dispatch_recipient_read ON public.club_iskra_dispatch;
CREATE POLICY club_iskra_dispatch_recipient_read ON public.club_iskra_dispatch
  FOR SELECT
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS club_iskra_dispatch_recipient_update ON public.club_iskra_dispatch;
CREATE POLICY club_iskra_dispatch_recipient_update ON public.club_iskra_dispatch
  FOR UPDATE
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());
