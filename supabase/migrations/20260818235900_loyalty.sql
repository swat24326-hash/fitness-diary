-- Лояльность ПЗ: настройки клуба + журнал якорей. Правда баланса — buildLoyaltyAccount на API.
-- RLS включён, политик для anon/authenticated нет: прямой PostgREST закрыт, пишет service role.

CREATE TABLE IF NOT EXISTS public.club_loyalty_settings (
  club_id UUID PRIMARY KEY REFERENCES public.clubs (id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at DATE,
  enabled_intervals JSONB NOT NULL DEFAULT '[]'::jsonb,
  cycle_months INT NOT NULL DEFAULT 3,
  points_per_week INT NOT NULL DEFAULT 50,
  kcal_chunk INT NOT NULL DEFAULT 100,
  points_per_kcal_chunk INT NOT NULL DEFAULT 5,
  max_minutes INT NOT NULL DEFAULT 60,
  max_kcal_per_training INT NOT NULL DEFAULT 800,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_loyalty_settings_cycle_months_chk CHECK (cycle_months >= 1 AND cycle_months <= 24),
  CONSTRAINT club_loyalty_settings_points_week_chk CHECK (points_per_week >= 0),
  CONSTRAINT club_loyalty_settings_kcal_chunk_chk CHECK (kcal_chunk >= 1),
  CONSTRAINT club_loyalty_settings_points_chunk_chk CHECK (points_per_kcal_chunk >= 0),
  CONSTRAINT club_loyalty_settings_max_minutes_chk CHECK (max_minutes >= 1 AND max_minutes <= 180),
  CONSTRAINT club_loyalty_settings_max_kcal_chk CHECK (max_kcal_per_training >= 0)
);

COMMENT ON TABLE public.club_loyalty_settings IS
  'Лояльность ПЗ: ставки и интервалы включения по клубу. Списание — только через admin-data.';

CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  points INT,
  comment TEXT,
  actor_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  snapshot JSONB,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_ledger_kind_chk CHECK (
    kind IN ('redeem', 'burn_archive', 'club_move', 'program_toggle', 'cycle_open')
  ),
  CONSTRAINT loyalty_ledger_comment_len CHECK (
    comment IS NULL OR char_length(comment) <= 200
  )
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_club_client_at
  ON public.loyalty_ledger (club_id, client_id, at);

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_cycle_open_uniq
  ON public.loyalty_ledger (client_id, club_id, (payload->>'cycle_start'))
  WHERE kind = 'cycle_open';

COMMENT ON TABLE public.loyalty_ledger IS
  'Якоря лояльности (redeem / архив / переезд / cycle_open). Не очередь sync.';

ALTER TABLE public.club_loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
