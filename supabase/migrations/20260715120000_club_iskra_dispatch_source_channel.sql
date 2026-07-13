-- Планёрка O1: канал постановки и контекст задания (ручные и контекстные).

ALTER TABLE public.club_iskra_dispatch
  ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS context_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.club_iskra_dispatch
  DROP CONSTRAINT IF EXISTS club_iskra_dispatch_source_channel_check;

ALTER TABLE public.club_iskra_dispatch
  ADD CONSTRAINT club_iskra_dispatch_source_channel_check
  CHECK (
    source_channel IN (
      '',
      'manual_app',
      'iskra_insight_card',
      'client_card',
      'sales_report',
      'week_checklist',
      'auto_trigger'
    )
  );

CREATE INDEX IF NOT EXISTS club_iskra_dispatch_source_channel_idx
  ON public.club_iskra_dispatch (club_id, source_channel, created_at DESC);

COMMENT ON COLUMN public.club_iskra_dispatch.source_channel IS
  'Канал постановки: manual_app, iskra_insight_card, client_card, sales_report, week_checklist, auto_trigger';
COMMENT ON COLUMN public.club_iskra_dispatch.context_json IS
  'Контекст задания (client_id, report_date и т.д.) — для deep-link и O2';
