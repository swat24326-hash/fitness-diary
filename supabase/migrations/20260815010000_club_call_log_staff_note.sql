-- Пометка сотрудника к звонку (смысл разговора, не исход webhook).

ALTER TABLE public.club_call_log
  ADD COLUMN IF NOT EXISTS staff_note TEXT,
  ADD COLUMN IF NOT EXISTS staff_note_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staff_note_by UUID REFERENCES public.users (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_call_log_staff_note_len'
  ) THEN
    ALTER TABLE public.club_call_log
      ADD CONSTRAINT club_call_log_staff_note_len
      CHECK (staff_note IS NULL OR char_length(staff_note) <= 400);
  END IF;
END $$;

COMMENT ON COLUMN public.club_call_log.staff_note IS
  'Ручная пометка менеджера/админа к звонку (до 400 символов)';
COMMENT ON COLUMN public.club_call_log.staff_note_at IS
  'Когда сохранили staff_note';
COMMENT ON COLUMN public.club_call_log.staff_note_by IS
  'Кто сохранил staff_note';
