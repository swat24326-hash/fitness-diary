-- Планёрка: циклические задания (серия + интервал повтора).

ALTER TABLE public.club_iskra_dispatch
  ADD COLUMN IF NOT EXISTS series_id uuid,
  ADD COLUMN IF NOT EXISTS recurrence_interval integer,
  ADD COLUMN IF NOT EXISTS recurrence_unit text;

ALTER TABLE public.club_iskra_dispatch
  DROP CONSTRAINT IF EXISTS club_iskra_dispatch_recurrence_unit_check;

ALTER TABLE public.club_iskra_dispatch
  ADD CONSTRAINT club_iskra_dispatch_recurrence_unit_check
  CHECK (recurrence_unit IS NULL OR recurrence_unit IN ('day', 'week', 'month'));

CREATE INDEX IF NOT EXISTS club_iskra_dispatch_series_recipient_idx
  ON public.club_iskra_dispatch (series_id, recipient_user_id, status)
  WHERE series_id IS NOT NULL;

COMMENT ON COLUMN public.club_iskra_dispatch.series_id IS 'Идентификатор цепочки повторяющихся заданий у исполнителя';
COMMENT ON COLUMN public.club_iskra_dispatch.recurrence_interval IS 'Интервал повтора: 1 день, 3 недели и т.д.';
COMMENT ON COLUMN public.club_iskra_dispatch.recurrence_unit IS 'Единица повтора: day, week, month';
