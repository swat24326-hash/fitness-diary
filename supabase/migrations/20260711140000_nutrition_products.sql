-- Справочник продуктов питания по клубу (рацион FIT-CITY).

CREATE TABLE IF NOT EXISTS public.nutrition_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  macro_group TEXT NOT NULL,
  protein_per100 NUMERIC(6, 2) NOT NULL DEFAULT 0,
  fat_per100 NUMERIC(6, 2) NOT NULL DEFAULT 0,
  carbs_per100 NUMERIC(6, 2) NOT NULL DEFAULT 0,
  piece_grams NUMERIC(6, 2),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nutrition_products_macro_group_check CHECK (macro_group IN ('protein', 'fat', 'carbs')),
  CONSTRAINT nutrition_products_label_len CHECK (char_length(trim(label)) >= 1 AND char_length(trim(label)) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_products_club_id ON public.nutrition_products (club_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_products_club_group ON public.nutrition_products (club_id, macro_group);

COMMENT ON TABLE public.nutrition_products IS 'Продукты для рациона — свой набор каждого клуба.';

ALTER TABLE public.nutrition_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_nutrition_products_admin_all ON public.nutrition_products;
DROP POLICY IF EXISTS fit_nutrition_products_trainer_read ON public.nutrition_products;

CREATE POLICY fit_nutrition_products_admin_all
  ON public.nutrition_products
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_nutrition_products_trainer_read
  ON public.nutrition_products
  FOR SELECT
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND club_id = public.fit_auth_trainer_club_id()
    AND public.fit_auth_trainer_club_id() IS NOT NULL
    AND is_active IS NOT DISTINCT FROM true
  );
