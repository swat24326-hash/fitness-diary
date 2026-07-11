-- Исходный и текущий вес в health_cards + история веса (отдельная таблица).
-- Идемпотентно.

-- --- health_cards: исходный / текущий вес ---
DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN initial_weight_kg NUMERIC(6, 2);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN current_weight_kg NUMERIC(6, 2);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.health_cards ADD COLUMN weight_updated_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE public.health_cards
SET
  initial_weight_kg = COALESCE(initial_weight_kg, weight_kg),
  current_weight_kg = COALESCE(current_weight_kg, weight_kg)
WHERE weight_kg IS NOT NULL
  AND (initial_weight_kg IS NULL OR current_weight_kg IS NULL);

COMMENT ON COLUMN public.health_cards.initial_weight_kg IS 'Исходный вес клиента (база для прогресса).';
COMMENT ON COLUMN public.health_cards.current_weight_kg IS 'Актуальный вес для ИМТ, питания и статистики.';
COMMENT ON COLUMN public.health_cards.weight_updated_at IS 'Когда последний раз обновляли текущий вес.';

-- --- client_weight_entries ---
CREATE TABLE IF NOT EXISTS public.client_weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC(6, 2) NOT NULL CHECK (weight_kg > 0),
  source TEXT NOT NULL CHECK (source IN ('manual', 'training', 'initial_adjust')),
  training_id UUID REFERENCES public.trainings (id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_weight_entries_client_date
  ON public.client_weight_entries (client_id, date DESC, created_at DESC);

COMMENT ON TABLE public.client_weight_entries IS 'История веса клиента: ручной ввод, с тренировки, корректировка исходного.';

ALTER TABLE public.client_weight_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fit_client_weight_entries_admin_all ON public.client_weight_entries;
DROP POLICY IF EXISTS fit_client_weight_entries_trainer_rw ON public.client_weight_entries;

CREATE POLICY fit_client_weight_entries_admin_all
  ON public.client_weight_entries
  FOR ALL
  TO authenticated
  USING (public.fit_auth_is_admin())
  WITH CHECK (public.fit_auth_is_admin());

CREATE POLICY fit_client_weight_entries_trainer_rw
  ON public.client_weight_entries
  FOR ALL
  TO authenticated
  USING (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_weight_entries.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  )
  WITH CHECK (
    public.fit_auth_is_trainer()
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_weight_entries.client_id
        AND c.trainer_id = auth.uid()
        AND c.club_id = public.fit_auth_trainer_club_id()
    )
    AND public.fit_auth_trainer_club_id() IS NOT NULL
  );
