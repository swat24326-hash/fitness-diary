-- Ежедневник: категория записи (цвет в сетке). NULL = по умолчанию (клиенты → тренировка, заметка → личное).
-- Накатывать ДО выкатки кода: новый клиент шлёт поле kind в push-record.

ALTER TABLE public.trainer_schedule_entries
  ADD COLUMN IF NOT EXISTS kind TEXT NULL;

ALTER TABLE public.trainer_schedule_entries
  DROP CONSTRAINT IF EXISTS trainer_schedule_kind_values;

ALTER TABLE public.trainer_schedule_entries
  ADD CONSTRAINT trainer_schedule_kind_values
  CHECK (kind IS NULL OR kind IN ('training', 'group', 'trial', 'work', 'personal'));

COMMENT ON COLUMN public.trainer_schedule_entries.kind IS
  'Категория: training | group | trial | work | personal; NULL — по умолчанию от client_ids.';
