-- Рацион FIT-CITY: опрос и снимок плана в медкарте (одна запись на client_id).

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN nutrition_survey jsonb;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN nutrition_plan jsonb;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN nutrition_plan_generated_at timestamptz;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN public.health_cards.nutrition_survey IS 'Ответы мастера питания: активность, приёмы, выбранные продукты.';
COMMENT ON COLUMN public.health_cards.nutrition_plan IS 'Снимок мерного рациона на день (ккал, БЖУ, приёмы).';
COMMENT ON COLUMN public.health_cards.nutrition_plan_generated_at IS 'Когда собран рацион.';
