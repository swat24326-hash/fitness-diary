-- Приведение таблиц к полям, которые ожидает приложение (см. bodyMeasures.js, ClientOverview).
-- Идемпотентно: повторный запуск безопасен.
-- Внимание: UNIQUE(client_id) на health_cards упадёт, если в таблице уже есть дубликаты client_id — сначала объедините/удалите лишние строки.

-- --- health_cards: рост/вес (если колонок ещё не было) ---
DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN height_cm NUMERIC(6, 2);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN weight_kg NUMERIC(6, 2);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Одна медкарта на клиента (если индекса ещё нет)
CREATE UNIQUE INDEX IF NOT EXISTS health_cards_client_id_key ON public.health_cards (client_id);

-- --- body_measurements: колонки как в приложении (старые arm/waist/… можно оставить для legacy) ---
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN neck NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN arm_r NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN arm_l NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN waist_upper NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN waist_lower NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN glutes NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN thigh_r NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN thigh_l NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN calf_r NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.body_measurements ADD COLUMN calf_l NUMERIC(6, 1);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_body_measurements_client_date ON public.body_measurements (client_id, date DESC);

-- --- clients: дата рождения и номер карты ---
DO $$
BEGIN
  ALTER TABLE public.clients ADD COLUMN birth_date DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.clients ADD COLUMN card_number TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
