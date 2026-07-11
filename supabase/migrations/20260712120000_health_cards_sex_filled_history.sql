-- Пол, дата составления карты здоровья, история рационов; baseline в истории веса.
-- Идемпотентно.

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN sex TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN health_filled_at DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN nutrition_plan_history JSONB NOT NULL DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.health_cards DROP CONSTRAINT IF EXISTS health_cards_sex_check;
ALTER TABLE public.health_cards
  ADD CONSTRAINT health_cards_sex_check CHECK (sex IS NULL OR sex IN ('male', 'female'));

COMMENT ON COLUMN public.health_cards.sex IS 'Пол клиента для ИМТ, питания и карты здоровья.';
COMMENT ON COLUMN public.health_cards.health_filled_at IS 'Дата составления карты здоровья; исходный вес привязан к этой дате.';
COMMENT ON COLUMN public.health_cards.nutrition_plan_history IS 'Снимки предыдущих рационов (JSON-массив, до 20 записей на клиенте).';

-- Расширяем source: baseline вместо повторных initial_adjust.
ALTER TABLE public.client_weight_entries DROP CONSTRAINT IF EXISTS client_weight_entries_source_check;
ALTER TABLE public.client_weight_entries
  ADD CONSTRAINT client_weight_entries_source_check
  CHECK (source IN ('manual', 'training', 'initial_adjust', 'baseline'));

COMMENT ON COLUMN public.client_weight_entries.source IS 'manual | training | baseline (исходный на дату карты) | initial_adjust (legacy).';
