-- Опциональный вес зачёта для челленджа «макс. повторения» (жим на 100 кг и т.п.).

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS reference_weight_kg NUMERIC(8, 2);

ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_reference_weight_kg_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_reference_weight_kg_check CHECK (
    reference_weight_kg IS NULL OR reference_weight_kg > 0
  );
