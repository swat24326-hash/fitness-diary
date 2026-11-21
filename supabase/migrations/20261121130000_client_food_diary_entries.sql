-- Дневник калорий клиента: факт «что съел» (не рацион тренера).
-- Пишет только сервер через /api/client-me; доступ при clubs.food_diary_enabled.

CREATE TABLE IF NOT EXISTS public.client_food_diary_entries (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  meal_key TEXT NOT NULL CHECK (meal_key IN ('breakfast', 'lunch', 'dinner', 'snack')),
  name TEXT NOT NULL,
  grams NUMERIC(8, 1),
  kcal NUMERIC(8, 1) NOT NULL DEFAULT 0,
  protein_g NUMERIC(8, 1) NOT NULL DEFAULT 0,
  fat_g NUMERIC(8, 1) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(8, 1) NOT NULL DEFAULT 0,
  catalog_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_food_diary_entries_name_len CHECK (char_length(name) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS client_food_diary_entries_client_date_idx
  ON public.client_food_diary_entries (client_id, entry_date DESC);

COMMENT ON TABLE public.client_food_diary_entries IS
  'Дневник калорий /me: снимок КБЖУ в строке; catalog_id — внешний каталог позже';

ALTER TABLE public.client_food_diary_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_food_diary_entries FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.client_food_diary_entries FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.client_food_diary_entries FROM authenticated';
  END IF;
END $$;
