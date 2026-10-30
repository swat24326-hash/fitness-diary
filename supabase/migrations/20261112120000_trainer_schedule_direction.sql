-- Направление АЗ на групповом слоте ежедневника (для «Следующей» у клиента).

ALTER TABLE public.trainer_schedule_entries
  ADD COLUMN IF NOT EXISTS direction_type_id UUID REFERENCES public.membership_types (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS trainer_schedule_group_dir_idx
  ON public.trainer_schedule_entries (trainer_id, day_date)
  WHERE kind = 'group' AND direction_type_id IS NOT NULL;

COMMENT ON COLUMN public.trainer_schedule_entries.direction_type_id IS
  'Направление АЗ (membership_types) для kind=group; для остальных категорий — NULL.';
