-- Журнал воронки ПНК без ПДн: отказ учитывается в статистике после удаления карточки.

CREATE TABLE IF NOT EXISTS public.pnk_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'lost',
  entered_at TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  had_nutrition BOOLEAN NOT NULL DEFAULT false,
  had_homework BOOLEAN NOT NULL DEFAULT false,
  trial_done BOOLEAN NOT NULL DEFAULT false,
  package_done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pnk_funnel_events_type_check CHECK (event_type IN ('lost')),
  CONSTRAINT pnk_funnel_events_reason_len CHECK (reason IS NULL OR char_length(reason) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_pnk_funnel_events_club_occurred
  ON public.pnk_funnel_events (club_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_pnk_funnel_events_club_entered
  ON public.pnk_funnel_events (club_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_pnk_funnel_events_trainer_occurred
  ON public.pnk_funnel_events (trainer_id, occurred_at DESC);

COMMENT ON TABLE public.pnk_funnel_events IS
  'Анонимный журнал ПНК (отказ): клуб/тренер/даты/флаги пакета — без имени и телефона.';

ALTER TABLE public.pnk_funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_pnk_funnel_events_admin_all ON public.pnk_funnel_events;
DROP POLICY IF EXISTS fit_pnk_funnel_events_trainer_read ON public.pnk_funnel_events;
DROP POLICY IF EXISTS fit_pnk_funnel_events_trainer_insert ON public.pnk_funnel_events;

CREATE POLICY fit_pnk_funnel_events_admin_all
  ON public.pnk_funnel_events
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_pnk_funnel_events_trainer_read
  ON public.pnk_funnel_events
  FOR SELECT
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND trainer_id = auth.uid()
  );

CREATE POLICY fit_pnk_funnel_events_trainer_insert
  ON public.pnk_funnel_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND trainer_id = auth.uid()
    AND club_id = public.fit_auth_trainer_club_id()
  );
