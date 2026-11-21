-- Свои цели КБЖУ клиента для дневника калорий (/me). Пишет только /api/client-me.
CREATE TABLE IF NOT EXISTS public.client_food_diary_targets (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  kcal INTEGER NOT NULL
    CHECK (kcal BETWEEN 800 AND 5000),
  protein_g INTEGER NOT NULL
    CHECK (protein_g BETWEEN 10 AND 400),
  fat_g INTEGER NOT NULL
    CHECK (fat_g BETWEEN 10 AND 400),
  carbs_g INTEGER NOT NULL
    CHECK (carbs_g BETWEEN 10 AND 400),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_food_diary_targets IS
  'Свои цели КБЖУ клиента (АЗ/ТЗ; запас если нет рациона). Только client-me.';

ALTER TABLE public.client_food_diary_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_food_diary_targets FROM PUBLIC;
DO $$
BEGIN
  BEGIN
    EXECUTE 'REVOKE ALL ON public.client_food_diary_targets FROM anon';
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'REVOKE ALL ON public.client_food_diary_targets FROM authenticated';
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;
