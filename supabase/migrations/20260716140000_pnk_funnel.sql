-- Воронка ПНК: поля на clients + флаг пробного типа абонемента (БЗ)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'active';

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_lifecycle_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_lifecycle_check
  CHECK (lifecycle IN ('active', 'pnk', 'pnk_lost'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pnk_stage text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_pnk_stage_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_pnk_stage_check
  CHECK (
    pnk_stage IS NULL
    OR pnk_stage IN ('new', 'assigned', 'contact', 'agreed', 'trial_done', 'won', 'lost')
  );

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_source text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_trial_date date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_trial_time text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_comment text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_comments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_deliverables jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_won_at timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_lost_at timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_lost_reason text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pnk_created_at timestamptz;

COMMENT ON COLUMN public.clients.lifecycle IS
  'active — обычный клиент; pnk — в воронке; pnk_lost — отказ без оформления';
COMMENT ON COLUMN public.clients.pnk_stage IS
  'Этап воронки ПНК: new → assigned → contact → agreed → trial_done → won|lost';
COMMENT ON COLUMN public.clients.pnk_deliverables IS
  'Чеклист: contact, trial, nutrition, homework (+ позже tpi и др.) — ISO-даты';

CREATE INDEX IF NOT EXISTS idx_clients_club_lifecycle
  ON public.clients (club_id, lifecycle);

CREATE INDEX IF NOT EXISTS idx_clients_club_pnk_stage
  ON public.clients (club_id, pnk_stage)
  WHERE lifecycle = 'pnk';

ALTER TABLE public.membership_types
  ADD COLUMN IF NOT EXISTS is_pnk_trial boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.membership_types.is_pnk_trial IS
  'БЗ / пробная ПНК: неплатный, не считать как ДК в статистике активных';
