-- Ревизия строки trainings для merge completed при pull (офлайн-тренер).
-- Без колонки сравнение шло по created_at → ничья → облако затирало зря.

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.trainings
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.trainings
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.trainings
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.fit_trainings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trainings_touch_updated_at ON public.trainings;
CREATE TRIGGER trg_trainings_touch_updated_at
  BEFORE UPDATE ON public.trainings
  FOR EACH ROW
  EXECUTE FUNCTION public.fit_trainings_touch_updated_at();

COMMENT ON COLUMN public.trainings.updated_at IS
  'Ревизия для sync merge completed; bump при UPDATE (trigger) и при push.';
