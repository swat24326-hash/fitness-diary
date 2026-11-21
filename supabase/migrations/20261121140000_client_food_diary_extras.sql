-- Сводка Premium-уровня: клетчатка, сахар, натрий (соль считают на клиенте ×2.5).

ALTER TABLE public.client_food_diary_entries
  ADD COLUMN IF NOT EXISTS fiber_g NUMERIC(8, 1) NOT NULL DEFAULT 0;

ALTER TABLE public.client_food_diary_entries
  ADD COLUMN IF NOT EXISTS sugar_g NUMERIC(8, 1) NOT NULL DEFAULT 0;

ALTER TABLE public.client_food_diary_entries
  ADD COLUMN IF NOT EXISTS sodium_mg NUMERIC(10, 1) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.client_food_diary_entries.fiber_g IS 'Клетчатка, г в порции';
COMMENT ON COLUMN public.client_food_diary_entries.sugar_g IS 'Сахар, г в порции';
COMMENT ON COLUMN public.client_food_diary_entries.sodium_mg IS 'Натрий, мг в порции (соль ≈ ×2.5 / 1000 г)';
