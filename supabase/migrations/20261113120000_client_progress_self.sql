-- Клиент в /me сам вносит вес (source=client) и обмеры (body_measurements.source).

ALTER TABLE public.client_weight_entries DROP CONSTRAINT IF EXISTS client_weight_entries_source_check;
ALTER TABLE public.client_weight_entries
  ADD CONSTRAINT client_weight_entries_source_check
  CHECK (source IN ('manual', 'training', 'initial_adjust', 'baseline', 'client'));

COMMENT ON COLUMN public.client_weight_entries.source IS
  'manual | training | baseline | initial_adjust (клуб) | client (клиент в /me)';

DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN source TEXT NOT NULL DEFAULT 'club';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.body_measurements DROP CONSTRAINT IF EXISTS body_measurements_source_check;
ALTER TABLE public.body_measurements
  ADD CONSTRAINT body_measurements_source_check
  CHECK (source IN ('club', 'client'));

COMMENT ON COLUMN public.body_measurements.source IS
  'club — тренер/карточка; client — клиент в /me';
