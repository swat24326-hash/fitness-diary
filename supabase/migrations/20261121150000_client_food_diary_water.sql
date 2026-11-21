-- Вода за день (мл) для дневника калорий /me.
CREATE TABLE IF NOT EXISTS public.client_food_diary_water (
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  ml INTEGER NOT NULL DEFAULT 0
    CHECK (ml >= 0 AND ml <= 8000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, entry_date)
);

CREATE INDEX IF NOT EXISTS client_food_diary_water_club_date_idx
  ON public.client_food_diary_water (club_id, entry_date DESC);

COMMENT ON TABLE public.client_food_diary_water IS
  'Вода (мл) за день; пишет /api/client-me при food_diary_enabled';

ALTER TABLE public.client_food_diary_water ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_food_diary_water FROM PUBLIC;
DO $$
BEGIN
  BEGIN
    EXECUTE 'REVOKE ALL ON public.client_food_diary_water FROM anon';
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'REVOKE ALL ON public.client_food_diary_water FROM authenticated';
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;
