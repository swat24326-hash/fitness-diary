-- Опционально: явный тип «Списание» (API уже нормализует в «Силовая» + data.is_writeoff).
ALTER TABLE public.trainings DROP CONSTRAINT IF EXISTS trainings_type_check;
ALTER TABLE public.trainings ADD CONSTRAINT trainings_type_check
  CHECK (type IN ('Силовая', 'Функциональная', 'Кардио', 'Смешанная', 'Списание'));
