-- Чип следующего шага продажи + дата перезвона (воронка звонка).

ALTER TABLE public.club_call_log
  ADD COLUMN IF NOT EXISTS staff_note_chip_id TEXT,
  ADD COLUMN IF NOT EXISTS callback_on DATE;

COMMENT ON COLUMN public.club_call_log.staff_note_chip_id IS
  'id чипа воронки звонка (clubCallFunnelChipsCore); null = свободный текст / legacy';
COMMENT ON COLUMN public.club_call_log.callback_on IS
  'Ожидаемая дата перезвона для open-чипов (callback_today / callback_later)';

CREATE INDEX IF NOT EXISTS idx_club_call_log_club_callback_on
  ON public.club_call_log (club_id, callback_on)
  WHERE callback_on IS NOT NULL AND staff_note_chip_id IS NOT NULL;
